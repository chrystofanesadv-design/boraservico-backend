import {
  BadRequestException,
  Injectable,
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
import { AuditService } from '../security/audit.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class AuthService {
  private readonly revokedRefreshTokens = new Set<string>();

  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private auditService: AuditService,
  ) {}

  async register(data: any) {
    const hashed = await bcrypt.hash(data.password, 10);

    const user = await this.usersService.create({
      ...data,
      password: hashed,
    });

    await this.auditService.register('AUTH_REGISTERED', {
      domain: 'auth',
      actorId: user.id,
      actorEmail: user.email,
      entityType: 'user',
      entityId: user.id,
      metadata: {
        role: user.role,
      },
    });

    return this.publicUser(user);
  }

  async login(email: string, password: string) {
    const user = await this.usersService.findByEmail(email);

    if (!user) {
      await this.auditService.register('AUTH_LOGIN_FAILED', {
        domain: 'auth',
        actorEmail: email,
        metadata: {
          reason: 'USER_NOT_FOUND',
        },
      });
      throw new UnauthorizedException('Credenciais invalidas');
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      await this.auditService.register('AUTH_LOGIN_FAILED', {
        domain: 'auth',
        actorId: user.id,
        actorEmail: user.email,
        entityType: 'user',
        entityId: user.id,
        metadata: {
          reason: 'PASSWORD_MISMATCH',
        },
      });
      throw new UnauthorizedException('Credenciais invalidas');
    }

    const tokens = this.issueTokens(user);

    await this.auditService.register('AUTH_LOGIN_SUCCEEDED', {
      domain: 'auth',
      actorId: user.id,
      actorEmail: user.email,
      entityType: 'session',
      entityId: user.id,
      metadata: {
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

    await this.auditService.register('AUTH_TOKEN_REFRESHED', {
      domain: 'auth',
      actorId: user.id,
      actorEmail: user.email,
      entityType: 'session',
      entityId: user.id,
      metadata: {
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

    await this.auditService.register('AUTH_SESSION_REVOKED', {
      domain: 'auth',
      actorId: this.readString(actor?.userId),
      actorEmail: this.readString(actor?.email),
      entityType: 'session',
      metadata: {
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

  private issueTokens(user: any) {
    const payload = {
      sub: user.id,
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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, ...result } = user;
    return result;
  }

  private tokenDigest(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private readString(value: any) {
    const text = value?.toString().trim();
    return text && text.length > 0 ? text : undefined;
  }
}
