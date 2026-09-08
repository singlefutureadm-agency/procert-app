import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FaseProcesso, PapelFuncional, TipoEtapa } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
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

/**
 * Um item de checklist na definição da trilha.
 *
 * Tem responsável e prazo PRÓPRIOS porque uma etapa costuma cruzar áreas: no
 * ensaio, receber a amostra é da Qualidade e executar é do Técnico. Sem isso, a
 * etapa inteira ficaria com um responsável só e a divisão real do trabalho não
 * caberia no sistema.
 */
export class MicroEtapaModeloDto {
  @ApiProperty({ example: 'Receber amostra' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  nome!: string;

  @ApiPropertyOptional({
    enum: PapelFuncional,
    description:
      'Área responsável por este item. Omitido, o item segue a responsável ' +
      'pela etapa — `null` aqui significa "a mesma da etapa", não "ninguém".',
  })
  @IsOptional()
  @IsEnum(PapelFuncional)
  papelResponsavel?: PapelFuncional;

  @ApiPropertyOptional({
    example: 8,
    description:
      'Prazo alvo deste item, em HORAS (1 a 8760). É independente do prazo da ' +
      'etapa e não o substitui: a soma dos itens não precisa fechar com ele.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'O prazo da microetapa deve ser um número inteiro de horas.' })
  @Min(1, { message: 'O prazo da microetapa deve ser de ao menos 1 hora.' })
  @Max(8760, {
    message: 'O prazo da microetapa não pode passar de 8760 horas (um ano).',
  })
  prazoSlaHoras?: number;
}

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

  @ApiPropertyOptional({
    enum: PapelFuncional,
    description:
      'De quem é esta etapa no fluxo. Papel FUNCIONAL, não de acesso: nada ' +
      'aqui concede ou restringe permissão — quem faz isso é `Role`. ' +
      'Omitido, a etapa fica sem responsável definido.',
  })
  @IsOptional()
  @IsEnum(PapelFuncional)
  papelResponsavel?: PapelFuncional;

  @ApiPropertyOptional({
    enum: FaseProcesso,
    default: FaseProcesso.ABERTURA,
    description: 'Bloco do pipeline em que a etapa aparece no quadro',
  })
  @IsOptional()
  @IsEnum(FaseProcesso)
  fase?: FaseProcesso;

  @ApiPropertyOptional({
    description:
      'Prazo alvo da etapa, em HORAS (1 a 8760 — um ano). A operação trabalha ' +
      'em horas: 8h, 12h, 24h, 72h. O campo era em dias até 05/09/2026.',
    example: 72,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'O prazo de SLA deve ser um número inteiro de horas.' })
  @Min(1, { message: 'O prazo de SLA deve ser de ao menos 1 hora.' })
  // Um ano. O limite anterior era 3650 — que eram DIAS, uma década; mantido em
  // horas ele aceitaria 3650h (152 dias) e recusaria um prazo anual legítimo,
  // errando nas duas pontas.
  @Max(8760, { message: 'O prazo de SLA não pode passar de 8760 horas (um ano).' })
  prazoSlaHoras?: number;

  @ApiPropertyOptional({
    default: false,
    description: 'Exige documento anexado para ser aprovada',
  })
  @IsOptional()
  @IsBoolean()
  exigeDocumento?: boolean;

  @ApiPropertyOptional({
    type: [MicroEtapaModeloDto],
    description:
      'Itens de checklist desta etapa, na ordem. Fazem parte da DEFINIÇÃO do ' +
      'processo: cada produto recebe uma cópia própria na abertura da trilha, ' +
      'e é a cópia que se marca. Lista vazia = etapa sem checklist.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50, {
    message:
      'Uma etapa com mais de 50 microetapas provavelmente são duas etapas.',
  })
  @ValidateNested({ each: true })
  @Type(() => MicroEtapaModeloDto)
  microEtapas?: MicroEtapaModeloDto[];
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

  @ApiPropertyOptional({
    default: false,
    description:
      'Padrão do processo: concluir todas as microetapas de uma etapa a aprova ' +
      'sozinha. Cada produto pode sobrepor em `Produto.aprovacaoAutomatica`. ' +
      'Omitido ao copiar da versão vigente, herda o valor dela.',
  })
  @IsOptional()
  @IsBoolean()
  aprovacaoAutomatica?: boolean;
}

/** Política de aprovação automática de uma versão já publicada. */
export class AprovacaoAutomaticaDto {
  @ApiProperty({
    description:
      'Liga ou desliga a aprovação por checklist como PADRÃO desta versão.',
  })
  @IsBoolean()
  aprovacaoAutomatica!: boolean;
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
