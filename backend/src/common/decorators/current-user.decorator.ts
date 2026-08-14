import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Role } from '@prisma/client';

/** Identidade extraída do JWT e anexada à requisição. */
export interface UsuarioAutenticado {
  id: number;
  nome: string;
  email: string;
  role: Role;
}

/**
 * Injeta o usuário autenticado no handler.
 * @example async listar(@CurrentUser() usuario: UsuarioAutenticado) {}
 */
export const CurrentUser = createParamDecorator(
  (campo: keyof UsuarioAutenticado | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<{ user: UsuarioAutenticado }>();
    return campo ? request.user?.[campo] : request.user;
  },
);
