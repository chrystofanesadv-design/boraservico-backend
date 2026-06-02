import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Usuario nao autenticado');
    }

    if (user.role?.toString().toUpperCase() !== 'ADMIN') {
      throw new ForbiddenException('Acesso restrito ao administrador');
    }

    return true;
  }
}
