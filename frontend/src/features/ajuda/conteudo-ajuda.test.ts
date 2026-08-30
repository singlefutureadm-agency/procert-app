import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';

import { router } from '@/router';

import { AJUDA_TELAS, ajudaDaRota, resolverAjuda } from './conteudo-ajuda';

/**
 * O que estes casos protegem é uma lacuna SILENCIOSA.
 *
 * `AjudaDaTela` devolve `null` quando a rota não tem verbete — é o que permite
 * deixar o botão fixo no `CabecalhoPagina` sem abrir modal vazio em tela
 * alguma. O preço é que uma tela nova simplesmente não ganha ajuda, sem erro,
 * sem aviso e sem nada quebrado na revisão de código. Só um usuário reparando
 * que "nesta tela não tem o botão" descobriria.
 *
 * Vale igual para a variante do cliente: sem ela, ele recebe o texto da equipe
 * — que fala em aprovar etapa e emitir certificado, coisas que ele não faz.
 * Também não quebra nada; só deixa de ajudar.
 *
 * Por isso a fonte da verdade aqui são as rotas REAIS do `router.tsx`, lidas do
 * roteador montado, e não uma segunda lista copiada à mão — que sairia de
 * sincronia pelo mesmo motivo que a ajuda sairia.
 */

interface RotaDoPainel {
  caminho: string;
  /** `null` quando a rota não é restrita, ou seja: o cliente também entra. */
  papeis: string[] | null;
}

/**
 * As telas do painel são as filhas da rota de layout — a única sem `path`, que
 * envolve tudo em `<RotaProtegida>`. As rotas públicas (home, login, páginas
 * institucionais) ficam de fora de propósito: a ajuda é a bússola de quem está
 * operando o sistema, não do visitante do site.
 *
 * O papel sai do `element`: rota restrita é declarada como
 * `<RotaProtegida papeis={[...]}>`, então `element.props.papeis` diz quem
 * entra. Ler isso do roteador — em vez de manter aqui uma lista de "telas do
 * cliente" — é o que faz uma mudança de permissão no `router.tsx` reprovar o
 * teste em vez de passar despercebida.
 */
function rotasDoPainel(): RotaDoPainel[] {
  const layout = router.routes.find(
    (rota) => !rota.path && (rota.children?.length ?? 0) > 0,
  );

  return (layout?.children ?? [])
    .filter((rota) => Boolean(rota.path))
    .map((rota) => {
      const elemento = rota.element as ReactElement<{ papeis?: string[] }> | undefined;

      return {
        caminho: `/${rota.path}`,
        papeis: elemento?.props?.papeis ?? null,
      };
    });
}

const rotasDoCliente = () =>
  rotasDoPainel()
    .filter((rota) => rota.papeis === null)
    .map((rota) => rota.caminho);

