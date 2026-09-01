import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role, StatusRegistro } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';

import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import { conferirSenha, gerarHashSenha } from '../../common/utils/senha.util';
import { urlDoPainel } from '../../common/utils/ambiente.util';
import {
  AlterarSenhaDto,
  EsqueciSenhaDto,
  JwtPayload,
  LoginDto,
  RedefinirSenhaDto,
  RespostaLogin,
} from './dto/auth.dto';

const VALIDADE_TOKEN_MS = 60 * 60 * 1000; // 1 hora, como no legado

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
  ) {}

  /**
   * Autentica um cliente OU um membro da equipe.
   *
   * Correção do legado: lá o cadastro aplicava password_hash() mas o login
   * comparava com `===`, de modo que funcionários e administradores criados
   * pela interface nunca conseguiam entrar. Aqui usamos bcrypt.compare().
   */
  async login({ email, senha }: LoginDto): Promise<RespostaLogin> {
    const emailNormalizado = email.trim().toLowerCase();

    const funcionario = await this.prisma.funcionario.findUnique({
      where: { email: emailNormalizado },
    });

    if (funcionario) {
      await this.garantirAtivo(funcionario.status);
      await this.garantirSenha(senha, funcionario.senhaHash);
      await this.registrarAcesso('funcionario', funcionario.id);
      return this.emitirToken({
        id: funcionario.id,
        nome: funcionario.nome,
        email: funcionario.email,
        role: funcionario.role,
        fotoUrl: funcionario.fotoUrl,
      });
    }

    const cliente = await this.prisma.cliente.findUnique({
      where: { email: emailNormalizado },
    });

    if (cliente) {
      await this.garantirAtivo(cliente.status);
      await this.garantirSenha(senha, cliente.senhaHash);
      await this.registrarAcesso('cliente', cliente.id);
      return this.emitirToken({
        id: cliente.id,
        nome: cliente.nome,
        email: cliente.email,
        role: Role.CLIENTE,
        fotoUrl: cliente.fotoUrl,
      });
    }

    // Mensagem genérica e custo de tempo semelhante ao caminho feliz,
    // para não permitir enumeração de e-mails cadastrados.
    await conferirSenha(senha, '$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin');
    throw new UnauthorizedException('E-mail ou senha incorretos.');
  }

  /** Dados do usuário da sessão atual, com o perfil completo. */
  async perfil(usuario: UsuarioAutenticado) {
    if (usuario.role === Role.CLIENTE) {
      const cliente = await this.prisma.cliente.findUniqueOrThrow({
        where: { id: usuario.id },
        include: { estado: true },
      });
      const { senhaHash: _ignorado, ...dados } = cliente;
      return { ...dados, role: Role.CLIENTE };
    }

    const funcionario = await this.prisma.funcionario.findUniqueOrThrow({
      where: { id: usuario.id },
      include: { estado: true },
    });
    const { senhaHash: _ignorado, ...dados } = funcionario;
    return dados;
  }

  /**
   * Gera e envia o link de redefinição.
   * Responde sempre com sucesso, independentemente de o e-mail existir.
   */
  async esqueciSenha({ email }: EsqueciSenhaDto): Promise<{ mensagem: string }> {
    const mensagem =
      'Se este e-mail estiver cadastrado, você receberá as instruções em instantes.';
    const emailNormalizado = email.trim().toLowerCase();

    const usuario =
      (await this.prisma.funcionario.findUnique({
        where: { email: emailNormalizado },
      })) ??
      // Diferente do legado, clientes também podem recuperar a senha.
      (await this.prisma.cliente.findUnique({
        where: { email: emailNormalizado },
      }));

    if (!usuario || usuario.status !== StatusRegistro.ATIVO) {
      return { mensagem };
    }

    const token = randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(token);

    // Invalida pedidos anteriores ainda abertos.
    await this.prisma.tokenRedefinicaoSenha.updateMany({
      where: { email: emailNormalizado, usadoEm: null },
      data: { usadoEm: new Date() },
    });

    await this.prisma.tokenRedefinicaoSenha.create({
      data: {
        email: emailNormalizado,
        tokenHash,
        expiraEm: new Date(Date.now() + VALIDADE_TOKEN_MS),
      },
    });

    const link = `${urlDoPainel(this.config)}/redefinir-senha?token=${token}`;
    await this.mail.enviarRedefinicaoSenha(usuario.email, usuario.nome, link);

    return { mensagem };
  }

  /** Consome o token e grava a nova senha (hash bcrypt). */
  async redefinirSenha({
    token,
    novaSenha,
  }: RedefinirSenhaDto): Promise<{ mensagem: string }> {
    const registro = await this.prisma.tokenRedefinicaoSenha.findUnique({
      where: { tokenHash: this.hashToken(token) },
    });

    if (!registro || registro.usadoEm || registro.expiraEm < new Date()) {
      throw new BadRequestException(
        'Link inválido ou expirado. Solicite uma nova redefinição.',
      );
    }

    const senhaHash = await gerarHashSenha(novaSenha);

    await this.prisma.$transaction(async (tx) => {
      const atualizouFuncionario = await tx.funcionario.updateMany({
        where: { email: registro.email },
        data: { senhaHash },
      });

      if (atualizouFuncionario.count === 0) {
        await tx.cliente.updateMany({
          where: { email: registro.email },
          data: { senhaHash },
        });
      }

      await tx.tokenRedefinicaoSenha.update({
        where: { id: registro.id },
        data: { usadoEm: new Date() },
      });
    });

    return { mensagem: 'Senha redefinida com sucesso. Faça login novamente.' };
  }

  /** Troca de senha pelo próprio usuário autenticado. */
  async alterarSenha(
    usuario: UsuarioAutenticado,
    { senhaAtual, novaSenha }: AlterarSenhaDto,
  ): Promise<{ mensagem: string }> {
    const registro =
      usuario.role === Role.CLIENTE
        ? await this.prisma.cliente.findUniqueOrThrow({ where: { id: usuario.id } })
        : await this.prisma.funcionario.findUniqueOrThrow({
            where: { id: usuario.id },
          });

    if (!(await conferirSenha(senhaAtual, registro.senhaHash))) {
      throw new UnauthorizedException('Senha atual incorreta.');
    }

    const senhaHash = await gerarHashSenha(novaSenha);

    if (usuario.role === Role.CLIENTE) {
      await this.prisma.cliente.update({
        where: { id: usuario.id },
        data: { senhaHash },
      });
    } else {
      await this.prisma.funcionario.update({
        where: { id: usuario.id },
        data: { senhaHash },
      });
    }

    return { mensagem: 'Senha alterada com sucesso.' };
  }

  // ---------------------------------------------------------------- privados

  private async garantirAtivo(status: StatusRegistro): Promise<void> {
    if (status !== StatusRegistro.ATIVO) {
      throw new UnauthorizedException(
        'Cadastro inativo. Procure o administrador do sistema.',
      );
    }
  }

  private async garantirSenha(senha: string, hash: string): Promise<void> {
    if (!(await conferirSenha(senha, hash))) {
      throw new UnauthorizedException('E-mail ou senha incorretos.');
    }
  }

  /**
   * Carimba o último login bem-sucedido.
   *
   * Chamado só depois de `garantirAtivo` + `garantirSenha`, e nunca no ramo de
   * e-mail inexistente: um write ali daria ao atacante um sinal de tempo
   * distinguindo e-mail cadastrado de não cadastrado, que é exatamente o que a
   * comparação contra hash inválido no fim do `login` existe para evitar.
   *
   * **`await` com `try/catch`, e não promessa solta.** O padrão do projeto para
   * efeito colateral não-crítico é rodar depois do commit sem `await`, mas em
   * serverless a função pode congelar assim que a resposta sai e o UPDATE se
   * perderia. Ele é desprezível perto do bcrypt que acabou de rodar, então vale
   * esperar. Falhar aqui não pode derrubar a autenticação: telemetria não é
   * pré-requisito para entrar.
   */
  private async registrarAcesso(
    tipo: 'cliente' | 'funcionario',
    id: number,
  ): Promise<void> {
    try {
      const data = { ultimoAcessoEm: new Date() };
      if (tipo === 'cliente') {
        await this.prisma.cliente.update({ where: { id }, data });
      } else {
        await this.prisma.funcionario.update({ where: { id }, data });
      }
    } catch (erro) {
      this.logger.warn(
        `Não foi possível registrar o último acesso do ${tipo} ${id}: ${
          erro instanceof Error ? erro.message : erro
        }`,
      );
    }
  }

  private emitirToken(usuario: {
    id: number;
    nome: string;
    email: string;
    role: Role;
    fotoUrl: string | null;
  }): RespostaLogin {
    const payload: JwtPayload = {
      sub: usuario.id,
      email: usuario.email,
      role: usuario.role,
      nome: usuario.nome,
    };

    return {
      accessToken: this.jwt.sign(payload),
      usuario,
    };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
