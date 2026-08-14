import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role, StatusRegistro } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { UploadsService } from '../uploads/uploads.service';
import { paginar, RespostaPaginada } from '../../common/dto/paginacao.dto';
import { gerarHashSenha } from '../../common/utils/senha.util';
import {
  AtualizarFuncionarioDto,
  CriarFuncionarioDto,
  ListarFuncionariosDto,
  ROLES_EQUIPE,
} from './dto/funcionario.dto';

const SELECT_FUNCIONARIO = {
  id: true,
  nome: true,
  email: true,
  role: true,
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
  criadoEm: true,
  atualizadoEm: true,
  estado: { select: { id: true, sigla: true, nome: true } },
} satisfies Prisma.FuncionarioSelect;

export type FuncionarioResposta = Prisma.FuncionarioGetPayload<{
  select: typeof SELECT_FUNCIONARIO;
}>;

/**
 * Módulo único para ADMIN e FUNCIONARIO.
 *
 * No legado eram dois controllers e dois models praticamente idênticos
 * (FuncionarioController/Funcionario e AdministradorController/Administrador),
 * ambos operando sobre tbl_funcionario e diferindo apenas no id_tipo_usuario.
 */
@Injectable()
export class FuncionariosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploads: UploadsService,
  ) {}

  async listar(
    filtros: ListarFuncionariosDto,
  ): Promise<RespostaPaginada<FuncionarioResposta>> {
    const where: Prisma.FuncionarioWhereInput = {
      status: filtros.status ?? StatusRegistro.ATIVO,
      role: filtros.role ?? { in: [...ROLES_EQUIPE] },
      ...(filtros.busca && {
        OR: [
          { nome: { contains: filtros.busca, mode: 'insensitive' } },
          { email: { contains: filtros.busca, mode: 'insensitive' } },
        ],
      }),
    };

    const [dados, total] = await this.prisma.$transaction([
      this.prisma.funcionario.findMany({
        where,
        select: SELECT_FUNCIONARIO,
        orderBy: { nome: 'asc' },
        skip: filtros.skip,
        take: filtros.limite,
      }),
      this.prisma.funcionario.count({ where }),
    ]);

    return paginar(dados, total, filtros);
  }

  async buscarPorId(id: number): Promise<FuncionarioResposta> {
    const funcionario = await this.prisma.funcionario.findUnique({
      where: { id },
      select: SELECT_FUNCIONARIO,
    });

    if (!funcionario) {
      throw new NotFoundException(`Colaborador ${id} não encontrado.`);
    }
    return funcionario;
  }

  async criar(dto: CriarFuncionarioDto): Promise<FuncionarioResposta> {
    const email = dto.email.trim().toLowerCase();
    await this.garantirEmailDisponivel(email);

    const { senha, dataNascimento, ...dados } = dto;

    return this.prisma.funcionario.create({
      data: {
        ...dados,
        email,
        senhaHash: await gerarHashSenha(senha),
        dataNascimento: dataNascimento ? new Date(dataNascimento) : null,
      },
      select: SELECT_FUNCIONARIO,
    });
  }

  async atualizar(
    id: number,
    dto: AtualizarFuncionarioDto,
  ): Promise<FuncionarioResposta> {
    const atual = await this.buscarPorId(id);

    const { senha, email, dataNascimento, role, ...dados } = dto;
    const emailNormalizado = email?.trim().toLowerCase();

    if (emailNormalizado) {
      await this.garantirEmailDisponivel(emailNormalizado, id);
    }

    // Impede que o sistema fique sem nenhum administrador ativo.
    if (role && role !== Role.ADMIN && atual.role === Role.ADMIN) {
      await this.garantirOutroAdminAtivo(id);
    }

    return this.prisma.funcionario.update({
      where: { id },
      data: {
        ...dados,
        ...(role && { role }),
        ...(emailNormalizado && { email: emailNormalizado }),
        ...(dataNascimento !== undefined && {
          dataNascimento: dataNascimento ? new Date(dataNascimento) : null,
        }),
        ...(senha && { senhaHash: await gerarHashSenha(senha) }),
      },
      select: SELECT_FUNCIONARIO,
    });
  }

  async alterarStatus(
    id: number,
    status: StatusRegistro,
    usuarioLogadoId: number,
  ): Promise<FuncionarioResposta> {
    const funcionario = await this.buscarPorId(id);

    if (status === StatusRegistro.INATIVO) {
      if (id === usuarioLogadoId) {
        throw new BadRequestException(
          'Você não pode desativar o seu próprio acesso.',
        );
      }
      if (funcionario.role === Role.ADMIN) {
        await this.garantirOutroAdminAtivo(id);
      }
    }

    return this.prisma.funcionario.update({
      where: { id },
      data: { status },
      select: SELECT_FUNCIONARIO,
    });
  }

  async remover(
    id: number,
    usuarioLogadoId: number,
  ): Promise<{ mensagem: string }> {
    if (id === usuarioLogadoId) {
      throw new BadRequestException(
        'Você não pode excluir o seu próprio cadastro.',
      );
    }

    const funcionario = await this.prisma.funcionario.findUnique({
      where: { id },
    });
    if (!funcionario) {
      throw new NotFoundException(`Colaborador ${id} não encontrado.`);
    }

    if (funcionario.role === Role.ADMIN) {
      await this.garantirOutroAdminAtivo(id);
    }

    await this.uploads.remover(funcionario.fotoUrl);
    // O histórico de certificação mantém o nome de quem alterou (SetNull na FK).
    await this.prisma.funcionario.delete({ where: { id } });

    return { mensagem: 'Colaborador excluído definitivamente.' };
  }

  async atualizarFoto(
    id: number,
    arquivo: Express.Multer.File,
  ): Promise<FuncionarioResposta> {
    const funcionario = await this.prisma.funcionario.findUnique({
      where: { id },
    });
    if (!funcionario) {
      throw new NotFoundException(`Colaborador ${id} não encontrado.`);
    }

    const fotoUrl = await this.uploads.substituirImagem(
      arquivo,
      'funcionarios',
      funcionario.fotoUrl,
    );

    return this.prisma.funcionario.update({
      where: { id },
      data: { fotoUrl },
      select: SELECT_FUNCIONARIO,
    });
  }

  private async garantirEmailDisponivel(
    email: string,
    ignorarId?: number,
  ): Promise<void> {
    const [funcionario, cliente] = await Promise.all([
      this.prisma.funcionario.findUnique({ where: { email } }),
      this.prisma.cliente.findUnique({ where: { email } }),
    ]);

    if ((funcionario && funcionario.id !== ignorarId) || cliente) {
      throw new ConflictException('Este e-mail já está em uso na plataforma.');
    }
  }

  private async garantirOutroAdminAtivo(idIgnorado: number): Promise<void> {
    const outros = await this.prisma.funcionario.count({
      where: {
        role: Role.ADMIN,
        status: StatusRegistro.ATIVO,
        id: { not: idIgnorado },
      },
    });

    if (outros === 0) {
      throw new BadRequestException(
        'É necessário manter ao menos um administrador ativo no sistema.',
      );
    }
  }
}
