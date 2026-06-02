import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { ROLES_KEY } from './roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles =
      this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];

    if (!requiredRoles.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const userRole = request.user?.role?.toString().trim().toUpperCase();

    if (!userRole || !requiredRoles.includes(userRole)) {
      throw new ForbiddenException('Acesso negado para este perfil');
    }

    return true;
  }
}
