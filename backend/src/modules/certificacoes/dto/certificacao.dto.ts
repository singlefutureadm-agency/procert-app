import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { StatusCertificacao } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

import { PaginacaoDto } from '../../../common/dto/paginacao.dto';
import { AbrirNaoConformidadeDto } from '../../nao-conformidades/dto/nao-conformidade.dto';

/** Uma etapa alterada dentro do lote enviado pela timeline. */
export class EtapaCertificacaoAtualizacaoDto {
  @ApiProperty({ description: 'ID da linha de certificação (produto × etapa)' })
  @Type(() => Number)
  @IsInt()
  id!: number;

  @ApiProperty({ enum: StatusCertificacao })
  @IsEnum(StatusCertificacao, {
    message:
      'Status inválido. Use PENDENTE, EM_ANDAMENTO, APROVADO ou REPROVADO.',
  })
  status!: StatusCertificacao;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observacao?: string;

  @ApiPropertyOptional({
    type: AbrirNaoConformidadeDto,
    description:
      'Não conformidade a registrar junto com a reprovação. Aceito apenas quando status = REPROVADO.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => AbrirNaoConformidadeDto)
  naoConformidade?: AbrirNaoConformidadeDto;
}

/**
 * Salvamento em lote da timeline.
 *
 * No legado o payload trazia o NOME da etapa em texto livre e o status como
 * rótulo, resolvidos por busca e por comparação de substring. Aqui trafegam
 * apenas IDs e ENUMs validados.
 */
export class SalvarCertificacaoDto {
  @ApiProperty({ type: [EtapaCertificacaoAtualizacaoDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => EtapaCertificacaoAtualizacaoDto)
  etapas!: EtapaCertificacaoAtualizacaoDto[];
}

export class ListarCertificacoesDto extends PaginacaoDto {
  @ApiPropertyOptional({ enum: StatusCertificacao })
  @IsOptional()
  @IsEnum(StatusCertificacao)
  status?: StatusCertificacao;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  clienteId?: number;
}

/**
 * Formato da exportação.
 *
 * DTO próprio, e não um `@Query('formato')` solto, porque o `ValidationPipe`
 * roda com `forbidNonWhitelisted`: qualquer parâmetro não declarado vira 400.
 * Sem esta classe, `?formato=xlsx` seria recusado.
 */
export class ExportarCertificacaoDto {
  @ApiPropertyOptional({
    enum: ['xlsx', 'csv'],
    default: 'xlsx',
    description:
      'xlsx traz uma aba por etapa; csv empilha as mesmas seções num arquivo só.',
  })
  @IsOptional()
  @IsIn(['xlsx', 'csv'])
  formato?: 'xlsx' | 'csv';
}
