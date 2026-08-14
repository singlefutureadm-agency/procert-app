import * as bcrypt from 'bcrypt';

const SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS ?? 12);

/**
 * Regra de senha da plataforma: mínimo 8 caracteres, com letra e número.
 * O legado não tinha regra alguma e guardava senhas de cliente em texto puro.
 */
export const SENHA_REGEX = /^(?=.*[A-Za-zÀ-ÿ])(?=.*\d).{8,}$/;
export const SENHA_MENSAGEM =
  'A senha deve ter ao menos 8 caracteres, incluindo letras e números.';

export function gerarHashSenha(senha: string): Promise<string> {
  return bcrypt.hash(senha, SALT_ROUNDS);
}

export function conferirSenha(senha: string, hash: string): Promise<boolean> {
  // Hashes gerados pelo password_hash() do PHP usam o prefixo $2y$,
  // equivalente ao $2b$ do Node — normalizamos para manter compatibilidade
  // com os usuários migrados do sistema legado.
  const hashCompativel = hash.replace(/^\$2y\$/, '$2b$');
  return bcrypt.compare(senha, hashCompativel);
}
