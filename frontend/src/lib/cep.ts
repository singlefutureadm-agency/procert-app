/**
 * Consulta de endereço por CEP.
 *
 * Usa o ViaCEP, que é público, aceita chamada direta do navegador e não exige
 * chave. O que sai daqui é só o CEP — nenhum dado do cliente ou do processo de
 * certificação atravessa para o serviço.
 *
 * A consulta **não passa pela nossa API** de propósito: seria um proxy sem
 * função, somando uma partida a frio da função serverless a cada campo
 * preenchido, para repassar um dado que já é público.
 *
 * Os Correios não publicam uma API aberta de consulta — o que se chama
 * informalmente de "API dos Correios" costuma ser justamente o ViaCEP, que
 * espelha a base oficial.
 */

const URL_BASE = 'https://viacep.com.br/ws';

/** Tempo máximo de espera. Passando disso, digitar à mão é mais rápido do que
 *  continuar esperando — e o formulário não pode ficar preso num serviço de
 *  terceiro. */
const TEMPO_LIMITE_MS = 6000;

export interface EnderecoCep {
  cep: string;
  endereco: string;
  bairro: string;
  cidade: string;
  /** Sigla da UF, para casar com a tabela `estados`. */
  uf: string;
}

/** Resposta do ViaCEP. `erro` vem como boolean ou string, conforme o caso. */
interface RespostaViaCep {
  cep?: string;
  logradouro?: string;
  complemento?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  erro?: boolean | string;
}

export class CepInvalidoError extends Error {}
export class CepIndisponivelError extends Error {}

/** Deixa só os dígitos — o campo chega mascarado como `01310-100`. */
export function apenasDigitos(cep: string): string {
  return cep.replace(/\D/g, '');
}

/** Verdadeiro quando o valor tem os 8 dígitos de um CEP. */
export function cepCompleto(cep: string): boolean {
  return apenasDigitos(cep).length === 8;
}

export async function buscarCep(cep: string): Promise<EnderecoCep> {
  const digitos = apenasDigitos(cep);

  if (digitos.length !== 8) {
    throw new CepInvalidoError('O CEP deve ter 8 dígitos.');
  }

  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), TEMPO_LIMITE_MS);

  let resposta: Response;
  try {
    resposta = await fetch(`${URL_BASE}/${digitos}/json/`, { signal: controle.signal });
  } catch {
    // Rede fora, serviço fora ou tempo esgotado — para quem preenche o
    // formulário é a mesma coisa: siga digitando.
    throw new CepIndisponivelError('Não foi possível consultar o CEP agora.');
  } finally {
    clearTimeout(relogio);
  }

  if (!resposta.ok) {
    throw new CepIndisponivelError('Não foi possível consultar o CEP agora.');
  }

  const dados = (await resposta.json()) as RespostaViaCep;

  // CEP com formato válido mas inexistente devolve 200 com `erro: true` — não
  // é falha de rede, e a mensagem precisa ser outra.
  if (dados.erro) {
    throw new CepInvalidoError('CEP não encontrado.');
  }

  return {
    cep: dados.cep ?? cep,
    // Alguns CEPs de logradouro único não trazem rua nem bairro; devolvemos
    // string vazia para o preenchimento não apagar o que a pessoa já digitou.
    endereco: dados.logradouro ?? '',
    bairro: dados.bairro ?? '',
    cidade: dados.localidade ?? '',
    uf: dados.uf ?? '',
  };
}
