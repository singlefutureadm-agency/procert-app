import { SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';

export const ROLES_KEY = 'roles';

/**
 * Restringe a rota aos papéis informados.
 * Sem o decorator, qualquer usuário autenticado tem acesso.
 *
 * @example @Roles(Role.ADMIN, Role.FUNCIONARIO)
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
