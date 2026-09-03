import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role, StatusRegistro } from '@prisma/client';
import { mockDeep } from 'jest-mock-extended';

import { AuthService } from './auth.service';
import { NotificacoesService } from '../mail/notificacoes.service';
import { PrismaService } from '../../prisma/prisma.service';
import { criarPrismaMock, PrismaMock } from '../../testing/prisma.mock';
import { admin, cliente } from '../../testing/usuarios.fixture';
import * as senhaUtil from '../../common/utils/senha.util';

// bcrypt real deixaria a suíte de auth em dezenas de segundos sem cobrir nada
// que `senha.util.spec.ts` já não cubra melhor. Aqui interessa QUANDO o serviço
// confere a senha, não como o bcrypt a confere.
jest.mock('../../common/utils/senha.util', () => ({
  ...jest.requireActual('../../common/utils/senha.util'),
  conferirSenha: jest.fn(),
  gerarHashSenha: jest.fn(),
}));

const conferirSenha = senhaUtil.conferirSenha as jest.MockedFunction<
  typeof senhaUtil.conferirSenha
>;
const gerarHashSenha = senhaUtil.gerarHashSenha as jest.MockedFunction<
  typeof senhaUtil.gerarHashSenha
>;

const FUNCIONARIO_ATIVO = {
  id: 2,
  nome: 'Bruno Analista',
  email: 'bruno@procertocp.com.br',
  senhaHash: '$2b$12$hashDoFuncionario',
  role: Role.FUNCIONARIO,
  fotoUrl: null,
  status: StatusRegistro.ATIVO,
};

const CLIENTE_ATIVO = {
  id: 100,
  nome: 'Indústria Cliente Ltda',
  email: 'contato@cliente.com.br',
  senhaHash: '$2b$12$hashDoCliente',
  fotoUrl: null,
  status: StatusRegistro.ATIVO,
};

