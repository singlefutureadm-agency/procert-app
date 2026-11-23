import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import { AtualizarProcessoDto } from './processo.dto';

/**
 * O único spec de DTO do projeto, e existe por um motivo estreito: o
 * `responsavelId` é o primeiro campo em que **`null` é um valor com
 * significado** ("deixe sem dono"), e não só a ausência do campo.
 *
 * `@Type(() => Number)` sobre `null` é a armadilha: `Number(null)` é `0`. Se a
 * conversão acontecesse, desatribuir um responsável chegaria ao service como
 * funcionário 0 e a resposta seria `400 — Funcionário 0 não encontrado` numa
 * ação que o usuário leu como "limpar o campo". Nada no type-check vê isso: os
 * tipos dizem `number | null` nas duas pontas.
 *
 * Os casos abaixo travam o contrato da BORDA (o que o `ValidationPipe` entrega
 * ao service), que é a única camada onde essa conversão pode acontecer.
 */
describe('AtualizarProcessoDto — responsavelId', () => {
  const peloPipe = (corpo: object) => {
    const dto = plainToInstance(AtualizarProcessoDto, corpo);
    const erros = validateSync(dto as object, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    return { dto: dto as { responsavelId?: number | null }, erros };
  };

  it('`null` chega como null, NÃO como 0', () => {
    const { dto, erros } = peloPipe({ responsavelId: null });

    expect(dto.responsavelId).toBeNull();
    expect(erros).toHaveLength(0);
  });

  it('número em texto vira número — é o que a query string manda', () => {
    const { dto, erros } = peloPipe({ responsavelId: '3' });

    expect(dto.responsavelId).toBe(3);
    expect(erros).toHaveLength(0);
  });

  it('campo ausente continua undefined: "não mexa" é diferente de "limpe"', () => {
    const { dto, erros } = peloPipe({});

    expect(dto.responsavelId).toBeUndefined();
    expect('responsavelId' in dto).toBe(false);
    expect(erros).toHaveLength(0);
  });

  it('recusa 0: nenhum funcionário tem id 0, e aqui 0 não é "sem dono"', () => {
    // O `0` só significa "sem responsável" no FILTRO da listagem. No corpo da
    // escrita, quem diz isso é o `null` — aceitar os dois seria duas formas de
    // escrever a mesma coisa, e uma delas passaria a valer como id algum dia.
    const { erros } = peloPipe({ responsavelId: 0 });

    expect(erros).toHaveLength(1);
  });

  it('recusa texto que não é número', () => {
    const { erros } = peloPipe({ responsavelId: 'ana' });

    expect(erros).toHaveLength(1);
  });
});
