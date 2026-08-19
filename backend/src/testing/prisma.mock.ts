import { Prisma } from '@prisma/client';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';

import { PrismaService } from '../prisma/prisma.service';

/**
 * `PrismaService` mockado, com `$transaction` que **de fato abre uma
 * transação**.
 *
 * O ponto delicado: um mock ingênuo (`$transaction: (cb) => cb(prisma)`) faz
 * todo teste de "roda dentro da transação" passar sem provar nada — o serviço
 * poderia gravar direto em `this.prisma`, fora de qualquer transação, e o teste
 * continuaria verde.
 *
 * Aqui a forma de callback recebe um **cliente separado** (`tx`), inalcançável
 * de fora do callback. Uma chamada registrada em `tx.certificacaoProduto.update`
 * só pode ter acontecido lá dentro; se o serviço perder o `$transaction`, a
 * chamada aparece em `prisma.*` e o teste quebra. Os dois lados são
 * verificáveis:
 *
 * ```ts
 * expect(tx.certificacaoProduto.update).toHaveBeenCalled();   // rodou dentro
 * expect(prisma.certificacaoProduto.update).not.toHaveBeenCalled(); // e só lá
 * ```
 *
 * Além disso, `chamadasNaTransacao` registra as operações em ordem — serve para
 * afirmar que duas escritas caíram no **mesmo** commit (o caso da NC que nasce
 * junto da reprovação) e que nada rodou depois do fechamento.
 *
 * ---
 *
 * **Armadilha ao asserir sobre o próprio `tx`:** `expect.anything()` e os
 * demais matchers assimétricos NÃO funcionam contra um mock do
 * `jest-mock-extended`. O `mockDeep` cria qualquer propriedade acessada sob
 * demanda, inclusive `asymmetricMatch` — o Jest checa justamente essa
 * propriedade para descobrir se o valor recebido é um matcher, encontra uma
 * função, trata o mock como matcher e o resultado aparece como `undefined`.
 *
 * Para provar que algo recebeu o cliente de transação, não use
 * `expect.anything()`: prefira ler `mock.calls[n][i]` e comparar com `toBe` /
 * `not.toBeUndefined()`, ou — melhor — faça o colaborador mockado gravar pelo
 * cliente que recebeu e confira o resultado em `chamadasNaTransacao`.
 */
export interface PrismaMock {
  /** O `PrismaService` injetado no serviço sob teste. */
  prisma: DeepMockProxy<PrismaService>;
  /** O cliente entregue ao callback de `$transaction`. */
  tx: DeepMockProxy<Prisma.TransactionClient>;
  /** Operações chamadas no cliente de transação, em ordem (`modelo.metodo`). */
  chamadasNaTransacao: string[];
  /** Operações que chegaram ao `tx` com a transação já encerrada — deve ficar vazio. */
  chamadasForaDaTransacao: string[];
  /** Quantas vezes `$transaction` foi aberto. */
  transacoesAbertas: number;
}

/**
 * Envolve o mock profundo num Proxy que registra o caminho de cada função
 * chamada, delegando ao mock original — as asserções continuam sendo feitas
 * sobre `tx.modelo.metodo`, que é o mesmo objeto por baixo.
 *
 * O Proxy precisa tratar `get` e `apply` no MESMO objeto: no `mockDeep` cada
 * propriedade é função **e** portadora de sub-propriedades (`tx.funcionario` é
 * chamável e também expõe `.updateMany`). Devolver uma função de embrulho comum
 * no `get` descartaria as sub-propriedades.
 */
function comRegistro<T extends object>(
  alvo: T,
  aoChamar: (caminho: string) => void,
  prefixo = '',
): T {
  return new Proxy(alvo, {
    apply(objeto, esteArgumento, argumentos) {
      aoChamar(prefixo);
      return Reflect.apply(
        objeto as unknown as (...a: unknown[]) => unknown,
        esteArgumento,
        argumentos,
      );
    },
    get(objeto, propriedade) {
      const valor = Reflect.get(objeto, propriedade) as unknown;

      if (typeof propriedade === 'symbol') return valor;

      const caminho = prefixo
        ? `${prefixo}.${String(propriedade)}`
        : String(propriedade);

      if (typeof valor === 'function' || (valor !== null && typeof valor === 'object')) {
        return comRegistro(valor as object, aoChamar, caminho);
      }

      return valor;
    },
  }) as T;
}

export function criarPrismaMock(): PrismaMock {
  const prisma = mockDeep<PrismaService>();
  const tx = mockDeep<Prisma.TransactionClient>();

  const registro: PrismaMock = {
    prisma,
    tx,
    chamadasNaTransacao: [],
    chamadasForaDaTransacao: [],
    transacoesAbertas: 0,
  };

  let aberta = false;

  const txRegistrado = comRegistro(tx, (caminho) => {
    if (aberta) registro.chamadasNaTransacao.push(caminho);
    else registro.chamadasForaDaTransacao.push(caminho);
  });

  // As duas formas que o Prisma aceita, porque os services usam as duas: a de
  // array (listagem + contagem no mesmo snapshot) e a de callback.
  (prisma.$transaction as unknown as jest.Mock).mockImplementation(
    async (argumento: unknown) => {
      registro.transacoesAbertas += 1;

      if (Array.isArray(argumento)) {
        return Promise.all(argumento);
      }

      aberta = true;
      try {
        return await (argumento as (cliente: Prisma.TransactionClient) => unknown)(
          txRegistrado,
        );
      } finally {
        aberta = false;
      }
    },
  );

  return registro;
}
