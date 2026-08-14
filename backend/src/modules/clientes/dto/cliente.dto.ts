import { ApiProperty, ApiPropertyOptional, PartialType, OmitType } from '@nestjs/swagger';
import { StatusRegistro } from '@prisma/client';
import { IsEnum, IsOptional, IsString, Matches } from 'class-validator';

import { PaginacaoDto } from '../../../common/dto/paginacao.dto';
import { PessoaBaseDto } from '../../../common/dto/pessoa-base.dto';
import { SENHA_MENSAGEM, SENHA_REGEX } from '../../../common/utils/senha.util';

export class CriarClienteDto extends PessoaBaseDto {
  @ApiProperty({ example: 'SenhaForte2026' })
  @IsString()
  @Matches(SENHA_REGEX, { message: SENHA_MENSAGEM })
  senha!: string;
}

/**
 * Na atualização todos os campos são opcionais e a senha só é alterada
 * quando enviada — mesma regra do UPDATE dinâmico do legado.
 */
export class AtualizarClienteDto extends PartialType(
  OmitType(CriarClienteDto, ['senha'] as const),
) {
  @ApiPropertyOptional({ description: 'Envie apenas para trocar a senha' })
  @IsOptional()
  @IsString()
  @Matches(SENHA_REGEX, { message: SENHA_MENSAGEM })
  senha?: string;
}

export class ListarClientesDto extends PaginacaoDto {
  @ApiPropertyOptional({ enum: StatusRegistro, default: StatusRegistro.ATIVO })
  @IsOptional()
  @IsEnum(StatusRegistro)
  status?: StatusRegistro;
}

export class AlterarStatusDto {
  @ApiProperty({ enum: StatusRegistro })
  @IsEnum(StatusRegistro)
  status!: StatusRegistro;
}
