import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsISO8601, IsOptional } from 'class-validator';

import { PaginacaoDto } from '../../../common/dto/paginacao.dto';

/**
 * Janela máxima de um recorte de exportação.
 *
 * A API roda como função serverless: "exporta tudo" estoura o tempo antes de
 * terminar o arquivo, e o usuário recebe um erro de plataforma sem explicação.
 */
export const MESES_MAXIMOS_EXPORTACAO = 12;

/**
 * Teto de linhas de uma exportação.
 *
 * A consulta roda com `take: LIMITE + 1` justamente para saber que estourou.
 * Passando disso a resposta é **400 pedindo recorte mais estreito** — nunca um
 * arquivo truncado em silêncio: meia planilha sem aviso vai para a reunião
 * parecendo completa, que é pior do que erro nenhum.
 */
export const LIMITE_LINHAS_EXPORTACAO = 5000;

/** Recorte por período, comum aos relatórios. */
export class PeriodoDto {
  @ApiPropertyOptional({
    description: 'Início do período (ISO 8601). Sem valor, não recorta o início.',
    example: '2026-01-01',
  })
  @IsOptional()
  @IsISO8601()
  de?: string;

  @ApiPropertyOptional({
    description: 'Fim do período (ISO 8601). Sem valor, vai até agora.',
    example: '2026-12-31',
  })
  @IsOptional()
  @IsISO8601()
  ate?: string;
}

/**
 * Filtros do relatório de equipe na tela.
 *
 * O período recorta **apenas a atividade**. A carteira é retrato de agora e
 * ignora as datas — ver `RelatorioEquipeService`.
 */
export class ListarRelatorioEquipeDto extends PaginacaoDto {
  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsOptional()
  @IsISO8601()
  de?: string;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional()
  @IsISO8601()
  ate?: string;
}

/**
 * Filtros da exportação.
 *
 * **Não estende `PaginacaoDto` de propósito.** Exportar 20 linhas por vez não
 * serve, e com `forbidNonWhitelisted` global um `pagina=2` enviado por engano
 * é rejeitado com 400 em vez de silenciosamente ignorado — o que evitaria
 * alguém baixar a página 2 achando que baixou o relatório inteiro.
 *
 * Período é **obrigatório** aqui, ao contrário da tela.
 */
export class ExportarRelatorioDto {
  @ApiProperty({ description: 'Início do período (ISO 8601)', example: '2026-01-01' })
  @IsISO8601({}, { message: 'Informe o início do período (de) no formato ISO 8601.' })
  de!: string;

  @ApiProperty({ description: 'Fim do período (ISO 8601)', example: '2026-12-31' })
  @IsISO8601({}, { message: 'Informe o fim do período (ate) no formato ISO 8601.' })
  ate!: string;

  @ApiPropertyOptional({ enum: ['xlsx', 'csv'], default: 'xlsx' })
  @IsOptional()
  @Type(() => String)
  @IsIn(['xlsx', 'csv'])
  formato?: 'xlsx' | 'csv';
}
