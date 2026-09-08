import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FaseProcesso, PapelFuncional, StatusCertificacao } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
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
 * Semáforo de aging do processo — quanto tempo ele está aberto.
 *
 * Não é enum do Prisma: nada disso é persistido. É derivado de
 * `Produto.criadoEm` contra `ALERTAS_AGING` a cada carga do quadro, do mesmo
 * jeito que a fase é derivada da etapa atual. Guardar o semáforo criaria uma
 * coluna que envelhece sozinha e que alguém teria de recalcular por cron.
 */
export const SEMAFOROS_AGING = ['VERDE', 'AMARELO', 'VERMELHO'] as const;
export type SemaforoAging = (typeof SEMAFOROS_AGING)[number];

/**
 * Filtros do quadro de processos.
 *
 * Não estende `PaginacaoDto`: o quadro não é uma lista paginada, e sim cinco
 * colunas com recorte próprio. `pagina`/`limite` aqui não teriam significado —
 * paginar o quadro inteiro misturaria colunas.
 */
export class ListarQuadroDto {
  @ApiPropertyOptional({ description: 'Filtra por categoria de produto' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  categoriaId?: number;

  @ApiPropertyOptional({ description: 'Filtra por cliente' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  clienteId?: number;

  @ApiPropertyOptional({
    enum: PapelFuncional,
    description:
      'Filtra pelo responsável da ETAPA ATUAL — responde "o que está na mão ' +
      'da Qualidade agora?". Papel funcional, não de acesso.',
  })
  @IsOptional()
  @IsEnum(PapelFuncional)
  papelResponsavel?: PapelFuncional;

  @ApiPropertyOptional({ enum: SEMAFOROS_AGING })
  @IsOptional()
  @IsIn(SEMAFOROS_AGING)
  semaforo?: SemaforoAging;

  @ApiPropertyOptional({
    description: 'Busca por produto, cliente ou código do processo',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  busca?: string;

  @ApiPropertyOptional({
    default: 50,
    minimum: 1,
    maximum: 100,
    description:
      'Quantos cartões trazer POR COLUNA. Não afeta o `total` de cada coluna, ' +
      'que é sempre a contagem real — um quadro que mostra 50 cartões e diz ' +
      '"50" havendo 300 esconde a fila em vez de mostrá-la.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limitePorFase?: number = 50;
}

/**
 * Destino do arrastar-e-soltar no quadro.
 *
 * Só FASES: `CONCLUIDO` e `CANCELADO` não são posições, são desfechos —
 * concluir exige aprovar etapa com evidência, cancelar exige motivo. Nenhum dos
 * dois cabe num arrasto, e por isso não são alvos de soltura.
 */
export class MoverParaFaseDto {
  @ApiProperty({ enum: FaseProcesso })
  @IsEnum(FaseProcesso, {
    message:
      'Fase inválida. O quadro só aceita mover entre as fases do pipeline — ' +
      'concluir e cancelar têm ações próprias.',
  })
  fase!: FaseProcesso;
}

/** Interrupção do processo. */
export class CancelarProcessoDto {
  @ApiProperty({
    example: 'Cliente desistiu da certificação.',
    description:
      'Por que o processo foi interrompido. OBRIGATÓRIO: um cancelamento sem ' +
      'motivo registrado é uma pergunta sem resposta seis meses depois.',
  })
  @IsString()
  @MinLength(5, { message: 'Descreva o motivo do cancelamento.' })
  @MaxLength(2000)
  motivo!: string;
}

/** Marcação de uma microetapa do checklist. */
export class AlternarMicroEtapaDto {
  @ApiProperty({
    description:
      'Concluída ou não. Marcar a ÚLTIMA pendente pode aprovar a etapa, se o ' +
      'processo estiver configurado para aprovação automática e a etapa não ' +
      'estiver esperando evidência.',
  })
  @IsBoolean()
  concluida!: boolean;
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
