import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marca uma rota como acessível sem autenticação.
 * Tudo que não for marcado exige um JWT válido (guard global).
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
