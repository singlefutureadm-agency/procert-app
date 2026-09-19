import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { StatusRegistro } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import { PaginacaoDto } from '../../../common/dto/paginacao.dto';

export class CriarCategoriaProcessoDto {
  @ApiProperty({ example: 'EPIs para trabalho em altura' })
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  nome!: string;

  @ApiPropertyOptional({
    example: 'EPI',
    description:
      'Abreviação usada no código do processo (PROCERT-<SIGLA>-<NNN>-<AA>). ' +
      'Sem sigla, os processos desta categoria nascem sem código de processo — ' +
      'não é erro, é a escolha entre nenhum identificador e um inventado.',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9]{2,8}$/, {
    message:
      'A sigla deve ter de 2 a 8 letras ou números, sem espaço nem pontuação: ' +
      'ela entra no meio de um código separado por hífen.',
  })
  sigla?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  descricao?: string;

  @ApiPropertyOptional({
    example: 'ABNT NBR 15836',
    description: 'Norma técnica de referência da categoria',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  normaReferencia?: string;

  @ApiPropertyOptional({
    default: 24,
    description: 'Validade do certificado emitido para esta categoria, em meses',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(600)
  validadeMeses?: number;
}

export class AtualizarCategoriaProcessoDto extends PartialType(
  CriarCategoriaProcessoDto,
) {}

export class ListarCategoriasProcessoDto extends PaginacaoDto {
  @ApiPropertyOptional({ enum: StatusRegistro, default: StatusRegistro.ATIVO })
  @IsOptional()
  @IsEnum(StatusRegistro)
  status?: StatusRegistro;
}

export class AlterarStatusCategoriaDto {
  @ApiProperty({ enum: StatusRegistro })
  @IsEnum(StatusRegistro)
  status!: StatusRegistro;
}
