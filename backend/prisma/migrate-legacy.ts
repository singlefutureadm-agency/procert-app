/**
 * ETL: MySQL legado (sistema PHP) → PostgreSQL (nova plataforma).
 *
 * Uso:
 *   1. Preencha as variáveis LEGACY_MYSQL_* no arquivo .env
 *   2. Rode as migrations e o seed do novo banco:
 *        npx prisma migrate deploy && npm run seed
 *   3. Execute:  npm run migrate:legacy
 *      Simulação (não grava nada): npm run migrate:legacy -- --dry-run
 *
 * Ordem de carga (respeita as chaves estrangeiras):
 *   estados → clientes → funcionários → produtos → etapas
 *   → certificações → histórico → pagamentos
 *
 * SENHAS: o legado guardava senhas de clientes em TEXTO PURO e de funcionários
 * com password_hash() do PHP. Ambos são tratados aqui:
 *   • texto puro   → re-hash com bcrypt (o usuário continua logando com a mesma senha)
 *   • hash do PHP  → aproveitado como está (o formato $2y$ do PHP é compatível
 *                    com bcrypt do Node; o prefixo é normalizado para $2b$)
 *   • vazio/nulo   → senha provisória de LEGACY_DEFAULT_PASSWORD
 */
// Precisa vir antes de qualquer outro import: `ts-node` não carrega o `.env`,
// e este script depende dele tanto para o DATABASE_URL quanto para as
// LEGACY_MYSQL_* e o BCRYPT_SALT_ROUNDS lidos logo abaixo.
import 'dotenv/config';

import {
  PrismaClient,
  Role,
  StatusCertificacao,
  StatusPagamento,
  StatusRegistro,
  TipoPessoa,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import mysql, { RowDataPacket } from 'mysql2/promise';

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes('--dry-run');
const SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS ?? 12);
const SENHA_PROVISORIA =
  process.env.LEGACY_DEFAULT_PASSWORD ?? 'ProcertTrocar@2026';

/** Mapeia ids do legado para os ids novos, por entidade. */
const mapa = {
  estado: new Map<number, number>(),
  cliente: new Map<number, number>(),
  funcionario: new Map<number, number>(),
  produto: new Map<number, number>(),
  etapa: new Map<number, number>(),
  certificacao: new Map<number, number>(),
};

const contadores: Record<string, number> = {};
function contar(entidade: string): void {
  contadores[entidade] = (contadores[entidade] ?? 0) + 1;
}

// --------------------------------------------------------------------------
// Helpers de conversão
// --------------------------------------------------------------------------

function texto(valor: unknown, tamanhoMax?: number): string | null {
  if (valor === null || valor === undefined) return null;
  const s = String(valor).trim();
  if (!s) return null;
  return tamanhoMax ? s.slice(0, tamanhoMax) : s;
}

function data(valor: unknown): Date | null {
  if (!valor) return null;
  const d = valor instanceof Date ? valor : new Date(String(valor));
  return Number.isNaN(d.getTime()) ? null : d;
}

