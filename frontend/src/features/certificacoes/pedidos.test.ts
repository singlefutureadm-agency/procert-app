import { describe, expect, it } from 'vitest';

import type { DocumentoMicroEtapa, MicroEtapaCertificacao, SituacaoDocumento } from '@/types';
import {
  aguardandoEnvioDoCliente,
  CLASSE_SITUACAO,
  esperandoAceite,
  ROTULO_SITUACAO,
  situacaoDoPedido,
  temAceite,
  ultimoEnvio,
} from './pedidos';

/**
 * A regra do documento pedido ao cliente.
 *
 * Nada aqui lança exceção quando quebra, e é por isso que está coberto:
 *
 *  - `esperandoAceite` errado habilita uma marcação que o SERVIDOR recusa. A
 *    tela oferece o clique, o backend devolve 400, e o usuário recebe um toast
 *    genérico longe do item que tentou marcar.
 *  - `temAceite` olhando só o último envio liberaria/travaria o item na hora
 *    errada depois de um reenvio.
 *  - `ultimoEnvio` depende da ORDEM que o backend manda (`id` desc). Invertida,
 *    a tela mostra o parecer de uma recusa antiga ao lado de um arquivo novo.
 *  - `aguardandoEnvioDoCliente` verdadeiro durante o `PENDENTE` convidaria o
 *    cliente a mandar o mesmo arquivo de novo.
 */

const envio = (
  id: number,
  situacao: SituacaoDocumento | null,
  parecer: string | null = null,
): DocumentoMicroEtapa => ({
  id,
  nomeArquivo: `arquivo-${id}.pdf`,
  tipoMime: 'application/pdf',
  tamanhoBytes: 1024,
  enviadoPorNome: 'Indústria Cliente Ltda',
  enviadoPorCliente: true,
  situacao,
  parecer,
  avaliadoPorNome: situacao === 'PENDENTE' || situacao === null ? null : 'Ana',
  avaliadoEm: situacao === 'PENDENTE' || situacao === null ? null : '2026-11-17T12:00:00Z',
  criadoEm: '2026-11-17T10:00:00Z',
});

const item = (
  extra: Partial<MicroEtapaCertificacao> = {},
): MicroEtapaCertificacao => ({
  id: 5,
  nome: 'Certificado de calibração',
  ordem: 1,
  papelResponsavel: null,
  prazoSlaHoras: null,
  exigeDocumento: true,
  concluida: false,
  concluidaEm: null,
  concluidaPorNome: null,
  documentos: [],
  ...extra,
});

describe('ultimoEnvio', () => {
  it('devolve o primeiro da lista — o backend manda em id DESCENDENTE', () => {
    const atual = ultimoEnvio(
      item({ documentos: [envio(9, 'PENDENTE'), envio(3, 'RECUSADO', 'Vencido.')] }),
    );

    expect(atual?.id).toBe(9);
  });

  it('devolve null sem nenhum envio, e não `undefined`', () => {
    // A tela distingue "não enviado" de ausência de dado; `undefined` vazando
    // para o JSX renderiza nada, sem erro.
    expect(ultimoEnvio(item())).toBeNull();
  });
});

describe('temAceite', () => {
  it('é falso com envio apenas PENDENTE', () => {
    expect(temAceite(item({ documentos: [envio(1, 'PENDENTE')] }))).toBe(false);
  });

  it('é falso com envio RECUSADO', () => {
    // "Tem documento" seria verdade aqui, e é justamente o erro: o arquivo foi
    // olhado e negado.
    expect(temAceite(item({ documentos: [envio(1, 'RECUSADO', 'Vencido.')] }))).toBe(
      false,
    );
  });

  it('é verdadeiro com um ACEITO', () => {
    expect(temAceite(item({ documentos: [envio(1, 'ACEITO')] }))).toBe(true);
  });

  it('olha a lista INTEIRA: aceite anterior conta, mesmo com reenvio em análise', () => {
    const lista = item({
      documentos: [envio(9, 'PENDENTE'), envio(3, 'ACEITO')],
    });

    expect(temAceite(lista)).toBe(true);
  });
});

describe('esperandoAceite', () => {
  it('item que NÃO pede documento nunca espera', () => {
    // Tratar os dois iguais travaria o checklist inteiro.
    expect(
      esperandoAceite(item({ exigeDocumento: false, documentos: [] })),
    ).toBe(false);
  });

  it('pede documento e não tem aceite: espera', () => {
    expect(esperandoAceite(item())).toBe(true);
    expect(esperandoAceite(item({ documentos: [envio(1, 'PENDENTE')] }))).toBe(true);
    expect(
      esperandoAceite(item({ documentos: [envio(1, 'RECUSADO', 'Vencido.')] })),
    ).toBe(true);
  });

  it('pede documento e tem aceite: não espera', () => {
    expect(esperandoAceite(item({ documentos: [envio(1, 'ACEITO')] }))).toBe(false);
  });
});

describe('aguardandoEnvioDoCliente', () => {
  it('sem envio: o cliente precisa enviar', () => {
    expect(aguardandoEnvioDoCliente(item())).toBe(true);
  });

  it('com PENDENTE: NÃO oferece reenvio', () => {
    // Oferecer "reenviar" para quem acabou de enviar convida a mandar o mesmo
    // arquivo duas vezes, e a equipe a julgar duas linhas idênticas.
    expect(
      aguardandoEnvioDoCliente(item({ documentos: [envio(1, 'PENDENTE')] })),
    ).toBe(false);
  });

  it('com RECUSADO: oferece reenvio', () => {
    expect(
      aguardandoEnvioDoCliente(item({ documentos: [envio(1, 'RECUSADO', 'Vencido.')] })),
    ).toBe(true);
  });

  it('com ACEITO: nada a enviar', () => {
    expect(
      aguardandoEnvioDoCliente(item({ documentos: [envio(1, 'ACEITO')] })),
    ).toBe(false);
  });
});

describe('situacaoDoPedido', () => {
  it.each([
    { caso: 'sem envio', documentos: [], esperado: 'aguardando documento do cliente' },
    {
      caso: 'pendente',
      documentos: [envio(1, 'PENDENTE')],
      esperado: 'documento em análise',
    },
    {
      caso: 'recusado',
      documentos: [envio(1, 'RECUSADO', 'Vencido.')],
      esperado: 'documento recusado — aguardando reenvio',
    },
    { caso: 'aceito', documentos: [envio(1, 'ACEITO')], esperado: 'documento aceito' },
  ])('$caso → "$esperado"', ({ documentos, esperado }) => {
    expect(situacaoDoPedido(item({ documentos }))).toBe(esperado);
  });
});

describe('rótulos e classes', () => {
  it('toda situação tem rótulo em TEXTO', () => {
    // A cor acompanha, nunca carrega: --cor-sucesso × --cor-erro têm ΔE 5,0 sob
    // deuteranopia, e aqui a diferença decide se o cliente reenvia o arquivo.
    const situacoes: SituacaoDocumento[] = ['PENDENTE', 'ACEITO', 'RECUSADO'];

    for (const situacao of situacoes) {
      expect(ROTULO_SITUACAO[situacao]).toBeTruthy();
      expect(CLASSE_SITUACAO[situacao]).toContain('badge');
    }
  });

  it('os rótulos são distintos entre si', () => {
    const rotulos = Object.values(ROTULO_SITUACAO);
    expect(new Set(rotulos).size).toBe(rotulos.length);
  });
});