describe('AuthService', () => {
  let servico: AuthService;
  let banco: PrismaMock;
  let jwt: jest.Mocked<JwtService>;
  let notificacoes: jest.Mocked<NotificacoesService>;
  let config: jest.Mocked<ConfigService>;

  beforeEach(() => {
    jest.clearAllMocks();

    banco = criarPrismaMock();
    jwt = mockDeep<JwtService>();
    notificacoes = mockDeep<NotificacoesService>();
    config = mockDeep<ConfigService>();

    jwt.sign.mockReturnValue('token.jwt.assinado');
    config.get.mockImplementation(
      (_chave: string, padrao?: unknown) => padrao as never,
    );
    notificacoes.redefinicaoDeSenha.mockResolvedValue(undefined);

    banco.prisma.funcionario.findUnique.mockResolvedValue(null as never);
    banco.prisma.cliente.findUnique.mockResolvedValue(null as never);

    servico = new AuthService(
      banco.prisma as unknown as PrismaService,
      jwt,
      config,
      notificacoes,
    );
  });

  describe('login', () => {
    it('autentica um funcionário e devolve o token com o papel do cadastro', async () => {
      banco.prisma.funcionario.findUnique.mockResolvedValue(
        FUNCIONARIO_ATIVO as never,
      );
      conferirSenha.mockResolvedValue(true);

      const resposta = await servico.login({
        email: 'bruno@procertocp.com.br',
        senha: 'Procert@2026',
      });

      expect(resposta.accessToken).toBe('token.jwt.assinado');
      expect(resposta.usuario).toMatchObject({
        id: 2,
        role: Role.FUNCIONARIO,
      });
      // O payload carrega `sub`, e ele é o id na tabela do papel — nunca um id
      // global. Se isto mudar, o escopo de CLIENTE dos outros services cai junto.
      expect(jwt.sign).toHaveBeenCalledWith({
        sub: 2,
        email: 'bruno@procertocp.com.br',
        role: Role.FUNCIONARIO,
        nome: 'Bruno Analista',
      });
      // O hash nunca sai na resposta.
      expect(resposta.usuario).not.toHaveProperty('senhaHash');
    });

    it('normaliza o e-mail antes de consultar (espaço e caixa alta)', async () => {
      banco.prisma.funcionario.findUnique.mockResolvedValue(
        FUNCIONARIO_ATIVO as never,
      );
      conferirSenha.mockResolvedValue(true);

      await servico.login({
        email: '  BRUNO@ProCertOCP.com.BR ',
        senha: 'Procert@2026',
      });

      expect(banco.prisma.funcionario.findUnique).toHaveBeenCalledWith({
        where: { email: 'bruno@procertocp.com.br' },
      });
    });

    it('autentica um cliente com papel CLIENTE, que não vem do cadastro', async () => {
      banco.prisma.cliente.findUnique.mockResolvedValue(CLIENTE_ATIVO as never);
      conferirSenha.mockResolvedValue(true);

      const resposta = await servico.login({
        email: 'contato@cliente.com.br',
        senha: 'Procert@2026',
      });

      // `Cliente` não tem coluna `role`: o papel é constante por tabela.
      expect(resposta.usuario.role).toBe(Role.CLIENTE);
      expect(resposta.usuario.id).toBe(100);
    });

    it('recusa senha errada com a mensagem genérica', async () => {
      banco.prisma.funcionario.findUnique.mockResolvedValue(
        FUNCIONARIO_ATIVO as never,
      );
      conferirSenha.mockResolvedValue(false);

      await expect(
        servico.login({ email: 'bruno@procertocp.com.br', senha: 'errada' }),
      ).rejects.toThrow(new UnauthorizedException('E-mail ou senha incorretos.'));
    });

    it('recusa cadastro inativo ANTES de conferir a senha', async () => {
      banco.prisma.funcionario.findUnique.mockResolvedValue({
        ...FUNCIONARIO_ATIVO,
        status: StatusRegistro.INATIVO,
      } as never);

      await expect(
        servico.login({
          email: 'bruno@procertocp.com.br',
          senha: 'Procert@2026',
        }),
      ).rejects.toThrow(
        new UnauthorizedException(
          'Cadastro inativo. Procure o administrador do sistema.',
        ),
      );
      expect(conferirSenha).not.toHaveBeenCalled();
    });

    it('e-mail inexistente: mesma mensagem da senha errada E paga o custo de um bcrypt (anti-enumeração)', async () => {
      conferirSenha.mockResolvedValue(false);

      await expect(
        servico.login({ email: 'ninguem@exemplo.com', senha: 'qualquer' }),
      ).rejects.toThrow(new UnauthorizedException('E-mail ou senha incorretos.'));

      // O ponto da anti-enumeração: sem esta comparação contra um hash inválido,
      // o caminho "e-mail não existe" responderia mais rápido que "senha errada"
      // e o tempo de resposta viraria um oráculo de contas cadastradas.
      expect(conferirSenha).toHaveBeenCalledTimes(1);
      const [, hashUsado] = conferirSenha.mock.calls[0];
      expect(hashUsado).toMatch(/^\$2b\$12\$/);
    });

    it('procura o funcionário primeiro e só então o cliente', async () => {
      banco.prisma.funcionario.findUnique.mockResolvedValue(
        FUNCIONARIO_ATIVO as never,
      );
      conferirSenha.mockResolvedValue(true);

      await servico.login({
        email: 'bruno@procertocp.com.br',
        senha: 'Procert@2026',
      });

      expect(banco.prisma.cliente.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('registro do último acesso', () => {
    it('carimba o funcionário no login bem-sucedido', async () => {
      banco.prisma.funcionario.findUnique.mockResolvedValue(
        FUNCIONARIO_ATIVO as never,
      );
      conferirSenha.mockResolvedValue(true);

      await servico.login({
        email: 'bruno@procertocp.com.br',
        senha: 'Procert@2026',
      });

      expect(banco.prisma.funcionario.update).toHaveBeenCalledTimes(1);
      const [argumentos] = banco.prisma.funcionario.update.mock.calls[0];
      expect(argumentos.where).toEqual({ id: 2 });
      expect(argumentos.data.ultimoAcessoEm).toBeInstanceOf(Date);
      expect(banco.prisma.cliente.update).not.toHaveBeenCalled();
    });

    it('carimba o cliente no login bem-sucedido', async () => {
      banco.prisma.cliente.findUnique.mockResolvedValue(CLIENTE_ATIVO as never);
      conferirSenha.mockResolvedValue(true);

      await servico.login({
        email: 'contato@cliente.com.br',
        senha: 'Procert@2026',
      });

      expect(banco.prisma.cliente.update).toHaveBeenCalledTimes(1);
      const [argumentos] = banco.prisma.cliente.update.mock.calls[0];
      expect(argumentos.where).toEqual({ id: 100 });
      expect(argumentos.data.ultimoAcessoEm).toBeInstanceOf(Date);
      expect(banco.prisma.funcionario.update).not.toHaveBeenCalled();
    });

    it('NÃO carimba quando a senha está errada', async () => {
      banco.prisma.funcionario.findUnique.mockResolvedValue(
        FUNCIONARIO_ATIVO as never,
      );
      conferirSenha.mockResolvedValue(false);

      await expect(
        servico.login({ email: 'bruno@procertocp.com.br', senha: 'errada' }),
      ).rejects.toThrow(UnauthorizedException);

      expect(banco.prisma.funcionario.update).not.toHaveBeenCalled();
    });

    it('NÃO carimba quando o cadastro está inativo', async () => {
      banco.prisma.funcionario.findUnique.mockResolvedValue({
        ...FUNCIONARIO_ATIVO,
        status: StatusRegistro.INATIVO,
      } as never);

      await expect(
        servico.login({
          email: 'bruno@procertocp.com.br',
          senha: 'Procert@2026',
        }),
      ).rejects.toThrow(UnauthorizedException);

      expect(banco.prisma.funcionario.update).not.toHaveBeenCalled();
    });

    it('NÃO escreve nada no caminho de e-mail inexistente', async () => {
      conferirSenha.mockResolvedValue(false);

      await expect(
        servico.login({ email: 'ninguem@exemplo.com', senha: 'qualquer' }),
      ).rejects.toThrow(UnauthorizedException);

      // Um write aqui daria ao atacante um sinal de tempo distinguindo e-mail
      // cadastrado de não cadastrado — exatamente o que a comparação contra
      // hash inválido existe para evitar.
      expect(banco.prisma.funcionario.update).not.toHaveBeenCalled();
      expect(banco.prisma.cliente.update).not.toHaveBeenCalled();
    });

    it('falha ao gravar o acesso NÃO derruba o login', async () => {
      banco.prisma.funcionario.findUnique.mockResolvedValue(
        FUNCIONARIO_ATIVO as never,
      );
      conferirSenha.mockResolvedValue(true);
      banco.prisma.funcionario.update.mockRejectedValue(
        new Error('banco indisponível') as never,
      );

      // Telemetria não é pré-requisito para entrar no sistema.
      const resposta = await servico.login({
        email: 'bruno@procertocp.com.br',
        senha: 'Procert@2026',
      });

      expect(resposta.accessToken).toBe('token.jwt.assinado');
    });
  });

  describe('esqueciSenha', () => {
    const MENSAGEM_NEUTRA =
      'Se este e-mail estiver cadastrado, você receberá as instruções em instantes.';

    it('responde a mensagem neutra para e-mail inexistente, sem criar token nem enviar e-mail', async () => {
      await expect(
        servico.esqueciSenha({ email: 'ninguem@exemplo.com' }),
      ).resolves.toEqual({ mensagem: MENSAGEM_NEUTRA });

      expect(banco.prisma.tokenRedefinicaoSenha.create).not.toHaveBeenCalled();
      expect(notificacoes.redefinicaoDeSenha).not.toHaveBeenCalled();
    });

    it('responde EXATAMENTE a mesma mensagem para e-mail existente', async () => {
      banco.prisma.funcionario.findUnique.mockResolvedValue(
        FUNCIONARIO_ATIVO as never,
      );

      await expect(
        servico.esqueciSenha({ email: 'bruno@procertocp.com.br' }),
      ).resolves.toEqual({ mensagem: MENSAGEM_NEUTRA });
    });

    it('trata cadastro inativo como inexistente — não emite token', async () => {
      banco.prisma.funcionario.findUnique.mockResolvedValue({
        ...FUNCIONARIO_ATIVO,
        status: StatusRegistro.INATIVO,
      } as never);

      await expect(
        servico.esqueciSenha({ email: 'bruno@procertocp.com.br' }),
      ).resolves.toEqual({ mensagem: MENSAGEM_NEUTRA });
      expect(banco.prisma.tokenRedefinicaoSenha.create).not.toHaveBeenCalled();
    });

    it('invalida pedidos anteriores antes de criar o novo token', async () => {
      banco.prisma.funcionario.findUnique.mockResolvedValue(
        FUNCIONARIO_ATIVO as never,
      );

      await servico.esqueciSenha({ email: 'bruno@procertocp.com.br' });

      expect(banco.prisma.tokenRedefinicaoSenha.updateMany).toHaveBeenCalledWith({
        where: { email: 'bruno@procertocp.com.br', usadoEm: null },
        data: { usadoEm: expect.any(Date) },
      });

      const invalidacao =
        banco.prisma.tokenRedefinicaoSenha.updateMany.mock.invocationCallOrder[0];
      const criacao =
        banco.prisma.tokenRedefinicaoSenha.create.mock.invocationCallOrder[0];
      expect(invalidacao).toBeLessThan(criacao);
    });

    it('grava o HASH SHA-256 do token, nunca o token em claro', async () => {
      banco.prisma.funcionario.findUnique.mockResolvedValue(
        FUNCIONARIO_ATIVO as never,
      );

      await servico.esqueciSenha({ email: 'bruno@procertocp.com.br' });

      const [{ data }] =
        banco.prisma.tokenRedefinicaoSenha.create.mock.calls[0];
      const [, , link] = notificacoes.redefinicaoDeSenha.mock.calls[0];
      const tokenEnviado = new URL(link).searchParams.get('token');

      // 64 hex = SHA-256; o token em claro tem 64 hex também (32 bytes), então
      // a asserção que importa é a desigualdade: o que está no banco NÃO é o
      // que foi para o e-mail. Vazamento do banco não permite redefinir senha.
      expect(data.tokenHash).toMatch(/^[0-9a-f]{64}$/);
      expect(data.tokenHash).not.toBe(tokenEnviado);
      expect(new Date(data.expiraEm).getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe('redefinirSenha', () => {
    const registroValido = {
      id: 7,
      email: 'bruno@procertocp.com.br',
      tokenHash: 'irrelevante',
      usadoEm: null,
      expiraEm: new Date(Date.now() + 60 * 60 * 1000),
    };

    beforeEach(() => {
      gerarHashSenha.mockResolvedValue('$2b$12$hashNovo');
      banco.tx.funcionario.updateMany.mockResolvedValue({ count: 1 } as never);
      banco.tx.cliente.updateMany.mockResolvedValue({ count: 0 } as never);
    });

    it('recusa token inexistente', async () => {
      banco.prisma.tokenRedefinicaoSenha.findUnique.mockResolvedValue(
        null as never,
      );

      await expect(
        servico.redefinirSenha({ token: 'abc', novaSenha: 'SenhaNova123' }),
      ).rejects.toThrow(
        new BadRequestException(
          'Link inválido ou expirado. Solicite uma nova redefinição.',
        ),
      );
    });

    it('recusa token já usado — uso único', async () => {
      banco.prisma.tokenRedefinicaoSenha.findUnique.mockResolvedValue({
        ...registroValido,
        usadoEm: new Date(),
      } as never);

      await expect(
        servico.redefinirSenha({ token: 'abc', novaSenha: 'SenhaNova123' }),
      ).rejects.toThrow(BadRequestException);
      expect(banco.transacoesAbertas).toBe(0);
    });

    it('recusa token expirado', async () => {
      banco.prisma.tokenRedefinicaoSenha.findUnique.mockResolvedValue({
        ...registroValido,
        expiraEm: new Date(Date.now() - 1000),
      } as never);

      await expect(
        servico.redefinirSenha({ token: 'abc', novaSenha: 'SenhaNova123' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('grava a senha e queima o token DENTRO da mesma transação', async () => {
      banco.prisma.tokenRedefinicaoSenha.findUnique.mockResolvedValue(
        registroValido as never,
      );

      await servico.redefinirSenha({
        token: 'abc',
        novaSenha: 'SenhaNova123',
      });

      // As duas escritas chegaram pelo cliente de transação, que só existe
      // dentro do callback. Se o serviço perdesse o `$transaction`, elas
      // apareceriam em `prisma.*` e estas asserções falhariam — que é o ponto:
      // senha trocada com token não queimado permitiria reusar o link.
      expect(banco.tx.funcionario.updateMany).toHaveBeenCalledWith({
        where: { email: 'bruno@procertocp.com.br' },
        data: { senhaHash: '$2b$12$hashNovo' },
      });
      expect(banco.tx.tokenRedefinicaoSenha.update).toHaveBeenCalledWith({
        where: { id: 7 },
        data: { usadoEm: expect.any(Date) },
      });
      expect(banco.prisma.funcionario.updateMany).not.toHaveBeenCalled();
      expect(banco.chamadasForaDaTransacao).toEqual([]);
      expect(banco.chamadasNaTransacao).toEqual([
        'funcionario.updateMany',
        'tokenRedefinicaoSenha.update',
      ]);
    });

    it('cai para a tabela de clientes quando o e-mail não é de funcionário', async () => {
      banco.prisma.tokenRedefinicaoSenha.findUnique.mockResolvedValue(
        registroValido as never,
      );
      banco.tx.funcionario.updateMany.mockResolvedValue({ count: 0 } as never);

      await servico.redefinirSenha({
        token: 'abc',
        novaSenha: 'SenhaNova123',
      });

      expect(banco.tx.cliente.updateMany).toHaveBeenCalledWith({
        where: { email: 'bruno@procertocp.com.br' },
        data: { senhaHash: '$2b$12$hashNovo' },
      });
    });
  });

  describe('alterarSenha — escopo de papel', () => {
    beforeEach(() => {
      gerarHashSenha.mockResolvedValue('$2b$12$hashNovo');
    });

    it('CLIENTE só consegue alterar a própria senha: o id vem do token, não do payload', async () => {
      const sessao = cliente(100);
      banco.prisma.cliente.findUniqueOrThrow.mockResolvedValue(
        CLIENTE_ATIVO as never,
      );
      conferirSenha.mockResolvedValue(true);

      await servico.alterarSenha(sessao, {
        senhaAtual: 'Antiga123',
        novaSenha: 'SenhaNova123',
      });

      // Não existe caminho para informar OUTRO id: o service lê `usuario.id`.
      expect(banco.prisma.cliente.findUniqueOrThrow).toHaveBeenCalledWith({
        where: { id: 100 },
      });
      expect(banco.prisma.cliente.update).toHaveBeenCalledWith({
        where: { id: 100 },
        data: { senhaHash: '$2b$12$hashNovo' },
      });
      // Papel CLIENTE nunca toca a tabela de funcionários.
      expect(banco.prisma.funcionario.update).not.toHaveBeenCalled();
    });

    it('ADMIN altera a própria senha na tabela de funcionários', async () => {
      banco.prisma.funcionario.findUniqueOrThrow.mockResolvedValue(
        FUNCIONARIO_ATIVO as never,
      );
      conferirSenha.mockResolvedValue(true);

      await servico.alterarSenha(admin(1), {
        senhaAtual: 'Antiga123',
        novaSenha: 'SenhaNova123',
      });

      expect(banco.prisma.funcionario.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { senhaHash: '$2b$12$hashNovo' },
      });
      expect(banco.prisma.cliente.update).not.toHaveBeenCalled();
    });

    it('recusa senha atual incorreta e não grava nada', async () => {
      banco.prisma.funcionario.findUniqueOrThrow.mockResolvedValue(
        FUNCIONARIO_ATIVO as never,
      );
      conferirSenha.mockResolvedValue(false);

      await expect(
        servico.alterarSenha(admin(1), {
          senhaAtual: 'errada',
          novaSenha: 'SenhaNova123',
        }),
      ).rejects.toThrow(new UnauthorizedException('Senha atual incorreta.'));
      expect(banco.prisma.funcionario.update).not.toHaveBeenCalled();
    });
  });

  describe('perfil — escopo de papel', () => {
    it('CLIENTE lê o próprio cadastro e a resposta não traz senhaHash', async () => {
      banco.prisma.cliente.findUniqueOrThrow.mockResolvedValue({
        ...CLIENTE_ATIVO,
        estado: { id: 1, sigla: 'SP' },
      } as never);

      const perfil = await servico.perfil(cliente(100));

      expect(banco.prisma.cliente.findUniqueOrThrow).toHaveBeenCalledWith({
        where: { id: 100 },
        include: { estado: true },
      });
      expect(perfil).not.toHaveProperty('senhaHash');
      expect(perfil.role).toBe(Role.CLIENTE);
    });

    it('ADMIN lê o cadastro de funcionário, também sem senhaHash', async () => {
      banco.prisma.funcionario.findUniqueOrThrow.mockResolvedValue({
        ...FUNCIONARIO_ATIVO,
        estado: null,
      } as never);

      const perfil = await servico.perfil(admin(1));

      expect(perfil).not.toHaveProperty('senhaHash');
      expect(banco.prisma.cliente.findUniqueOrThrow).not.toHaveBeenCalled();
    });
  });

  describe('falha de SMTP no fluxo de auth', () => {
    it('não propaga quando o MailService engole a falha — que é o comportamento real', async () => {
      banco.prisma.funcionario.findUnique.mockResolvedValue(
        FUNCIONARIO_ATIVO as never,
      );
      // Espelha a produção: `MailService.enviar` tem try/catch próprio e resolve
      // mesmo com o SMTP fora do ar.
      notificacoes.redefinicaoDeSenha.mockResolvedValue(undefined);

      await expect(
        servico.esqueciSenha({ email: 'bruno@procertocp.com.br' }),
      ).resolves.toBeDefined();
    });

    it('LACUNA CONHECIDA: se o MailService rejeitar, o erro escapa e vira oráculo de enumeração', async () => {
      banco.prisma.funcionario.findUnique.mockResolvedValue(
        FUNCIONARIO_ATIVO as never,
      );
      notificacoes.redefinicaoDeSenha.mockRejectedValue(new Error('SMTP fora do ar'));

      // Este teste afirma o comportamento ATUAL, não o desejado. Hoje
      // `AuthService.esqueciSenha` faz `await this.notificacoes.redefinicaoDeSenha`
      // sem try/catch: a garantia de "e-mail não derruba o fluxo" mora inteira
      // dentro de `MailService.enviar`.
      //
      // Por que importa: o erro só pode acontecer no ramo em que o e-mail
      // EXISTE e está ATIVO. E-mail inexistente retorna antes, sempre 200. Um
      // 500 passa a significar "esta conta existe" — exatamente a enumeração
      // que a mensagem neutra foi escrita para impedir.
      //
      // Correção proposta (não aplicada aqui: mudar o service é entrega
      // própria): envolver a chamada em try/catch, registrar em log e devolver
      // a mensagem neutra assim mesmo. Ver DOCUMENTACAO.md §15.
      await expect(
        servico.esqueciSenha({ email: 'bruno@procertocp.com.br' }),
      ).rejects.toThrow('SMTP fora do ar');
    });
  });
});
