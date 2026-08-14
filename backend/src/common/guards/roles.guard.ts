import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';

import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { UsuarioAutenticado } from '../decorators/current-user.decorator';

/** Autorização por papel, aplicada globalmente após o JwtAuthGuard. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const rolesPermitidos = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!rolesPermitidos?.length) return true;

    const { user } = context
      .switchToHttp()
      .getRequest<{ user?: UsuarioAutenticado }>();

    if (!user || !rolesPermitidos.includes(user.role)) {
      throw new ForbiddenException(
        'Seu perfil não tem permissão para executar esta ação.',
      );
    }

    return true;
  }
}
