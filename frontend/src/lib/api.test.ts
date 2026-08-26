import { AxiosError, AxiosHeaders } from 'axios';
import { describe, expect, it } from 'vitest';

import { mensagemDeErro } from './api';

/**
 * `mensagemDeErro` é o único tradutor entre a API e o que o usuário lê num
 * toast. Quando ele erra, a tela mostra "Não foi possível concluir a operação"
 * em cima de um 400 que dizia exatamente qual campo estava errado — e o suporte
 * recebe um chamado que o próprio erro já respondia.
 */

function erroDaApi(dados: unknown, status = 400): AxiosError {
  const erro = new AxiosError('Request failed');
  erro.response = {
    data: dados,
    status,
    statusText: '',
    headers: new AxiosHeaders(),
    config: { headers: new AxiosHeaders() },
  };
  return erro;
}

describe('mensagemDeErro', () => {
  it('junta o ARRAY do ValidationPipe com separador legível', () => {
    /*
     * O `ValidationPipe` global do Nest devolve `message` como array — um item
     * por campo inválido. Sem este ramo o usuário veria `[object Object]` ou a
     * mensagem padrão, perdendo justamente a lista de campos.
     */
    const erro = erroDaApi({
      message: ['nome deve ser preenchido', 'email inválido'],
    });

    expect(mensagemDeErro(erro)).toBe(
      'nome deve ser preenchido · email inválido',
    );
  });

  it('usa a string quando a API manda uma mensagem só', () => {
    const erro = erroDaApi({ message: 'Este e-mail já está em uso.' }, 409);
    expect(mensagemDeErro(erro)).toBe('Este e-mail já está em uso.');
  });

  it('explica a falha de rede em vez de culpar o formulário', () => {
    const erro = new AxiosError('Network Error');
    erro.code = 'ERR_NETWORK';

    // Sem isto, backend fora do ar aparece como se o usuário tivesse errado algo.
    expect(mensagemDeErro(erro)).toMatch(/não foi possível conectar à api/i);
  });

  it('cai no padrão para erro sem corpo reconhecível', () => {
    expect(mensagemDeErro(erroDaApi(undefined, 500))).toBe(
      'Não foi possível concluir a operação.',
    );
    expect(mensagemDeErro(erroDaApi({ mensagem: 'chave errada' }))).toBe(
      'Não foi possível concluir a operação.',
    );
  });

  it('respeita o padrão informado por quem chamou', () => {
    const padrao = 'Não foi possível gerar a planilha.';
    expect(mensagemDeErro(erroDaApi({}, 500), padrao)).toBe(padrao);
  });

  it('não quebra com o que não é AxiosError', () => {
    // Um `throw new Error` de dentro do próprio frontend chega aqui igual.
    expect(mensagemDeErro(new Error('boom'))).toBe(
      'Não foi possível concluir a operação.',
    );
    expect(mensagemDeErro(null)).toBe('Não foi possível concluir a operação.');
    expect(mensagemDeErro('texto solto')).toBe(
      'Não foi possível concluir a operação.',
    );
  });
});
