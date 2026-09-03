import {
  ApiProperty,
  ApiPropertyOptional,
  OmitType,
  PartialType,
} from '@nestjs/swagger';
import { StatusRegistro } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

import { PaginacaoDto } from '../../../common/dto/paginacao.dto';
import { EtapaModeloDto } from './modelo-trilha.dto';

export class CriarTrilhaDto {
  @ApiProperty({ example: 'Ensaio laboratorial + auditoria de fábrica' })
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  nome!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  descricao?: string;

  /**
   * Etapas da versão 1, criadas no mesmo commit da trilha.
   *
   * Opcional para permitir montar o processo em duas etapas na tela, mas a
   * trilha sem versão nenhuma é inútil — nenhuma categoria pode usá-la. Quando
   * vem preenchido, a v1 nasce junto e a trilha já é vinculável.
   */
  @ApiPropertyOptional({
    type: [EtapaModeloDto],
    description: 'Etapas da versão 1. Omitido, a trilha nasce sem versão.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EtapaModeloDto)
  etapas?: EtapaModeloDto[];
}

/**
 * PATCH da trilha: só identidade.
 *
 * `etapas` fica de fora de propósito — o campo existe no DTO de criação para a
 * v1 nascer junto, e aqui ele seria ambíguo ("etapas de qual versão?") num
 * corpo que também renomeia. Etapa se edita pela versão, em
 * `PATCH /modelos-trilha/:id/etapas`, que é onde mora a regra de imutabilidade.
 */
export class AtualizarTrilhaDto extends PartialType(
  OmitType(CriarTrilhaDto, ['etapas'] as const),
) {}

export class ListarTrilhasDto extends PaginacaoDto {
  @ApiPropertyOptional({ enum: StatusRegistro, default: StatusRegistro.ATIVO })
  @IsOptional()
  @IsEnum(StatusRegistro)
  status?: StatusRegistro;
}

export class AlterarStatusTrilhaDto {
  @ApiProperty({ enum: StatusRegistro })
  @IsEnum(StatusRegistro)
  status!: StatusRegistro;
}

/**
 * Duplica uma trilha existente como ponto de partida de uma nova.
 *
 * É o caminho para "quero o mesmo processo com um ajuste": copiar e editar,
 * em vez de redigitar. A cópia nasce como v1 de uma trilha nova e independente
 * — nada liga as duas depois, senão editar uma mexeria na outra.
 */
export class DuplicarTrilhaDto {
  @ApiProperty({ example: 'Ensaio + auditoria (linha branca)' })
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
    description:
      'Versão de origem das etapas. Omitido, copia a versão vigente da trilha.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  modeloTrilhaId?: number;
}

/** Vincula/desvincula a trilha de uma categoria. `trilhaId: null` desvincula. */
export class VincularTrilhaDto {
  @ApiPropertyOptional({
    nullable: true,
    description: 'ID da trilha do catálogo, ou null para desvincular',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  trilhaId!: number | null;
}

/** Corpo do vínculo em massa: uma trilha aplicada a várias categorias. */
export class VincularCategoriasDto {
  @ApiProperty({
    type: [Number],
    description: 'IDs das categorias que passam a seguir esta trilha',
    example: [1, 4, 7],
  })
  @IsArray()
  @ArrayMinSize(1)
  @Type(() => Number)
  @IsInt({ each: true })
  categoriaIds!: number[];
}
