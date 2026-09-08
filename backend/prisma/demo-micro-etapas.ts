/**
 * Popula CHECKLISTS DEMONSTRATIVOS nos processos que já estão no quadro.
 *
 * ## Por que existe, e por que não é o `seed`
 *
 * O checklist de verdade se cadastra na TRILHA, e cada produto recebe uma cópia
 * ao entrar nela. Mas uma trilha com produto vinculado é imutável — e os
 * produtos que já estão no quadro entraram por versões que não tinham
 * checklist. Migrar para uma versão nova também não resolve:
 * `migrarParaVersaoVigente` só ACRESCENTA etapas ausentes e **não toca no
 * checklist das que o produto já tinha**, de propósito, para não apagar
 * marcações feitas.
 *
 * Sobra escrever a cópia do produto (`MicroEtapaCertificacao`) diretamente, que
 * é exatamente onde ela vive. É o que este script faz — e por isso ele é
 * DEMONSTRATIVO: serve para a operação ver o quadro com checklist antes de
 * decidir os textos definitivos, não para virar processo real.
 *
 * ## O que ele garante
 *
 * - **Idempotente**: etapa que já tem checklist é pulada. Rodar duas vezes não
 *   duplica item, e não sobrescreve o que a Qualidade já cadastrou de verdade.
 * - **Não marca nada**: todos os itens nascem pendentes. Marcar por script
 *   gravaria autoria falsa e, com aprovação automática ligada, aprovaria etapa
 *   sozinho.
 * - **Não toca em trilha**: nenhuma `ModeloMicroEtapa` é criada. O catálogo
 *   continua sendo a fonte, e quando a Qualidade cadastrar lá, os produtos
 *   NOVOS já nascem certos.
 *
 * Uso: `npm run demo:micro-etapas`
 */
import 'dotenv/config';

import {
  FaseProcesso,
  PapelFuncional,
  PrismaClient,
  TipoEtapa,
} from '@prisma/client';

const prisma = new PrismaClient();

type ItemDemo = {
  nome: string;
  papelResponsavel?: PapelFuncional;
  prazoSlaHoras?: number;
};

/**
 * Checklist por NATUREZA da etapa.
 *
 * Chaveado por `TipoEtapa`, e não pelo nome, porque nome é texto livre do
 * admin: casar por nome acertaria em "Ensaios laboratoriais" e erraria em
 * "Ensaio dinâmico". O tipo é enum e descreve exatamente o que a etapa é.
 */
const MODELOS: Record<TipoEtapa, ItemDemo[]> = {
  DOCUMENTAL: [
    { nome: 'Receber a documentação do cliente', papelResponsavel: 'CLIENTE' },
    { nome: 'Conferir memorial descritivo', papelResponsavel: 'TECNICO', prazoSlaHoras: 8 },
    { nome: 'Verificar norma aplicável', papelResponsavel: 'QUALIDADE', prazoSlaHoras: 4 },
  ],
  ENSAIO: [
    { nome: 'Receber a amostra', papelResponsavel: 'QUALIDADE', prazoSlaHoras: 8 },
    { nome: 'Conferir lacre e identificação', papelResponsavel: 'QUALIDADE', prazoSlaHoras: 4 },
    { nome: 'Executar os ensaios previstos', papelResponsavel: 'TECNICO', prazoSlaHoras: 72 },
    { nome: 'Emitir o laudo', papelResponsavel: 'TECNICO', prazoSlaHoras: 24 },
  ],
  AUDITORIA_FABRICA: [
    { nome: 'Agendar a auditoria com a fábrica', papelResponsavel: 'QUALIDADE', prazoSlaHoras: 24 },
    { nome: 'Executar a auditoria no local', papelResponsavel: 'AUDITOR', prazoSlaHoras: 48 },
    { nome: 'Emitir o relatório de auditoria', papelResponsavel: 'AUDITOR', prazoSlaHoras: 24 },
  ],
  ANALISE_CRITICA: [
    { nome: 'Revisar documentação e laudos', papelResponsavel: 'QUALIDADE', prazoSlaHoras: 24 },
    { nome: 'Registrar parecer técnico', papelResponsavel: 'TECNICO', prazoSlaHoras: 12 },
  ],
  DECISAO: [
    { nome: 'Revisar o processo completo', papelResponsavel: 'QUALIDADE', prazoSlaHoras: 12 },
    { nome: 'Decidir sobre a certificação', papelResponsavel: 'DIRETORIA', prazoSlaHoras: 24 },
    { nome: 'Assinar e enviar ao cliente', papelResponsavel: 'DIRETORIA', prazoSlaHoras: 12 },
  ],
  OUTRO: [
    { nome: 'Registrar o início da etapa', papelResponsavel: 'TECNICO' },
    { nome: 'Concluir a etapa', papelResponsavel: 'TECNICO' },
  ],
};

