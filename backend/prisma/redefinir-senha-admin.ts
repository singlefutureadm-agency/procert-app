/**
 * Redefine a senha de um administrador direto no banco.
 *
 * Existe por causa de um buraco do seed: o `upsert` do administrador inicial
 * usa `update: {}`, de propósito — reexecutar o seed não pode resetar a senha
 * de um admin em produção a cada deploy. O efeito colateral é que, uma vez
 * criado o registro, `npm run seed` NUNCA mais corrige a senha. Se o banco foi
 * semeado com um `SEED_ADMIN_PASSWORD` diferente do documentado, o login passa
 * a devolver 401 e não há caminho de volta pelo seed.
 *
 * A senha vem do ambiente, nunca de argumento de linha de comando: argv fica no
 * histórico do shell e na lista de processos.
 *
 *   SEED_ADMIN_EMAIL=admin@procertocp.com.br SEED_ADMIN_PASSWORD='...' \
 *     npm run senha:admin
 *
 * Contra o banco de produção, exporte antes a DATABASE_URL correspondente.
 */
// Precisa vir antes de qualquer outro import: o `prisma migrate` carrega o
// `.env` sozinho, mas `ts-node` não — sem isto o script morre com
// "Environment variable not found: DATABASE_URL".
import 'dotenv/config';

import { PrismaClient, Role, StatusRegistro } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// Mesma regra de `src/common/utils/senha.util.ts`. Repetida em vez de
// importada porque `tsconfig.scripts.json` cobre apenas `prisma/**`, e nenhum
// outro script deste diretório alcança `src/`.
const SENHA_REGEX = /^(?=.*[A-Za-zÀ-ÿ])(?=.*\d).{8,}$/;

/** Host do banco sem usuário nem senha — para conferir o alvo antes de gravar. */
function alvoDaConexao(url: string | undefined): string {
  if (!url) return '(DATABASE_URL ausente)';
  try {
    const { host, pathname } = new URL(url);
    return `${host}${pathname}`;
  } catch {
    return '(DATABASE_URL ilegível)';
  }
}

async function main(): Promise<void> {
  const email = (process.env.SEED_ADMIN_EMAIL ?? 'admin@procertocp.com.br')
    .trim()
    .toLowerCase();
  const senha = process.env.SEED_ADMIN_PASSWORD;

  if (!senha) {
    throw new Error(
      'Defina SEED_ADMIN_PASSWORD com a nova senha antes de rodar este script.',
    );
  }

  if (!SENHA_REGEX.test(senha)) {
    throw new Error(
      'A senha deve ter ao menos 8 caracteres, incluindo letras e números.',
    );
  }

  console.log(`🔐 Banco alvo: ${alvoDaConexao(process.env.DATABASE_URL)}`);

  const funcionario = await prisma.funcionario.findUnique({
    where: { email },
    select: { id: true, nome: true, role: true, status: true },
  });

  if (!funcionario) {
    throw new Error(
      `Nenhum funcionário com o e-mail ${email}. Rode \`npm run seed\` para criar o administrador inicial.`,
    );
  }

  if (funcionario.role !== Role.ADMIN) {
    throw new Error(
      `${email} existe, mas tem papel ${funcionario.role}. Este script só redefine a senha de um ADMIN.`,
    );
  }

  const saltRounds = Number(process.env.BCRYPT_SALT_ROUNDS ?? 12);
  const senhaHash = await bcrypt.hash(senha, saltRounds);

  await prisma.funcionario.update({
    where: { id: funcionario.id },
    // O status entra junto porque um admin desativado também devolve 401 no
    // login, e trocar a senha sem reativar deixaria o mesmo sintoma de pé.
    data: { senhaHash, status: StatusRegistro.ATIVO },
  });

  // A senha não é impressa: o log do terminal costuma sobreviver à sessão.
  console.log(`✔ Senha redefinida para ${funcionario.nome} <${email}>.`);
  if (funcionario.status !== StatusRegistro.ATIVO) {
    console.log(`   ↳ status ${funcionario.status} → ATIVO`);
  }
}

main()
  .catch((erro: unknown) => {
    console.error(`✖ ${erro instanceof Error ? erro.message : String(erro)}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
