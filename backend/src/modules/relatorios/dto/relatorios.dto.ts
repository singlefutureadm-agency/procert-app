import {
  ApiProperty,
  ApiPropertyOptional,
  IntersectionType,
  OmitType,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsISO8601, IsOptional, Min } from 'class-validator';

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

// ------------------------------------------------------------ comparativos

/**
 * Ordenações aceitas no comparativo de produtos.
 *
 * Allowlist fechada, e o service a traduz para um `Prisma.sql` fixo. O nome da
 * coluna **nunca** vem da query string: interpolar isso em `$queryRaw` seria
 * injeção de SQL na cláusula `ORDER BY`, que os placeholders não protegem.
 */
export const ORDENS_PRODUTO = [
  'progresso',
  'progresso_asc',
  'paradas',
  'nome',
] as const;
export type OrdemComparativoProduto = (typeof ORDENS_PRODUTO)[number];

export const ORDENS_CLIENTE = [
  'produtos',
  'produtos_asc',
  'certificados',
  'nome',
] as const;
export type OrdemComparativoCliente = (typeof ORDENS_CLIENTE)[number];

export class ListarComparativoProdutosDto extends PaginacaoDto {
  @ApiPropertyOptional({
    enum: ORDENS_PRODUTO,
    default: 'progresso',
    description:
      '`paradas` ordena pelo maior tempo sem movimentação — o processo travado.',
  })
  @IsOptional()
  @IsIn(ORDENS_PRODUTO)
  ordem: OrdemComparativoProduto = 'progresso';

  @ApiPropertyOptional({ description: 'Ignorado quando o papel é CLIENTE.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  clienteId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  categoriaId?: number;
}

export class ListarComparativoClientesDto extends PaginacaoDto {
  @ApiPropertyOptional({ enum: ORDENS_CLIENTE, default: 'produtos' })
  @IsOptional()
  @IsIn(ORDENS_CLIENTE)
  ordem: OrdemComparativoCliente = 'produtos';

  @ApiPropertyOptional({ description: 'Filtra pela carteira de um funcionário.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  responsavelId?: number;
}

/** Formato do arquivo. Os comparativos não exigem período: o recorte é por filtro. */
export class FormatoExportacaoDto {
  @ApiPropertyOptional({ enum: ['xlsx', 'csv'], default: 'xlsx' })
  @IsOptional()
  @IsIn(['xlsx', 'csv'])
  formato?: 'xlsx' | 'csv';
}

export class ExportarComparativoProdutosDto extends IntersectionType(
  OmitType(ListarComparativoProdutosDto, ['pagina', 'limite'] as const),
  FormatoExportacaoDto,
) {}

export class ExportarComparativoClientesDto extends IntersectionType(
  OmitType(ListarComparativoClientesDto, ['pagina', 'limite'] as const),
  FormatoExportacaoDto,
) {}
