/**
 * Máscaras de digitação dos campos de documento e contato.
 *
 * Os placeholders (`00.000.000/0000-00`, `(11) 90000-0000`) sempre prometeram
 * um formato que nada aplicava: o valor ia cru para o banco, e a mesma coluna
 * acabava com `12.345.678/0001-90` num registro e `18204773000145` em outro —
 * a listagem então mostra os dois lado a lado, e buscar por documento depende
 * de adivinhar como foi digitado.
 *
 * Os limites do schema confirmam a intenção original: `VarChar(18)` no CNPJ,
 * `(14)` no CPF e `(9)` no CEP são exatamente o comprimento COM pontuação.
 *
 * Todas as funções são progressivas — formatam o que já foi digitado sem exigir
 * o campo completo, senão o usuário veria a pontuação só ao terminar.
 */

/** Só os dígitos, limitados ao tamanho do documento. */
function digitos(valor: string, maximo: number): string {
  return valor.replace(/\D/g, '').slice(0, maximo);
}

export function mascararCpf(valor: string): string {
  const d = digitos(valor, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

export function mascararCnpj(valor: string): string {
  const d = digitos(valor, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12) {
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  }
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

/**
 * Telefone fixo (10 dígitos) e celular (11) no mesmo campo.
 *
 * O corte do bloco depende do total: com 10 dígitos são 4+4, com 11 são 5+4.
 * Fixar em 5+4 deixaria o fixo como `(47) 3521-8890` escrito `(47) 35218-890`
 * enquanto não chegasse o décimo primeiro dígito — a pontuação dançaria na
 * frente de quem digita.
 */
export function mascararTelefone(valor: string): string {
  const d = digitos(valor, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function mascararCep(valor: string): string {
  const d = digitos(valor, 8);
  return d.length <= 5 ? d : `${d.slice(0, 5)}-${d.slice(5)}`;
}
