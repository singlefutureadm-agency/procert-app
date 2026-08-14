import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { StatusRegistro } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import { PaginacaoDto } from '../../../common/dto/paginacao.dto';

export class CriarCategoriaProdutoDto {
  @ApiProperty({ example: 'EPIs para trabalho em altura' })
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  nome!: string;

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

export class AtualizarCategoriaProdutoDto extends PartialType(
  CriarCategoriaProdutoDto,
) {}

export class ListarCategoriasProdutoDto extends PaginacaoDto {
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
