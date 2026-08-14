import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  CriticidadeNaoConformidade,
  StatusNaoConformidade,
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

import { PaginacaoDto } from '../../../common/dto/paginacao.dto';

/** Dados de abertura — reutilizado ao reprovar uma etapa em lote. */
export class AbrirNaoConformidadeDto {
  @ApiProperty({
    example: 'Memorial descritivo não cobre a variante XPTO-2 declarada.',
  })
  @IsString()
  @MinLength(10, { message: 'Descreva a não conformidade com pelo menos 10 caracteres.' })
  @MaxLength(5000)
  descricao!: string;

  @ApiProperty({ enum: CriticidadeNaoConformidade })
  @IsEnum(CriticidadeNaoConformidade)
  criticidade!: CriticidadeNaoConformidade;

  @ApiPropertyOptional({
    example: '2026-09-30',
    description: 'Prazo para a resposta do cliente',
  })
  @IsOptional()
  @IsDateString({}, { message: 'Prazo de resposta inválido.' })
  prazoResposta?: string;
}

export class ResponderNaoConformidadeDto {
  @ApiProperty({
    example: 'Memorial revisado e reenviado, agora contemplando a variante XPTO-2.',
  })
  @IsString()
  @MinLength(10, { message: 'Descreva a correção com pelo menos 10 caracteres.' })
  @MaxLength(5000)
  respostaCliente!: string;
}

/**
 * Avaliação da resposta pela equipe.
 *
 * `EM_TRATATIVA` sinaliza que a análise começou; `RESOLVIDA` reabre a etapa
 * para reavaliação; `REPROVADA` encerra a NC mantendo a etapa reprovada.
 * `ABERTA` não é aceita aqui — reabrir uma NC avaliada seria apagar rastro.
 */
export class AvaliarNaoConformidadeDto {
  @ApiProperty({
    enum: [
      StatusNaoConformidade.EM_TRATATIVA,
      StatusNaoConformidade.RESOLVIDA,
      StatusNaoConformidade.REPROVADA,
    ],
  })
  @IsEnum(StatusNaoConformidade)
  status!: StatusNaoConformidade;

  @ApiPropertyOptional({ description: 'Parecer técnico da avaliação' })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  parecer?: string;
}

export class ListarNaoConformidadesDto extends PaginacaoDto {
  @ApiPropertyOptional({ enum: StatusNaoConformidade })
  @IsOptional()
  @IsEnum(StatusNaoConformidade)
  status?: StatusNaoConformidade;

  @ApiPropertyOptional({ enum: CriticidadeNaoConformidade })
  @IsOptional()
  @IsEnum(CriticidadeNaoConformidade)
  criticidade?: CriticidadeNaoConformidade;

  @ApiPropertyOptional({ description: 'Filtra por produto' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  produtoId?: number;

  @ApiPropertyOptional({
    description: 'Somente as que aguardam resposta do cliente (ABERTA/EM_TRATATIVA)',
  })
  @IsOptional()
  @Type(() => Boolean)
  pendentes?: boolean;
}
