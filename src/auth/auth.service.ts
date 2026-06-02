import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { createHash } from 'crypto';
import { JwtService } from '@nestjs/jwt';

import {
  getJwtExpiresIn,
  getRefreshTokenExpiresIn,
  getRefreshTokenSecret,
} from '../config/env';
import { AuditLogInput, AuditService } from '../security/audit.service';
import { UsersService } from '../users/users.service';

type DevLoginUser = {
  email: string;
  password: string;
  name: string;
  role: 'CLIENT' | 'PROFESSIONAL' | 'ADMIN';
};

const DEV_LOGIN_PASSWORD = '12345678';
const DEV_LOGIN_USERS: DevLoginUser[] = [
  {
    email: 'fernandescliente@gmail.com',
    password: DEV_LOGIN_PASSWORD,
    name: 'Cliente Fernandes',
    role: 'CLIENT',
  },
  {
    email: 'fernandesprofissional@gmail.com',
    password: DEV_LOGIN_PASSWORD,
    name: 'Profissional Fernandes',
    role: 'PROFESSIONAL',
  },
  {
    email: 'fernandesadmin@gmail.com',
    password: DEV_LOGIN_PASSWORD,
    name: 'Admin Fernandes',
    role: 'ADMIN',
  },
];

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly revokedRefreshTokens = new Set<string>();

  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private auditService: AuditService,
  ) {}

  async register(data: any) {
    const email = this.requireEmail(data?.email);
    const password = this.requirePassword(data?.password);
    const name = this.requireString(data?.name, 'name obrigatorio');
    const role = this.normalizeRole(data?.role);
    const professionalCategory = this.readString(data?.professionalCategory);
    const professionalSpecialties = this.readStringList(
      data?.professionalSpecialties ?? data?.specialties,
    );

    if (
      role === 'PROFESSIONAL' &&
      professionalCategory &&
      professionalSpecialties.length === 0
    ) {
      throw new BadRequestException(
        'Escolha pelo menos uma especialidade profissional',
      );
    }

    const hashed = await bcrypt.hash(password, 10);

    const user = await this.usersService.create({
      email,
      name,
      role,
      password: hashed,
    });

    await this.safeAudit('AUTH_REGISTERED', {
      userId: user.id,
      action: 'AUTH_REGISTERED',
      details: {
        role: user.role,
        professionalCategory,
        professionalSpecialties,
      },
    });

    if (role === 'PROFESSIONAL' && professionalSpecialties.length > 0) {
      await this.safeAudit('PROFESSIONAL_SPECIALTIES_REGISTERED', {
        userId: user.id,
        action: 'PROFESSIONAL_SPECIALTIES_REGISTERED',
        details: {
          professionalCategory,
          professionalSpecialties,
        },
      });
    }

    return this.publicUser(user);
  }

  async login(email: string, password: string) {
    const normalizedEmail = this.requireEmail(email);
    const normalizedPassword = this.requirePassword(password);
    let user = await this.usersService.findByEmail(normalizedEmail);

    if (!user) {
      user = await this.ensureDevLoginUser(normalizedEmail);
    }

    if (!user) {
      await this.safeAudit('AUTH_LOGIN_FAILED', {
        action: 'AUTH_LOGIN_FAILED',
        details: {
          reason: 'USER_NOT_FOUND',
          email: normalizedEmail,
        },
      });
      throw new UnauthorizedException('Credenciais invalidas');
    }

    let isMatch = await this.comparePassword(normalizedPassword, user.password);

    if (
      !isMatch &&
      this.canResetDevPassword(normalizedEmail, normalizedPassword)
    ) {
      user = await this.resetDevLoginPassword(user, normalizedEmail);
      isMatch = true;
    }

    if (!user) {
      throw new UnauthorizedException('Credenciais invalidas');
    }

    if (!isMatch) {
      await this.safeAudit('AUTH_LOGIN_FAILED', {
        userId: user.id,
        action: 'AUTH_LOGIN_FAILED',
        details: {
          reason: 'PASSWORD_MISMATCH',
        },
      });
      throw new UnauthorizedException('Credenciais invalidas');
    }

    const tokens = this.issueTokens(user);

    await this.safeAudit('AUTH_LOGIN_SUCCEEDED', {
      userId: user.id,
      action: 'AUTH_LOGIN_SUCCEEDED',
      details: {
        role: user.role,
      },
    });

    return {
      access_token: tokens.accessToken,
      token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      expires_in: getJwtExpiresIn(),
      refresh_expires_in: getRefreshTokenExpiresIn(),
      user: this.publicUser(user),
    };
  }

  async devSeed() {
    if (!this.isDevelopment()) {
      throw new BadRequestException(
        'Seed dev disponivel apenas em development',
      );
    }

    const result: any[] = [];

    for (const item of DEV_LOGIN_USERS) {
      const email = this.requireEmail(item.email);
      const existing = await this.usersService.findByEmail(email);

      if (existing) {
        const passwordMatches = await this.comparePassword(
          item.password,
          existing.password,
        );
        const needsProfileUpdate =
          existing.name !== item.name || existing.role !== item.role;
        const updates: Record<string, any> = {};

        if (!passwordMatches) {
          updates.password = await bcrypt.hash(item.password, 10);
        }

        if (needsProfileUpdate) {
          updates.name = item.name;
          updates.role = item.role;
        }

        const user =
          Object.keys(updates).length > 0
            ? await this.usersService.update(existing.id, updates)
            : existing;

        result.push({
          email,
          role: user.role,
          status: Object.keys(updates).length > 0 ? 'updated' : 'exists',
        });
        continue;
      }

      const hashed = await bcrypt.hash(item.password, 10);

      const user = await this.usersService.create({
        email,
        name: item.name,
        role: item.role,
        password: hashed,
      });

      await this.safeAudit('AUTH_DEV_TEST_USER_CREATED', {
        userId: user.id,
        action: 'AUTH_DEV_TEST_USER_CREATED',
        details: {
          role: user.role,
          purpose: 'login-dev-local',
          removeBeforeProduction: true,
        },
      });

      result.push({
        email,
        role: user.role,
        status: 'created',
      });
    }

    return {
      success: true,
      message: 'Usuarios de teste dev prontos.',
      password: DEV_LOGIN_PASSWORD,
      users: result,
      warning: 'Remover/desabilitar esta rota antes da producao real.',
    };
  }

  async refresh(refreshToken: string) {
    const token = this.readString(refreshToken);

    if (!token) {
      throw new BadRequestException('refreshToken obrigatorio');
    }

    if (this.revokedRefreshTokens.has(this.tokenDigest(token))) {
      throw new UnauthorizedException('Refresh token revogado');
    }

    let payload: any;

    try {
      payload = this.jwtService.verify(token, {
        secret: getRefreshTokenSecret(),
      });
    } catch {
      throw new UnauthorizedException('Refresh token invalido');
    }

    if (payload?.type !== 'refresh' || !payload?.sub) {
      throw new UnauthorizedException('Refresh token invalido');
    }

    const user = await this.usersService.findById(payload.sub);

    if (!user) {
      throw new UnauthorizedException('Usuario nao encontrado');
    }

    this.revokedRefreshTokens.add(this.tokenDigest(token));

    const tokens = this.issueTokens(user);

    await this.safeAudit('AUTH_TOKEN_REFRESHED', {
      userId: user.id,
      action: 'AUTH_TOKEN_REFRESHED',
      details: {
        role: user.role,
        rotated: true,
      },
    });

    return {
      success: true,
      access_token: tokens.accessToken,
      token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      expires_in: getJwtExpiresIn(),
      refresh_expires_in: getRefreshTokenExpiresIn(),
      user: this.publicUser(user),
    };
  }

  async revoke(refreshToken?: string, actor?: any) {
    const token = this.readString(refreshToken);

    if (token) {
      this.revokedRefreshTokens.add(this.tokenDigest(token));
    }

    await this.safeAudit('AUTH_SESSION_REVOKED', {
      userId: this.readString(actor?.userId),
      action: 'AUTH_SESSION_REVOKED',
      details: {
        refreshTokenProvided: Boolean(token),
      },
    });

    return {
      success: true,
      revoked: true,
      refreshTokenProvided: Boolean(token),
      timestamp: new Date().toISOString(),
    };
  }

  private isDevelopment() {
    return process.env.NODE_ENV === 'development';
  }

  private findDevLoginUser(email: string) {
    if (!this.isDevelopment()) {
      return undefined;
    }

    return DEV_LOGIN_USERS.find((user) => user.email === email);
  }

  private canResetDevPassword(email: string, password: string) {
    return (
      password === DEV_LOGIN_PASSWORD && Boolean(this.findDevLoginUser(email))
    );
  }

  private async ensureDevLoginUser(email: string) {
    const data = this.findDevLoginUser(email);

    if (!data) {
      return null;
    }

    const hashed = await bcrypt.hash(data.password, 10);
    const user = await this.usersService.create({
      email,
      name: data.name,
      role: data.role,
      password: hashed,
    });

    await this.safeAudit('AUTH_DEV_TEST_USER_AUTO_CREATED', {
      userId: user.id,
      action: 'AUTH_DEV_TEST_USER_AUTO_CREATED',
      details: {
        role: user.role,
        autoCreated: true,
        removeBeforeProduction: true,
      },
    });

    return user;
  }

  private async resetDevLoginPassword(user: any, email: string) {
    const data = this.findDevLoginUser(email);

    if (!data) {
      return user;
    }

    const updated = await this.usersService.update(user.id, {
      name: data.name,
      role: data.role,
      password: await bcrypt.hash(data.password, 10),
    });

    await this.safeAudit('AUTH_DEV_TEST_USER_PASSWORD_RESET', {
      userId: updated.id,
      action: 'AUTH_DEV_TEST_USER_PASSWORD_RESET',
      details: {
        role: updated.role,
        email: updated.email,
        developmentOnly: true,
      },
    });

    return updated;
  }

  private async comparePassword(password: string, hash: string) {
    try {
      return await bcrypt.compare(password, hash);
    } catch (error: any) {
      this.logger.warn(
        `Falha ao comparar senha: ${error?.message ?? 'erro desconhecido'}`,
      );
      return false;
    }
  }

  private async safeAudit(action: string, input: AuditLogInput) {
    try {
      return await this.auditService.register(action, input);
    } catch (error: any) {
      if (this.isDevelopment()) {
        this.logger.warn(
          `AuditService falhou em dev para ${action}: ${
            error?.message ?? 'erro desconhecido'
          }`,
        );
        return null;
      }

      throw error;
    }
  }

  private issueTokens(user: any) {
    const payload = {
      sub: user.id,
      userId: user.id,
      email: user.email,
      role: user.role,
    };

    return {
      accessToken: this.jwtService.sign(payload, {
        expiresIn: getJwtExpiresIn() as any,
      }),
      refreshToken: this.jwtService.sign(
        {
          ...payload,
          type: 'refresh',
        },
        {
          secret: getRefreshTokenSecret(),
          expiresIn: getRefreshTokenExpiresIn() as any,
        },
      ),
    };
  }

  private publicUser(user: any) {
    const { password, ...result } = user;
    return result;
  }

  private tokenDigest(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private requireEmail(value: any) {
    const email = this.readString(value)?.toLowerCase();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException('E-mail invalido');
    }

    return email;
  }

  private requirePassword(value: any) {
    const password = this.readString(value);

    if (!password || password.length < 8) {
      throw new BadRequestException(
        'password deve ter pelo menos 8 caracteres',
      );
    }

    return password;
  }

  private requireString(value: any, message: string) {
    const text = this.readString(value);

    if (!text) {
      throw new BadRequestException(message);
    }

    return text;
  }

  private normalizeRole(value: any) {
    const role = this.readString(value)?.toUpperCase();
    const allowed = ['CLIENT', 'PROFESSIONAL', 'ADMIN'];

    if (!role || !allowed.includes(role)) {
      throw new BadRequestException('Perfil invalido');
    }

    return role;
  }

  private readString(value: any) {
    const text = value?.toString().trim();
    return text && text.length > 0 ? text : undefined;
  }

  private readStringList(value: any) {
    if (!Array.isArray(value)) {
      const single = this.readString(value);
      return single ? [single] : [];
    }

    return Array.from(
      new Set(
        value
          .map((item) => this.readString(item))
          .filter((item): item is string => Boolean(item)),
      ),
    ).slice(0, 20);
  }
}
