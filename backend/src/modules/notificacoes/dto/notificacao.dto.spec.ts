import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import { ListarNotificacoesDto } from './notificacao.dto';

/**
 * `apenasNaoLidas` vindo da query string.
 *
 * O caso que este spec existe para travar é `?apenasNaoLidas=false`:
 *
 *  - query string entrega TEXTO, e a string `"false"` é verdadeira em
 *    JavaScript;
 *  - o `ValidationPipe` global roda com `enableImplicitConversion: true`, e
 *    essa conversão acontece ANTES do `@Transform` do DTO — ela transforma
 *    `"false"` em `true`.
 *
 * Juntos, os dois fazem o filtro devolver o OPOSTO do pedido, sem erro nenhum:
 * o usuário pede "todas" e recebe só as não lidas. Por isso o transform lê
 * `obj[key]`, o valor cru.
 *
 * O `enableImplicitConversion` é reproduzido aqui de propósito — sem ele o
 * teste passaria e produção continuaria errada.
 */
describe('ListarNotificacoesDto — apenasNaoLidas', () => {
  const peloPipe = (query: Record<string, unknown>) => {
    const dto = plainToInstance(ListarNotificacoesDto, query, {
      // Igual ao `bootstrap.ts`. Mudar isto aqui sem mudar lá invalidaria o
      // teste em silêncio.
      enableImplicitConversion: true,
    });
    const erros = validateSync(dto as object, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    return { dto: dto as { apenasNaoLidas?: boolean }, erros };
  };

  it('"true" liga o filtro', () => {
    const { dto, erros } = peloPipe({ apenasNaoLidas: 'true' });

    expect(dto.apenasNaoLidas).toBe(true);
    expect(erros).toHaveLength(0);
  });

  it('"false" DESLIGA o filtro — e não o contrário', () => {
    const { dto, erros } = peloPipe({ apenasNaoLidas: 'false' });

    expect(dto.apenasNaoLidas).toBe(false);
    expect(erros).toHaveLength(0);
  });

  it('"1" liga, "0" desliga', () => {
    expect(peloPipe({ apenasNaoLidas: '1' }).dto.apenasNaoLidas).toBe(true);
    expect(peloPipe({ apenasNaoLidas: '0' }).dto.apenasNaoLidas).toBe(false);
  });

  it('booleano de verdade continua funcionando', () => {
    expect(peloPipe({ apenasNaoLidas: true }).dto.apenasNaoLidas).toBe(true);
    expect(peloPipe({ apenasNaoLidas: false }).dto.apenasNaoLidas).toBe(false);
  });

  it('qualquer outro texto desliga, em vez de virar true', () => {
    // Um `!!value` aceitaria "sim", "yes", "banana" como verdadeiros — e o
    // filtro passaria a depender do que o cliente digitou na URL.
    expect(peloPipe({ apenasNaoLidas: 'banana' }).dto.apenasNaoLidas).toBe(false);
  });

  it('destinatarioId NÃO existe no DTO: a caixa é sempre a própria', () => {
    // `forbidNonWhitelisted` recusa. É o mesmo `clienteId` de query param que a
    // migração corrigiu do legado.
    const { erros } = peloPipe({ destinatarioId: 7 });

    expect(erros).toHaveLength(1);
  });
});
