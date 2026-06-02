import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
  ) {}

  async register(data: any) {
    const hashed = await bcrypt.hash(data.password, 10);

    const user = await this.usersService.create({
      ...data,
      password: hashed,
    });

    // ðŸ”¥ REMOVE A SENHA DO RETORNO (SEGURANÃ‡A)
    const { password, ...result } = user;
    return result;
  }

  async login(email: string, password: string) {
    const user = await this.usersService.findByEmail(email);

    if (!user) {
      throw new UnauthorizedException('Credenciais invÃ¡lidas');
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      throw new UnauthorizedException('Credenciais invÃ¡lidas');
    }

    const token = this.jwtService.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _password, ...userResult } = user;

    return {
      access_token: token,
      token: token,
      user: userResult,
    };
  }
}
