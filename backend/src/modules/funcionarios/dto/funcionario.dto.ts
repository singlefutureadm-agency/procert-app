import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Role, StatusRegistro } from '@prisma/client';
import { IsEnum, IsIn, IsOptional, IsString, Matches } from 'class-validator';

import { PaginacaoDto } from '../../../common/dto/paginacao.dto';
import { PessoaBaseDto } from '../../../common/dto/pessoa-base.dto';
import { SENHA_MENSAGEM, SENHA_REGEX } from '../../../common/utils/senha.util';

/** Papéis válidos para a equipe interna (CLIENTE não entra aqui). */
export const ROLES_EQUIPE = [Role.ADMIN, Role.FUNCIONARIO] as const;
export type RoleEquipe = (typeof ROLES_EQUIPE)[number];

export class CriarFuncionarioDto extends PessoaBaseDto {
  @ApiProperty({ example: 'SenhaForte2026' })
  @IsString()
  @Matches(SENHA_REGEX, { message: SENHA_MENSAGEM })
  senha!: string;

  @ApiProperty({ enum: ROLES_EQUIPE, default: Role.FUNCIONARIO })
  @IsIn(ROLES_EQUIPE as unknown as string[], {
    message: 'O papel deve ser ADMIN ou FUNCIONARIO.',
  })
  role!: RoleEquipe;
}

export class AtualizarFuncionarioDto extends PartialType(
  OmitType(CriarFuncionarioDto, ['senha'] as const),
) {
  @ApiPropertyOptional({ description: 'Envie apenas para trocar a senha' })
  @IsOptional()
  @IsString()
  @Matches(SENHA_REGEX, { message: SENHA_MENSAGEM })
  senha?: string;
}

export class ListarFuncionariosDto extends PaginacaoDto {
  @ApiPropertyOptional({ enum: StatusRegistro, default: StatusRegistro.ATIVO })
  @IsOptional()
  @IsEnum(StatusRegistro)
  status?: StatusRegistro;

  @ApiPropertyOptional({
    enum: ROLES_EQUIPE,
    description: 'Filtra por papel. Omitido, retorna toda a equipe.',
  })
  @IsOptional()
  @IsIn(ROLES_EQUIPE as unknown as string[])
  role?: RoleEquipe;
}