describe('conteúdo de ajuda das telas', () => {
  it('encontra as rotas do painel no roteador', () => {
    // Se o `router.tsx` for reestruturado e a rota de layout deixar de ser a
    // única sem `path`, esta busca devolveria vazio e todos os casos abaixo
    // passariam por não terem o que checar. Este caso é a trava disso.
    expect(rotasDoPainel().length).toBeGreaterThan(15);
  });

  it('distingue as telas do cliente das restritas à equipe', () => {
    // Mesma trava, para a leitura de `papeis`: se ela parasse de funcionar,
    // toda rota viraria "do cliente" ou nenhuma viraria, e o caso seguinte
    // deixaria de significar alguma coisa.
    const doCliente = rotasDoCliente();

    expect(doCliente).toContain('/dashboard');
    expect(doCliente).toContain('/nao-conformidades');
    expect(doCliente).not.toContain('/equipe');
    expect(doCliente).not.toContain('/relatorios/equipe');
    expect(doCliente.length).toBeLessThan(rotasDoPainel().length);
  });

  it('tem verbete para toda tela do painel', () => {
    const comVerbete = new Set(AJUDA_TELAS.map((ajuda) => ajuda.rota));
    const semAjuda = rotasDoPainel()
      .map((rota) => rota.caminho)
      .filter((caminho) => !comVerbete.has(caminho));

    expect(semAjuda).toEqual([]);
  });

  it('tem variante do cliente em toda tela que o cliente alcança', () => {
    const semVariante = rotasDoCliente().filter(
      (caminho) => !ajudaDaRota(caminho)?.cliente,
    );

    expect(semVariante).toEqual([]);
  });

  it('não escreve variante do cliente para tela que ele não alcança', () => {
    // Texto que ninguém lê envelhece sem ninguém notar, e passa a impressão de
    // que o cliente entra numa tela em que ele recebe "sem permissão".
    const doCliente = new Set(rotasDoCliente());
    const inuteis = AJUDA_TELAS.filter(
      (ajuda) => ajuda.cliente && !doCliente.has(ajuda.rota),
    ).map((ajuda) => ajuda.rota);

    expect(inuteis).toEqual([]);
  });

  it('não tem verbete apontando para rota inexistente', () => {
    const doPainel = new Set(rotasDoPainel().map((rota) => rota.caminho));
    const orfaos = AJUDA_TELAS.map((ajuda) => ajuda.rota).filter(
      (rota) => !doPainel.has(rota),
    );

    expect(orfaos).toEqual([]);
  });

  it('não repete a mesma rota em dois verbetes', () => {
    // Duplicata não quebraria nada visivelmente: `find` devolveria sempre o
    // primeiro, e o segundo texto — provavelmente o mais novo — nunca
    // apareceria para ninguém.
    const rotas = AJUDA_TELAS.map((ajuda) => ajuda.rota);
    expect(rotas).toHaveLength(new Set(rotas).size);
  });

  it('resolve rota com parâmetro a partir de uma URL concreta', () => {
    expect(ajudaDaRota('/certificacoes/produto/42')?.rota).toBe(
      '/certificacoes/produto/:produtoId',
    );
    expect(ajudaDaRota('/produtos/7/editar')?.rota).toBe('/produtos/:id/editar');
    expect(ajudaDaRota('/categorias/3')?.rota).toBe('/categorias/:id');
  });

  it('não deixa um padrão curto capturar a URL de outro mais longo', () => {
    // `matchPath` casa o caminho inteiro, então `/produtos` não pega
    // `/produtos/novo`. Se isso mudasse, a ajuda de "cadastrar produto" seria
    // substituída pela da listagem sem nenhum sintoma visível.
    expect(ajudaDaRota('/produtos/novo')?.rota).toBe('/produtos/novo');
    expect(ajudaDaRota('/produtos')?.rota).toBe('/produtos');
    expect(ajudaDaRota('/dashboard/aparencia')?.rota).toBe('/dashboard/aparencia');
    expect(ajudaDaRota('/dashboard')?.rota).toBe('/dashboard');
    expect(ajudaDaRota('/certificacoes/em-risco')?.rota).toBe(
      '/certificacoes/em-risco',
    );
  });

  it('devolve indefinido fora do painel', () => {
    expect(ajudaDaRota('/login')).toBeUndefined();
    expect(ajudaDaRota('/sobre')).toBeUndefined();
  });

  it('tem resumo e ao menos dois tópicos em cada verbete, nos dois papéis', () => {
    // Um verbete de uma linha não guia ninguém; é o mínimo que faz o botão
    // valer o clique.
    for (const verbete of AJUDA_TELAS) {
      for (const ehCliente of [false, true]) {
        if (ehCliente && !verbete.cliente) continue;

        const ajuda = resolverAjuda(verbete, ehCliente);
        const onde = `${verbete.rota}${ehCliente ? ' (cliente)' : ''}`;

        expect(ajuda.resumo.length, onde).toBeGreaterThan(40);
        expect(ajuda.topicos.length, onde).toBeGreaterThanOrEqual(2);

        for (const topico of ajuda.topicos) {
          expect(topico.titulo.length, `${onde} · ${topico.titulo}`).toBeGreaterThan(3);
          expect(topico.texto.length, `${onde} · ${topico.titulo}`).toBeGreaterThan(30);
        }
      }
    }
  });

  it('não repete o texto da equipe dentro da variante do cliente', () => {
    // Variante que só copia o texto original é pior que variante nenhuma: dá a
    // impressão de que a tela foi adaptada quando não foi.
    for (const verbete of AJUDA_TELAS) {
      if (!verbete.cliente?.topicos) continue;

      const daEquipe = new Set(verbete.topicos.map((topico) => topico.texto));
      const copiados = verbete.cliente.topicos.filter((topico) =>
        daEquipe.has(topico.texto),
      );

      expect(copiados, verbete.rota).toEqual([]);
    }
  });

  it('só aponta o próximo passo da equipe para uma tela que existe', () => {
    // O fio condutor do tutorial é um link. Um destino errado leva o iniciante
    // para o 404 justamente quando ele decidiu seguir a orientação.
    for (const verbete of AJUDA_TELAS) {
      const { proximoPasso } = resolverAjuda(verbete, false);
      if (!proximoPasso) continue;

      expect(ajudaDaRota(proximoPasso.para), verbete.rota).toBeDefined();
    }
  });

  it('só aponta o próximo passo do cliente para tela que o cliente alcança', () => {
    /*
     * A checagem que mais importa das duas. O roteiro da equipe passa por
     * categorias, cadastro e relatórios; herdado pelo cliente, o botão o
     * mandaria para "sem permissão" no exato momento em que ele resolveu seguir
     * a orientação do tutorial. `resolverAjuda` não herda de propósito, e é
     * isto que prova.
     */
    const doCliente = new Set(rotasDoCliente());

    for (const verbete of AJUDA_TELAS) {
      const { proximoPasso } = resolverAjuda(verbete, true);
      if (!proximoPasso) continue;

      const destino = ajudaDaRota(proximoPasso.para);
      expect(destino, `${verbete.rota} → ${proximoPasso.para}`).toBeDefined();
      expect(doCliente, `${verbete.rota} → ${proximoPasso.para}`).toContain(
        destino?.rota,
      );
    }
  });

  it('não vaza o próximo passo da equipe para o cliente', () => {
    // `/produtos` leva a equipe para `/categorias` (restrita) e o cliente para
    // `/certificacoes`. Se o fallback voltasse, este caso reprovaria.
    const produtos = ajudaDaRota('/produtos');
    expect(produtos?.proximoPasso?.para).toBe('/categorias');
    expect(resolverAjuda(produtos!, true).proximoPasso?.para).toBe('/certificacoes');
  });

  it('cai no texto da equipe quando a variante não define o campo', () => {
    const semVariante = ajudaDaRota('/equipe')!;
    const resolvido = resolverAjuda(semVariante, true);

    expect(resolvido.resumo).toBe(semVariante.resumo);
    expect(resolvido.topicos).toBe(semVariante.topicos);
    // ...menos o próximo passo, que nunca é herdado.
    expect(resolvido.proximoPasso).toBeUndefined();
  });
});