/**
 * Fase do pipeline por natureza da etapa.
 *
 * Sem isto o quadro tem uma coluna só: `ModeloEtapa.fase` nasce `ABERTURA` por
 * default, e as trilhas em uso foram criadas antes do campo existir. Com todas
 * as etapas na mesma fase, arrastar não tem para onde ir.
 */
const FASE_POR_TIPO: Record<TipoEtapa, FaseProcesso> = {
  DOCUMENTAL: 'ABERTURA',
  AUDITORIA_FABRICA: 'AMOSTRAGEM_AUDITORIA',
  ENSAIO: 'ENSAIOS_LABORATORIO',
  ANALISE_CRITICA: 'ANALISE_PROCESSO',
  DECISAO: 'EMISSAO',
  OUTRO: 'ABERTURA',
};

/**
 * Distribui as etapas pelas fases, para o quadro demonstrar o pipeline.
 *
 * **Escreve em `ModeloEtapa`, que é de versão imutável — e isso é deliberado.**
 * A imutabilidade existe para que "este produto foi avaliado por estas regras"
 * continue verdadeiro, e `fase` NÃO é regra de avaliação: ela não muda
 * aprovação, prazo nem exigência de evidência. É só em que coluna o cartão
 * aparece. Ajustá-la retroativamente não altera nenhuma avaliação já feita.
 *
 * Ainda assim é ação de DEMONSTRAÇÃO: em produção, a fase se define ao criar a
 * etapa, na tela da trilha.
 */
async function distribuirFases() {
  // Só as que ainda estão no default: uma fase já escolhida à mão é decisão da
  // Qualidade e não se sobrescreve.
  const etapas = await prisma.modeloEtapa.findMany({
    where: { fase: 'ABERTURA' },
    select: { id: true, nome: true, tipo: true },
  });

  const aMover = etapas.filter(
    (etapa) => FASE_POR_TIPO[etapa.tipo] !== 'ABERTURA',
  );

  for (const etapa of aMover) {
    await prisma.modeloEtapa.update({
      where: { id: etapa.id },
      data: { fase: FASE_POR_TIPO[etapa.tipo] },
    });
    console.log(`  ${etapa.nome} → ${FASE_POR_TIPO[etapa.tipo]}`);
  }

  console.log(`${aMover.length} etapa(s) distribuída(s) pelas fases.\n`);
}

async function main() {
  console.log('Fases do pipeline:');
  await distribuirFases();

  console.log('Checklists:');
  // Só etapas SEM checklist: a idempotência mora aqui, e é ela que impede o
  // script de passar por cima do que a Qualidade cadastrar de verdade depois.
  const etapas = await prisma.certificacaoProduto.findMany({
    where: { microEtapas: { none: {} } },
    select: {
      id: true,
      produto: { select: { nome: true, codigoProcesso: true } },
      etapa: { select: { nome: true, tipo: true } },
    },
    orderBy: [{ produtoId: 'asc' }, { ordem: 'asc' }],
  });

  if (etapas.length === 0) {
    console.log('Nada a fazer: todas as etapas já têm checklist.');
    return;
  }

  let itens = 0;

  for (const etapa of etapas) {
    const modelo = MODELOS[etapa.etapa.tipo];

    await prisma.microEtapaCertificacao.createMany({
      data: modelo.map((item, indice) => ({
        certificacaoId: etapa.id,
        nome: item.nome,
        papelResponsavel: item.papelResponsavel ?? null,
        prazoSlaHoras: item.prazoSlaHoras ?? null,
        ordem: indice + 1,
        // `modeloMicroEtapaId` fica nulo: não veio do catálogo, veio daqui. É o
        // rastro honesto de que este checklist é demonstrativo.
      })),
    });

    itens += modelo.length;
    const codigo = etapa.produto.codigoProcesso ?? etapa.produto.nome;
    console.log(`  ${codigo} · ${etapa.etapa.nome}: ${modelo.length} item(ns)`);
  }

  console.log(
    `\n${itens} microetapa(s) demonstrativa(s) em ${etapas.length} etapa(s).`,
  );
  console.log(
    'Nenhuma foi marcada como concluída, e nenhuma trilha foi alterada.',
  );
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
