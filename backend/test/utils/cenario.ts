import { INestApplication } from '@nestjs/common';
import {
  Role,
  StatusCertificacao,
  StatusCertificado,
  TipoEtapa,
} from '@prisma/client';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { gerarHashSenha } from '../../src/common/utils/senha.util';
import { autenticar, prisma } from './aplicacao';

export const SENHA = 'Procert@2026';

/**
 * Tabelas na ordem em que o TRUNCATE precisa acontecer.
 *
 * `CASCADE` resolveria sozinho, mas listar explicitamente documenta o grafo e
 * evita apagar por acidente algo que uma migration futura acrescentar sem que
 * ninguém repare.
 */
const TABELAS = [
  'documentos_certificacao',
  'certificacoes_historico',
  'nao_conformidades',
  'certificados',
  'pagamentos',
  'certificacoes_produto',
  'produtos',
  'modelos_etapa',
  'modelos_trilha',
  'categorias_produto',
  'etapas_certificacao',
  'tokens_redefinicao_senha',
  'mensagens_contato',
  'configuracao_aparencia',
  'clientes',
  'funcionarios',
  'estados',
];

export interface Cenario {
  admin: string;
  funcionario: string;
  /** Token do cliente DONO do produto/certificado/documento sob teste. */
  clienteDono: string;
  /** Token de um segundo cliente, sem nenhuma relação com eles. */
  clienteAlheio: string;

  clienteDonoId: number;
  clienteAlheioId: number;
  produtoDonoId: number;
  produtoAlheioId: number;

  certificadoId: number;
  documentoId: number;
  /** Etapa com `exigeDocumento`, usada nos testes de escrita. */
  certificacaoId: number;

  /** Nomes dos arquivos gravados EM DISCO, por pasta. */
  arquivos: {
    certificados: string;
    certificacoes: string;
    produtos: string;
    aparencia: string;
  };
}

/**
 * Zera o banco e monta o cenário mínimo da matriz de autorização:
 * dois clientes, um produto de cada, e — no do primeiro — trilha aberta,
 * evidência anexada e certificado emitido.
 *
 * Os arquivos são gravados de verdade em `UPLOAD_DIR`. Isso é parte do teste:
 * um 404 em `/uploads/certificados/<uuid>.pdf` só prova negação se o arquivo
 * estiver lá. Sem isso o teste passaria por engano, provando apenas que o
 * arquivo não existe.
 */
