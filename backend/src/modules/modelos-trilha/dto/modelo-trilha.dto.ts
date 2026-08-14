import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TipoEtapa } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class EtapaModeloDto {
  @ApiProperty({ example: 'Ensaios laboratoriais' })
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  nome!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  descricao?: string;

  @ApiPropertyOptional({ enum: TipoEtapa, default: TipoEtapa.OUTRO })
  @IsOptional()
  @IsEnum(TipoEtapa)
  tipo?: TipoEtapa;

  @ApiPropertyOptional({
    default: true,
    description: 'Etapas não obrigatórias não bloqueiam a conclusão da trilha',
  })
  @IsOptional()
  @IsBoolean()
  obrigatoria?: boolean;

  @ApiPropertyOptional({ description: 'Prazo alvo em dias', example: 15 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3650)
  prazoSlaDias?: number;

  @ApiPropertyOptional({
    default: false,
    description: 'Exige documento anexado para ser aprovada',
  })
  @IsOptional()
  @IsBoolean()
  exigeDocumento?: boolean;
}

export class CriarVersaoTrilhaDto {
  @ApiPropertyOptional({
    type: [EtapaModeloDto],
    description:
      'Etapas da nova versão. Omitido, copia as etapas da versão vigente.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EtapaModeloDto)
  etapas?: EtapaModeloDto[];
}

export class SubstituirEtapasDto {
  @ApiProperty({ type: [EtapaModeloDto], description: 'Lista completa, na ordem' })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => EtapaModeloDto)
  etapas!: EtapaModeloDto[];
}

export class ReordenarEtapasModeloDto {
  @ApiProperty({
    type: [Number],
    description: 'IDs das etapas do modelo na nova ordem desejada',
    example: [3, 1, 4, 2],
  })
  @IsArray()
  @ArrayMinSize(1)
  @Type(() => Number)
  @IsInt({ each: true })
  ordem!: number[];
}