function decimal(valor: unknown): number {
  const n = Number(String(valor ?? '0').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function status(valor: unknown): StatusRegistro {
  return String(valor ?? '').toLowerCase() === 'inativo'
    ? StatusRegistro.INATIVO
    : StatusRegistro.ATIVO;
}

function tipoPessoa(valor: unknown, cnpj: unknown): TipoPessoa {
  const s = String(valor ?? '').toLowerCase();
  if (s.includes('jur')) return TipoPessoa.JURIDICA;
  if (s.includes('fis') || s.includes('fís')) return TipoPessoa.FISICA;
  return texto(cnpj) ? TipoPessoa.JURIDICA : TipoPessoa.FISICA;
}

function statusCertificacao(valor: unknown): StatusCertificacao {
  switch (String(valor ?? '').toLowerCase().trim()) {
    case 'em_andamento':
    case 'em andamento':
      return StatusCertificacao.EM_ANDAMENTO;
    case 'aprovado':
    case 'concluido':
    case 'concluído':
      return StatusCertificacao.APROVADO;
    case 'reprovado':
    case 'atrasado':
      return StatusCertificacao.REPROVADO;
    default:
      return StatusCertificacao.PENDENTE;
  }
}

function statusPagamento(valor: unknown): StatusPagamento {
  switch (String(valor ?? '').toLowerCase().trim()) {
    case 'pago':
    case 'aprovado':
      return StatusPagamento.PAGO;
    case 'cancelado':
      return StatusPagamento.CANCELADO;
    case 'estornado':
      return StatusPagamento.ESTORNADO;
    default:
      return StatusPagamento.PENDENTE;
  }
}

/** Converte a foto do legado ('cliente/abc.jpg') em URL relativa nova. */
function foto(valor: unknown): string | null {
  const s = texto(valor);
  if (!s) return null;
  return s.startsWith('/') || s.startsWith('http') ? s : `/uploads/${s}`;
}

/**
 * Normaliza a senha do legado.
 * Retorna sempre um hash bcrypt válido para o Node.
 */
async function normalizarSenha(valor: unknown): Promise<{
  hash: string;
  origem: 'hash-php' | 'texto-puro' | 'provisoria';
}> {
  const senha = texto(valor);

  if (!senha) {
    return {
      hash: await bcrypt.hash(SENHA_PROVISORIA, SALT_ROUNDS),
      origem: 'provisoria',
    };
  }

  // password_hash() do PHP gera $2y$; o bcrypt do Node espera $2a$/$2b$.
  if (/^\$2[aby]\$\d{2}\$/.test(senha)) {
    return { hash: senha.replace(/^\$2y\$/, '$2b$'), origem: 'hash-php' };
  }

  return { hash: await bcrypt.hash(senha, SALT_ROUNDS), origem: 'texto-puro' };
}

// --------------------------------------------------------------------------
// Etapas do ETL
// --------------------------------------------------------------------------

async function migrarEstados(legacy: mysql.Connection): Promise<void> {
  const [linhas] = await legacy.query<RowDataPacket[]>(
    'SELECT * FROM tbl_estado',
  );

  for (const linha of linhas) {
    const sigla = texto(linha.sigla_uf, 2)?.toUpperCase();
    if (!sigla) continue;

    if (!DRY_RUN) {
      const estado = await prisma.estado.upsert({
        where: { sigla },
        update: {},
        create: { sigla, nome: texto(linha.nome_uf) ?? sigla },
      });
      mapa.estado.set(Number(linha.id_uf), estado.id);
    }
    contar('estados');
  }
}

async function migrarClientes(legacy: mysql.Connection): Promise<void> {
  const [linhas] = await legacy.query<RowDataPacket[]>(
    'SELECT * FROM tbl_cliente',
  );

  for (const linha of linhas) {
    const email = texto(linha.email_cliente, 150)?.toLowerCase();
    if (!email) {
      console.warn(`   ⚠ cliente ${linha.id_cliente} sem e-mail — ignorado`);
      continue;
    }

    const { hash, origem } = await normalizarSenha(linha.senha_cliente);
    if (origem === 'provisoria') {
      console.warn(`   ⚠ cliente ${email} recebeu senha provisória`);
    }

    if (!DRY_RUN) {
      const cliente = await prisma.cliente.upsert({
        where: { email },
        update: {},
        create: {
          nome: texto(linha.nome_cliente, 150) ?? email,
          email,
          senhaHash: hash,
          tipoPessoa: tipoPessoa(linha.tipo_pessoa, linha.cnpj_cliente),
          cpf: texto(linha.cpf_cliente, 14),
          cnpj: texto(linha.cnpj_cliente, 18),
          dataNascimento: data(linha.nasc_cliente),
          telefone: texto(linha.telefone_cliente, 20),
          cep: texto(linha.cep_cliente, 9),
          endereco: texto(linha.endereco_cliente, 255),
          bairro: texto(linha.bairro_cliente, 120),
          cidade: texto(linha.cidade_cliente, 120),
          estadoId: mapa.estado.get(Number(linha.id_uf)) ?? null,
          fotoUrl: foto(linha.foto_cliente),
          status: status(linha.status_cliente),
        },
      });
      mapa.cliente.set(Number(linha.id_cliente), cliente.id);
    }
    contar('clientes');
  }
}

async function migrarFuncionarios(legacy: mysql.Connection): Promise<void> {
  const [linhas] = await legacy.query<RowDataPacket[]>(
    'SELECT * FROM tbl_funcionario',
  );

  for (const linha of linhas) {
    const email = texto(linha.email_funcionario, 150)?.toLowerCase();
    if (!email) {
      console.warn(
        `   ⚠ funcionário ${linha.id_funcionario} sem e-mail — ignorado`,
      );
      continue;
    }

    const { hash } = await normalizarSenha(linha.senha_funcionario);
    const role =
      Number(linha.id_tipo_usuario) === 1 ? Role.ADMIN : Role.FUNCIONARIO;

    if (!DRY_RUN) {
      const funcionario = await prisma.funcionario.upsert({
        where: { email },
        update: {},
        create: {
          nome: texto(linha.nome_funcionario, 150) ?? email,
          email,
          senhaHash: hash,
          role,
          tipoPessoa: tipoPessoa(linha.tipo_pessoa, linha.cnpj_funcionario),
          cpf: texto(linha.cpf_funcionario, 14),
          cnpj: texto(linha.cnpj_funcionario, 18),
          dataNascimento: data(linha.nasc_funcionario),
          telefone: texto(linha.telefone_funcionario, 20),
          cep: texto(linha.cep_funcionario, 9),
          endereco: texto(linha.endereco_funcionario, 255),
          bairro: texto(linha.bairro_funcionario, 120),
          cidade: texto(linha.cidade_funcionario, 120),
          estadoId: mapa.estado.get(Number(linha.id_uf)) ?? null,
          fotoUrl: foto(linha.foto_funcionario),
          status: status(linha.status_funcionario),
        },
      });
      mapa.funcionario.set(Number(linha.id_funcionario), funcionario.id);
    }
    contar(role === Role.ADMIN ? 'administradores' : 'funcionarios');
  }
}

async function migrarEtapas(legacy: mysql.Connection): Promise<void> {
  const [linhas] = await legacy.query<RowDataPacket[]>(
    'SELECT * FROM tbl_etapa_certificacao ORDER BY ordem_certificacao ASC',
  );

  let ordem = 0;
  for (const linha of linhas) {
    const nome = texto(linha.nome_certificacao, 120);
    if (!nome) continue;
    ordem += 1;

    // O legado tinha DOIS campos de "ativo" concorrentes; aqui viram um só.
    const ativo =
      String(linha.status_etapa ?? 'Ativo').toLowerCase() !== 'inativo' &&
      Number(linha.ativo_certificacao ?? 1) !== 0;

    if (!DRY_RUN) {
      const etapa = await prisma.etapaCertificacao.upsert({
        where: { nome },
        update: { ordem },
        create: {
          nome,
          descricao: texto(linha.descricao_certificacao),
          ordem,
          ativo,
        },
      });
      mapa.etapa.set(Number(linha.id_etapa), etapa.id);
    }
    contar('etapas');
  }
}

async function migrarProdutos(legacy: mysql.Connection): Promise<void> {
  const [linhas] = await legacy.query<RowDataPacket[]>(
    'SELECT * FROM tbl_produto',
  );

  for (const linha of linhas) {
    const clienteId = mapa.cliente.get(Number(linha.id_cliente));
    if (!clienteId) {
      console.warn(
        `   ⚠ produto ${linha.id_produto} aponta para cliente inexistente — ignorado`,
      );
      continue;
    }

    if (!DRY_RUN) {
      const produto = await prisma.produto.create({
        data: {
          clienteId,
          nome: texto(linha.nome_produto, 150) ?? 'Produto sem nome',
          descricao: texto(linha.descricao_produto),
          preco: decimal(linha.preco_produto),
          fotoUrl: foto(linha.foto_produto),
          status: status(linha.status_produto),
          criadoEm: data(linha.criado_em) ?? new Date(),
        },
      });
      mapa.produto.set(Number(linha.id_produto), produto.id);
    }
    contar('produtos');
  }
}

async function migrarCertificacoes(legacy: mysql.Connection): Promise<void> {
  const [linhas] = await legacy.query<RowDataPacket[]>(
    'SELECT * FROM tbl_certificacao_produto',
  );

  for (const linha of linhas) {
    const produtoId = mapa.produto.get(Number(linha.id_produto));
    const etapaId = mapa.etapa.get(Number(linha.id_etapa));
    if (!produtoId || !etapaId) {
      console.warn(
        `   ⚠ certificação ${linha.id_certificacao} com produto/etapa inexistente — ignorada`,
      );
      continue;
    }

    if (!DRY_RUN) {
      // O legado permitia duplicidade (produto, etapa); aqui há UNIQUE.
      const certificacao = await prisma.certificacaoProduto.upsert({
        where: { produtoId_etapaId: { produtoId, etapaId } },
        update: {
          status: statusCertificacao(linha.status),
          observacao: texto(linha.observacao_certificacao),
        },
        create: {
          produtoId,
          etapaId,
          status: statusCertificacao(linha.status),
          observacao: texto(linha.observacao_certificacao),
          atualizadoEm: data(linha.atualizado_em) ?? new Date(),
        },
      });
      mapa.certificacao.set(Number(linha.id_certificacao), certificacao.id);
    }
    contar('certificacoes');
  }
}

async function migrarHistorico(legacy: mysql.Connection): Promise<void> {
  const [linhas] = await legacy.query<RowDataPacket[]>(
    'SELECT * FROM tbl_certificacao_historico ORDER BY alterado_em ASC',
  );

  for (const linha of linhas) {
    const certificacaoId = mapa.certificacao.get(Number(linha.id_certificacao));
    if (!certificacaoId) continue;

    if (!DRY_RUN) {
      await prisma.certificacaoHistorico.create({
        data: {
          certificacaoId,
          statusAnterior: linha.status_anterior
            ? statusCertificacao(linha.status_anterior)
            : null,
          statusNovo: statusCertificacao(linha.status_novo),
          observacao: texto(linha.observacao_certificacao),
          // No legado era texto livre; preservamos o nome e deixamos o vínculo nulo.
          alteradoPorNome: texto(linha.alterado_por, 150) ?? 'Migração legado',
          alteradoEm: data(linha.alterado_em) ?? new Date(),
        },
      });
    }
    contar('historico');
  }
}

async function migrarPagamentos(legacy: mysql.Connection): Promise<void> {
  let linhas: RowDataPacket[] = [];
  try {
    [linhas] = await legacy.query<RowDataPacket[]>('SELECT * FROM tbl_pagamento');
  } catch {
    console.warn('   ⚠ tbl_pagamento não encontrada — etapa ignorada');
    return;
  }

  for (const linha of linhas) {
    const produtoId = mapa.produto.get(Number(linha.id_produto));
    if (!produtoId) continue;

    if (!DRY_RUN) {
      await prisma.pagamento.create({
        data: {
          produtoId,
          valor: decimal(linha.valor_pagamento ?? linha.valor),
          status: statusPagamento(linha.status_pagamento),
          dataPagamento: data(linha.data_pagamento),
          criadoEm: data(linha.criado_em) ?? new Date(),
        },
      });
    }
    contar('pagamentos');
  }
}

// --------------------------------------------------------------------------
// Orquestração
// --------------------------------------------------------------------------

async function main(): Promise<void> {
  const obrigatorias = [
    'LEGACY_MYSQL_HOST',
    'LEGACY_MYSQL_USER',
    'LEGACY_MYSQL_DATABASE',
  ];
  const faltando = obrigatorias.filter((v) => !process.env[v]);
  if (faltando.length) {
    console.error(
      `❌ Variáveis ausentes no .env: ${faltando.join(', ')}`,
    );
    process.exit(1);
  }

  console.log(
    DRY_RUN
      ? '🔍 SIMULAÇÃO (--dry-run): nada será gravado no PostgreSQL'
      : '🚚 Migrando dados do MySQL legado para o PostgreSQL',
  );

  const legacy = await mysql.createConnection({
    host: process.env.LEGACY_MYSQL_HOST,
    port: Number(process.env.LEGACY_MYSQL_PORT ?? 3306),
    user: process.env.LEGACY_MYSQL_USER,
    password: process.env.LEGACY_MYSQL_PASSWORD,
    database: process.env.LEGACY_MYSQL_DATABASE,
    dateStrings: false,
  });

  try {
    const passos: Array<[string, () => Promise<void>]> = [
      ['estados', () => migrarEstados(legacy)],
      ['clientes', () => migrarClientes(legacy)],
      ['funcionários/administradores', () => migrarFuncionarios(legacy)],
      ['etapas', () => migrarEtapas(legacy)],
      ['produtos', () => migrarProdutos(legacy)],
      ['certificações', () => migrarCertificacoes(legacy)],
      ['histórico', () => migrarHistorico(legacy)],
      ['pagamentos', () => migrarPagamentos(legacy)],
    ];

    for (const [nome, executar] of passos) {
      console.log(`\n▶ ${nome}`);
      await executar();
    }

    console.log('\n📊 Resumo:');
    for (const [entidade, total] of Object.entries(contadores)) {
      console.log(`   ${entidade.padEnd(20)} ${total}`);
    }
    console.log(
      DRY_RUN
        ? '\n🔍 Simulação concluída — nenhuma alteração aplicada.'
        : '\n✅ Migração concluída.',
    );
    console.log(
      '\nℹ Peça a todos os usuários que redefinam a senha no primeiro acesso.',
    );
  } finally {
    await legacy.end();
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('❌ Falha na migração:', error);
  process.exit(1);
});