export async function prepararCenario(app: INestApplication): Promise<Cenario> {
  const db = prisma(app);

  await db.$executeRawUnsafe(
    `TRUNCATE TABLE ${TABELAS.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`,
  );

  const senhaHash = await gerarHashSenha(SENHA);

  const estado = await db.estado.create({
    data: { sigla: 'SP', nome: 'São Paulo' },
  });

  await db.funcionario.create({
    data: {
      nome: 'Ana Administradora',
      email: 'admin@procertocp.com.br',
      senhaHash,
      role: Role.ADMIN,
      estadoId: estado.id,
    },
  });

  await db.funcionario.create({
    data: {
      nome: 'Bruno Analista',
      email: 'analista@procertocp.com.br',
      senhaHash,
      role: Role.FUNCIONARIO,
      estadoId: estado.id,
    },
  });

  const dono = await db.cliente.create({
    data: {
      nome: 'Indústria Dona Ltda',
      email: 'dono@cliente.com.br',
      senhaHash,
      cnpj: '12.345.678/0001-99',
      estadoId: estado.id,
    },
  });

  const alheio = await db.cliente.create({
    data: {
      nome: 'Concorrente Alheia S.A.',
      email: 'alheio@cliente.com.br',
      senhaHash,
      cnpj: '98.765.432/0001-11',
      estadoId: estado.id,
    },
  });

  const categoria = await db.categoriaProduto.create({
    data: {
      nome: 'Material elétrico',
      normaReferencia: 'NBR 5361',
      validadeMeses: 12,
      modelosTrilha: {
        create: {
          versao: 1,
          ativo: true,
          etapas: {
            create: [
              {
                nome: 'Análise documental',
                ordem: 1,
                tipo: TipoEtapa.DOCUMENTAL,
                obrigatoria: true,
              },
              {
                nome: 'Ensaios laboratoriais',
                ordem: 2,
                tipo: TipoEtapa.ENSAIO,
                obrigatoria: true,
                exigeDocumento: true,
              },
              {
                nome: 'Selo verde',
                ordem: 3,
                tipo: TipoEtapa.OUTRO,
                obrigatoria: false,
              },
            ],
          },
        },
      },
    },
    include: { modelosTrilha: { include: { etapas: true } } },
  });

  const trilha = categoria.modelosTrilha[0];
  const etapas = [...trilha.etapas].sort((a, b) => a.ordem - b.ordem);

  const criarProduto = async (clienteId: number, nome: string) =>
    db.produto.create({
      data: {
        clienteId,
        categoriaId: categoria.id,
        modeloTrilhaId: trilha.id,
        nome,
        preco: 1000,
        certificacao: {
          create: etapas.map((etapa) => ({
            etapaId: etapa.id,
            ordem: etapa.ordem,
            status: StatusCertificacao.APROVADO,
          })),
        },
      },
      include: { certificacao: { orderBy: { ordem: 'asc' } } },
    });

  const produtoDono = await criarProduto(dono.id, 'Disjuntor DIN 25A');
  const produtoAlheio = await criarProduto(alheio.id, 'Tomada 20A');

  const arquivos = gravarArquivos();

  // Evidência: pendura no histórico, não na etapa — é o que registra em que
  // ponto da trilha, e por quem, o arquivo entrou.
  const historico = await db.certificacaoHistorico.create({
    data: {
      certificacaoId: produtoDono.certificacao[1].id,
      statusAnterior: StatusCertificacao.EM_ANDAMENTO,
      statusNovo: StatusCertificacao.APROVADO,
      observacao: 'Laudo de ensaio recebido',
      alteradoPorNome: 'Bruno Analista',
    },
  });

  const documento = await db.documentoCertificacao.create({
    data: {
      historicoId: historico.id,
      nomeArquivo: 'laudo-ensaio.pdf',
      arquivoUrl: `/uploads/certificacoes/${arquivos.certificacoes}`,
      tipoMime: 'application/pdf',
      tamanhoBytes: 1024,
      enviadoPorNome: 'Bruno Analista',
    },
  });

  const certificado = await db.certificado.create({
    data: {
      produtoId: produtoDono.id,
      numero: 'PROCERT-2026-000001',
      escopo: 'Disjuntores termomagnéticos até 25A',
      dataValidade: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      status: StatusCertificado.EMITIDO,
      emitidoPorNome: 'Ana Administradora',
      arquivoPdf: `/uploads/certificados/${arquivos.certificados}`,
    },
  });

  return {
    admin: await autenticar(app, 'admin@procertocp.com.br', SENHA),
    funcionario: await autenticar(app, 'analista@procertocp.com.br', SENHA),
    clienteDono: await autenticar(app, 'dono@cliente.com.br', SENHA),
    clienteAlheio: await autenticar(app, 'alheio@cliente.com.br', SENHA),

    clienteDonoId: dono.id,
    clienteAlheioId: alheio.id,
    produtoDonoId: produtoDono.id,
    produtoAlheioId: produtoAlheio.id,

    certificadoId: certificado.id,
    documentoId: documento.id,
    certificacaoId: produtoDono.certificacao[1].id,

    arquivos,
  };
}

/**
 * Grava um arquivo real em cada pasta de `UPLOAD_DIR`, pública e privada.
 *
 * Os nomes são fixos (e não UUID) de propósito: o teste precisa conseguir
 * montar a URL, e o UUID só serve para tornar o caminho difícil de adivinhar —
 * o que é obscuridade, não controle de acesso, e é exatamente o que estes
 * testes verificam não ser a única barreira.
 */
function gravarArquivos(): Cenario['arquivos'] {
  const raiz = join(process.cwd(), process.env.UPLOAD_DIR ?? './uploads');

  const gravar = (pasta: string, nome: string, conteudo: Buffer): string => {
    mkdirSync(join(raiz, pasta), { recursive: true });
    writeFileSync(join(raiz, pasta, nome), conteudo);
    return nome;
  };

  // PDF mínimo válido, para o Content-Type do download fazer sentido.
  const pdf = Buffer.from(
    '%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
  );
  // PNG 1×1 transparente.
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64',
  );

  return {
    certificados: gravar('certificados', 'e2e-certificado.pdf', pdf),
    certificacoes: gravar('certificacoes', 'e2e-evidencia.pdf', pdf),
    produtos: gravar('produtos', 'e2e-foto-produto.png', png),
    aparencia: gravar('aparencia', 'e2e-logo.png', png),
  };
}

/** Caminho absoluto de um arquivo do cenário, para provar que ele existe. */
export function caminhoDoArquivo(pasta: string, nome: string): string {
  return join(process.cwd(), process.env.UPLOAD_DIR ?? './uploads', pasta, nome);
}
