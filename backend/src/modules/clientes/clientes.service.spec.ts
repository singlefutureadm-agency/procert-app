import { BadRequestException } from '@nestjs/common';
import { StatusRegistro } from '@prisma/client';
import { mockDeep } from 'jest-mock-extended';

import { ClientesService } from './clientes.service';
import { PrismaService } from '../../prisma/prisma.service';
import { UploadsService } from '../uploads/uploads.service';
import { criarPrismaMock, PrismaMock } from '../../testing/prisma.mock';

/**
 * O foco aqui é a **carteira de clientes** (`responsavelId`).
 *
 * Ela não pode ser validada só pela chave estrangeira: a FK aceitaria em
 * silêncio um funcionário INATIVO, e para um id inexistente quem responderia
 * seria o `AllExceptionsFilter` traduzindo `P2003` em 409 genérico — a tela
 * mostraria "conflito" para o que é um campo inválido.
 */

const FUNCIONARIO_ATIVO = { id: 3, status: StatusRegistro.ATIVO };
const FUNCIONARIO_INATIVO = { id: 4, status: StatusRegistro.INATIVO };

const NOVO_CLIENTE = {
  nome: 'Indústria Cliente Ltda',
  email: 'contato@cliente.com.br',
  senha: 'SenhaForte2026',
  tipoPessoa: 'JURIDICA' as const,
};

describe('ClientesService — carteira', () => {
  let servico: ClientesService;
  let banco: PrismaMock;
  /** Equipe que o mock de `findUnique` por id conhece. */
  let equipe: Map<number, { id: number; status: StatusRegistro }>;

  beforeEach(() => {
    jest.clearAllMocks();

    banco = criarPrismaMock();
    equipe = new Map();

    // E-mail livre por padrão: quem está sob teste é o responsável.
    banco.prisma.cliente.findUnique.mockResolvedValue(null as never);

    /*
     * `funcionario.findUnique` é consultado por DOIS caminhos com propósitos
     * opostos: `garantirEmailDisponivel` busca por `email` e um acerto ali é
     * erro (409 de e-mail duplicado); `garantirResponsavelValido` busca por
     * `id` e um acerto é o caminho feliz. Um `mockResolvedValue` único faria a
     * checagem de e-mail encontrar o responsável e derrubar o teste com a
     * mensagem errada — foi o que aconteceu na primeira versão deste arquivo.
     */
    banco.prisma.funcionario.findUnique.mockImplementation(((argumentos: {
      where: { id?: number; email?: string };
    }) =>
      Promise.resolve(
        argumentos.where.id === undefined
          ? null
          : (equipe.get(argumentos.where.id) ?? null),
      )) as never);
    banco.prisma.cliente.create.mockResolvedValue({ id: 10 } as never);
    banco.prisma.cliente.update.mockResolvedValue({ id: 10 } as never);

    servico = new ClientesService(
      banco.prisma as unknown as PrismaService,
      mockDeep<UploadsService>(),
    );
  });

  describe('criar', () => {
    it('aceita um responsável ativo e o grava', async () => {
      equipe.set(FUNCIONARIO_ATIVO.id, FUNCIONARIO_ATIVO);

      await servico.criar({ ...NOVO_CLIENTE, responsavelId: 3 });

      const [argumentos] = banco.prisma.cliente.create.mock.calls[0];
      expect(argumentos.data.responsavelId).toBe(3);
    });

    it('recusa responsável inexistente com 400, e não deixa a FK responder 409', async () => {
      // `findUnique` já devolve null pelo padrão do beforeEach.
      await expect(
        servico.criar({ ...NOVO_CLIENTE, responsavelId: 999 }),
      ).rejects.toThrow(BadRequestException);

      expect(banco.prisma.cliente.create).not.toHaveBeenCalled();
    });

    it('recusa responsável INATIVO — a FK aceitaria em silêncio', async () => {
      equipe.set(FUNCIONARIO_INATIVO.id, FUNCIONARIO_INATIVO);

      await expect(
        servico.criar({ ...NOVO_CLIENTE, responsavelId: 4 }),
      ).rejects.toThrow(
        new BadRequestException('O responsável precisa ser um funcionário ativo.'),
      );

      expect(banco.prisma.cliente.create).not.toHaveBeenCalled();
    });

    it('cliente sem responsável é permitido e não consulta a equipe', async () => {
      await servico.criar(NOVO_CLIENTE);

      const [argumentos] = banco.prisma.cliente.create.mock.calls[0];
      expect(argumentos.data.responsavelId).toBeUndefined();

      // A validação do responsável nem chega a consultar a equipe: a única
      // busca por `funcionario` é a de e-mail duplicado, que vai por `email`.
      const buscas = banco.prisma.funcionario.findUnique.mock.calls;
      expect(buscas).toHaveLength(1);
      expect(buscas[0][0].where.id).toBeUndefined();
    });
  });

  describe('atualizar', () => {
    beforeEach(() => {
      // `atualizar` começa por `buscarPorId`.
      banco.prisma.cliente.findUnique.mockResolvedValue({ id: 10 } as never);
    });

    it('troca o responsável por outro ativo', async () => {
      equipe.set(FUNCIONARIO_ATIVO.id, FUNCIONARIO_ATIVO);

      await servico.atualizar(10, { responsavelId: 3 });

      const [argumentos] = banco.prisma.cliente.update.mock.calls[0];
      expect(argumentos.data.responsavelId).toBe(3);
    });

    it('recusa trocar para um responsável inativo', async () => {
      equipe.set(FUNCIONARIO_INATIVO.id, FUNCIONARIO_INATIVO);

      await expect(servico.atualizar(10, { responsavelId: 4 })).rejects.toThrow(
        BadRequestException,
      );

      expect(banco.prisma.cliente.update).not.toHaveBeenCalled();
    });

    it('null desatribui a carteira, e isso é gravado', async () => {
      // É como a tela devolve "Sem responsável definido". Se `null` virasse
      // `undefined` no caminho, o campo sumiria do UPDATE e o responsável
      // antigo continuaria gravado — não haveria como desatribuir pela tela.
      await servico.atualizar(10, { responsavelId: null } as never);

      const [argumentos] = banco.prisma.cliente.update.mock.calls[0];
      expect(argumentos.data.responsavelId).toBeNull();
    });
  });

  describe('listar', () => {
    beforeEach(() => {
      banco.prisma.$transaction.mockResolvedValue([[], 0] as never);
    });

    it('filtra pela carteira de um funcionário', async () => {
      await servico.listar({ pagina: 1, limite: 20, skip: 0, responsavelId: 3 });

      const argumentos = banco.prisma.cliente.findMany.mock.calls[0][0]!;
      expect(argumentos.where!.responsavelId).toBe(3);
    });

    it('responsavelId=0 lista os SEM responsável (null), não o id 0', async () => {
      await servico.listar({ pagina: 1, limite: 20, skip: 0, responsavelId: 0 });

      const argumentos = banco.prisma.cliente.findMany.mock.calls[0][0]!;
      expect(argumentos.where!.responsavelId).toBeNull();
    });

    it('sem o filtro, não restringe por carteira', async () => {
      await servico.listar({ pagina: 1, limite: 20, skip: 0 });

      const argumentos = banco.prisma.cliente.findMany.mock.calls[0][0]!;
      expect(argumentos.where).not.toHaveProperty('responsavelId');
    });
  });
});
