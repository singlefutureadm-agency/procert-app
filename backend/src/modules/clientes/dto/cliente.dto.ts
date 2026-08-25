import { ApiProperty, ApiPropertyOptional, PartialType, OmitType } from '@nestjs/swagger';
import { StatusRegistro } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Matches, Min } from 'class-validator';

import { PaginacaoDto } from '../../../common/dto/paginacao.dto';
import { PessoaBaseDto } from '../../../common/dto/pessoa-base.dto';
import { SENHA_MENSAGEM, SENHA_REGEX } from '../../../common/utils/senha.util';

export class CriarClienteDto extends PessoaBaseDto {
  @ApiProperty({ example: 'SenhaForte2026' })
  @IsString()
  @Matches(SENHA_REGEX, { message: SENHA_MENSAGEM })
  senha!: string;

  @ApiPropertyOptional({
    description:
      'Funcionário responsável pela carteira. Informativo: não restringe acesso.',
    example: 3,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  responsavelId?: number;
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

  /** Filtra pela carteira de um funcionário. `0` lista os sem responsável. */
  @ApiPropertyOptional({
    description:
      'Id do funcionário responsável. Use 0 para listar os clientes sem responsável.',
    example: 3,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  responsavelId?: number;
}

export class AlterarStatusDto {
  @ApiProperty({ enum: StatusRegistro })
  @IsEnum(StatusRegistro)
  status!: StatusRegistro;
}
