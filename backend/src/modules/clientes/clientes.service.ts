import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, StatusRegistro } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { UploadsService } from '../uploads/uploads.service';
import { paginar, RespostaPaginada } from '../../common/dto/paginacao.dto';
import { gerarHashSenha } from '../../common/utils/senha.util';
import {
  AtualizarClienteDto,
  CriarClienteDto,
  ListarClientesDto,
} from './dto/cliente.dto';

/** Campos devolvidos pela API — o hash da senha nunca sai daqui. */
const SELECT_CLIENTE = {
  id: true,
  nome: true,
  email: true,
  tipoPessoa: true,
  cpf: true,
  cnpj: true,
  dataNascimento: true,
  telefone: true,
  cep: true,
  endereco: true,
  bairro: true,
  cidade: true,
  estadoId: true,
  fotoUrl: true,
  status: true,
  ultimoAcessoEm: true,
  responsavelId: true,
  criadoEm: true,
  atualizadoEm: true,
  estado: { select: { id: true, sigla: true, nome: true } },
  responsavel: { select: { id: true, nome: true } },
} satisfies Prisma.ClienteSelect;

export type ClienteResposta = Prisma.ClienteGetPayload<{
  select: typeof SELECT_CLIENTE;
}>;

@Injectable()
export class ClientesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploads: UploadsService,
  ) {}

  async listar(
    filtros: ListarClientesDto,
  ): Promise<RespostaPaginada<ClienteResposta>> {
    const where: Prisma.ClienteWhereInput = {
      status: filtros.status ?? StatusRegistro.ATIVO,
      // `0` é o pedido explícito de "sem responsável"; um id real filtra a
      // carteira daquele funcionário. `undefined` não filtra nada.
      ...(filtros.responsavelId !== undefined && {
        responsavelId: filtros.responsavelId === 0 ? null : filtros.responsavelId,
      }),
      ...(filtros.busca && {
        OR: [
          { nome: { contains: filtros.busca, mode: 'insensitive' } },
          { email: { contains: filtros.busca, mode: 'insensitive' } },
          { cnpj: { contains: filtros.busca } },
          { cpf: { contains: filtros.busca } },
        ],
      }),
    };

    const [dados, total] = await this.prisma.$transaction([
      this.prisma.cliente.findMany({
        where,
        select: SELECT_CLIENTE,
        orderBy: { nome: 'asc' },
        skip: filtros.skip,
        take: filtros.limite,
      }),
      this.prisma.cliente.count({ where }),
    ]);

    return paginar(dados, total, filtros);
  }

  /** Lista enxuta para popular selects (ex.: cadastro de produto). */
  async listarResumido() {
    return this.prisma.cliente.findMany({
      where: { status: StatusRegistro.ATIVO },
      select: { id: true, nome: true, email: true },
      orderBy: { nome: 'asc' },
    });
  }

  async buscarPorId(id: number): Promise<ClienteResposta> {
    const cliente = await this.prisma.cliente.findUnique({
      where: { id },
      select: SELECT_CLIENTE,
    });

    if (!cliente) {
      throw new NotFoundException(`Cliente ${id} não encontrado.`);
    }
    return cliente;
  }

  async criar(dto: CriarClienteDto): Promise<ClienteResposta> {
    const email = dto.email.trim().toLowerCase();
    await this.garantirEmailDisponivel(email);
    await this.garantirResponsavelValido(dto.responsavelId);

    const { senha, dataNascimento, ...dados } = dto;

    return this.prisma.cliente.create({
      data: {
        ...dados,
        email,
        senhaHash: await gerarHashSenha(senha),
        dataNascimento: dataNascimento ? new Date(dataNascimento) : null,
      },
      select: SELECT_CLIENTE,
    });
  }

  async atualizar(
    id: number,
    dto: AtualizarClienteDto,
  ): Promise<ClienteResposta> {
    await this.buscarPorId(id);

    const { senha, email, dataNascimento, ...dados } = dto;
    const emailNormalizado = email?.trim().toLowerCase();

    if (emailNormalizado) {
      await this.garantirEmailDisponivel(emailNormalizado, id);
    }
    await this.garantirResponsavelValido(dto.responsavelId);

    return this.prisma.cliente.update({
      where: { id },
      data: {
        ...dados,
        ...(emailNormalizado && { email: emailNormalizado }),
        ...(dataNascimento !== undefined && {
          dataNascimento: dataNascimento ? new Date(dataNascimento) : null,
        }),
        // A senha só entra no UPDATE quando enviada.
        ...(senha && { senhaHash: await gerarHashSenha(senha) }),
      },
      select: SELECT_CLIENTE,
    });
  }

  /** Soft delete / reativação (legado: status_cliente = 'Ativo' | 'Inativo'). */
  async alterarStatus(
    id: number,
    status: StatusRegistro,
  ): Promise<ClienteResposta> {
    await this.buscarPorId(id);
    return this.prisma.cliente.update({
      where: { id },
      data: { status },
      select: SELECT_CLIENTE,
    });
  }

  /** Exclusão definitiva, bloqueada quando existem produtos vinculados. */
  async remover(id: number): Promise<{ mensagem: string }> {
    const cliente = await this.prisma.cliente.findUnique({
      where: { id },
      include: { _count: { select: { produtos: true } } },
    });

    if (!cliente) {
      throw new NotFoundException(`Cliente ${id} não encontrado.`);
    }

    if (cliente._count.produtos > 0) {
      throw new ConflictException(
        `Este cliente possui ${cliente._count.produtos} produto(s) cadastrado(s). ` +
          'Use a desativação em vez da exclusão definitiva.',
      );
    }

    await this.uploads.remover(cliente.fotoUrl);
    await this.prisma.cliente.delete({ where: { id } });

    return { mensagem: 'Cliente excluído definitivamente.' };
  }

  async atualizarFoto(
    id: number,
    arquivo: Express.Multer.File,
  ): Promise<ClienteResposta> {
    const cliente = await this.prisma.cliente.findUnique({ where: { id } });
    if (!cliente) {
      throw new NotFoundException(`Cliente ${id} não encontrado.`);
    }

    const fotoUrl = await this.uploads.substituirImagem(
      arquivo,
      'clientes',
      cliente.fotoUrl,
    );

    return this.prisma.cliente.update({
      where: { id },
      data: { fotoUrl },
      select: SELECT_CLIENTE,
    });
  }

  private async garantirEmailDisponivel(
    email: string,
    ignorarId?: number,
  ): Promise<void> {
    const [cliente, funcionario] = await Promise.all([
      this.prisma.cliente.findUnique({ where: { email } }),
      this.prisma.funcionario.findUnique({ where: { email } }),
    ]);

    if ((cliente && cliente.id !== ignorarId) || funcionario) {
      throw new ConflictException('Este e-mail já está em uso na plataforma.');
    }
  }

  /**
   * Confere o responsável antes de gravar.
   *
   * Sem esta checagem quem recusaria um id inexistente seria a FK, e o
   * `AllExceptionsFilter` traduz `P2003` para 409 com mensagem genérica — a
   * tela mostraria "conflito" para o que é, na verdade, um campo inválido.
   * Funcionário INATIVO a FK aceitaria em silêncio, e a carteira nasceria
   * apontando para quem não trabalha mais aqui.
   *
   * `null` é explicitamente permitido: é como se desatribui uma carteira.
   */
  private async garantirResponsavelValido(
    responsavelId?: number | null,
  ): Promise<void> {
    if (responsavelId === undefined || responsavelId === null) return;

    const responsavel = await this.prisma.funcionario.findUnique({
      where: { id: responsavelId },
      select: { id: true, status: true },
    });

    if (!responsavel) {
      throw new BadRequestException(
        `Funcionário ${responsavelId} não encontrado para ser o responsável.`,
      );
    }

    if (responsavel.status !== StatusRegistro.ATIVO) {
      throw new BadRequestException(
        'O responsável precisa ser um funcionário ativo.',
      );
    }
  }
}
