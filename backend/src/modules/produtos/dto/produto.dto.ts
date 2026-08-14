import {
  ApiProperty,
  ApiPropertyOptional,
  OmitType,
  PartialType,
} from '@nestjs/swagger';
import { StatusRegistro } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import { PaginacaoDto } from '../../../common/dto/paginacao.dto';

export class CriarProdutoDto {
  @ApiProperty({ description: 'Cliente proprietário do produto' })
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  clienteId!: number;

  @ApiProperty({
    description:
      'Categoria do produto. Define a trilha de certificação: o produto é ' +
      'vinculado à versão vigente do modelo dessa categoria.',
  })
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  categoriaId!: number;

  @ApiProperty({ example: 'Cinturão de segurança tipo paraquedista' })
  @IsString()
  @MinLength(3)
  @MaxLength(150)
  nome!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  descricao?: string;

  @ApiPropertyOptional({ example: 2500.0, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  preco?: number;
}

/**
 * `categoriaId` fica de fora: trocar a categoria depois da submissão mudaria a
 * trilha de um produto já em avaliação. Isso é reabertura de processo, não
 * edição de cadastro.
 */
export class AtualizarProdutoDto extends PartialType(
  OmitType(CriarProdutoDto, ['categoriaId'] as const),
) {}

export class ListarProdutosDto extends PaginacaoDto {
  @ApiPropertyOptional({ enum: StatusRegistro, default: StatusRegistro.ATIVO })
  @IsOptional()
  @IsEnum(StatusRegistro)
  status?: StatusRegistro;

  @ApiPropertyOptional({ description: 'Filtra por cliente' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  clienteId?: number;

  @ApiPropertyOptional({ description: 'Filtra por categoria' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  categoriaId?: number;
}
