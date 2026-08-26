import { describe, expect, it } from 'vitest';

import { chaves, queryClient } from './queryClient';

/**
 * As chaves de cache são o contrato entre quem lê e quem invalida. Uma chave
 * escrita à mão num `invalidateQueries` que não bate com a do `useQuery`
 * **não gera erro**: a mutação responde, o toast de sucesso aparece, e a lista
 * simplesmente não atualiza. O usuário conclui que a gravação falhou.
 */

describe('política padrão do QueryClient', () => {
  const padrao = queryClient.getDefaultOptions().queries!;

  it('não repete requisição em erro 4xx', () => {
    /*
     * Insistir num 403 ou num 400 é latência pura: a resposta não vai mudar, e
     * o usuário espera três vezes o tempo para ver o mesmo erro.
     */
    const repetir = padrao.retry as (t: number, e: unknown) => boolean;

    expect(repetir(0, { response: { status: 403 } })).toBe(false);
    expect(repetir(0, { response: { status: 400 } })).toBe(false);
    expect(repetir(0, { response: { status: 404 } })).toBe(false);
  });

  it('repete em erro 5xx e em falha sem status, até duas vezes', () => {
    const repetir = padrao.retry as (t: number, e: unknown) => boolean;

    expect(repetir(0, { response: { status: 500 } })).toBe(true);
    expect(repetir(1, {})).toBe(true);
    expect(repetir(2, {})).toBe(false);
  });

  it('mutação nunca repete', () => {
    // Repetir um POST duplicaria o registro — pior que falhar.
    expect(queryClient.getDefaultOptions().mutations?.retry).toBe(false);
  });

  it('não refaz a consulta ao voltar para a aba', () => {
    expect(padrao.refetchOnWindowFocus).toBe(false);
  });
});

describe('chaves', () => {
  it('as chaves com filtro mudam quando o filtro muda', () => {
    // Se não mudassem, trocar de página mostraria os dados da página anterior.
    expect(chaves.clientes({ pagina: 1 })).not.toEqual(
      chaves.clientes({ pagina: 2 }),
    );
    expect(chaves.produtos({ busca: 'a' })).not.toEqual(
      chaves.produtos({ busca: 'b' }),
    );
  });

  it('a mesma entrada devolve a mesma chave', () => {
    // Chave instável faria o cache nunca acertar e refetch a cada render.
    expect(chaves.clientes({ pagina: 1 })).toEqual(chaves.clientes({ pagina: 1 }));
    expect(chaves.cliente(7)).toEqual(chaves.cliente(7));
  });

  it('filtro ausente não vira `undefined` na chave', () => {
    // `['clientes', undefined]` e `['clientes', {}]` são chaves diferentes.
    expect(chaves.clientes()).toEqual(['clientes', {}]);
    expect(chaves.produtos()).toEqual(['produtos', {}]);
  });

  it('cada domínio tem prefixo próprio, e ids não colidem entre domínios', () => {
    /*
     * `invalidateQueries({ queryKey: ['clientes'] })` derruba tudo que começa
     * com esse prefixo. Sem prefixo próprio, invalidar clientes derrubaria
     * produtos junto — ou, pior, não derrubaria o que devia.
     */
    expect(chaves.cliente(1)[0]).toBe('clientes');
    expect(chaves.produto(1)[0]).toBe('produtos');
    expect(chaves.cliente(1)).not.toEqual(chaves.produto(1));
  });

  it('os relatórios compartilham o prefixo `relatorios`', () => {
    for (const chave of [
      chaves.relatorioEquipe(),
      chaves.comparativoProdutos(),
      chaves.comparativoClientes(),
      chaves.tempoCiclo(),
    ]) {
      expect(chave[0]).toBe('relatorios');
    }

    // E são distintas entre si, senão um relatório serviria dados de outro.
    const todas = [
      JSON.stringify(chaves.relatorioEquipe()),
      JSON.stringify(chaves.comparativoProdutos()),
      JSON.stringify(chaves.comparativoClientes()),
      JSON.stringify(chaves.tempoCiclo()),
    ];
    expect(new Set(todas).size).toBe(todas.length);
  });

  it('nenhuma chave é string solta — todas são array', () => {
    // O TanStack Query exige array; string solta é erro em tempo de execução.
    const estaticas = [chaves.perfil, chaves.dashboard, chaves.graficos, chaves.estados];
    for (const chave of estaticas) expect(Array.isArray(chave)).toBe(true);
  });
});
