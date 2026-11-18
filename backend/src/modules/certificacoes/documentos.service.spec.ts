import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { SituacaoDocumento, StatusCertificacao } from '@prisma/client';
import { mockDeep } from 'jest-mock-extended';

import { DocumentosCertificacaoService } from './documentos.service';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import { UploadsService } from '../uploads/uploads.service';
import { PrismaService } from '../../prisma/prisma.service';
import { criarPrismaMock, PrismaMock } from '../../testing/prisma.mock';
import { admin, cliente } from '../../testing/usuarios.fixture';

const PROCESSO = 1;
const ETAPA = 10;
const MICRO = 5;
const CLIENTE_DONO = 100;
const RESPONSAVEL = 7;

/**
 * O ciclo do documento pedido ao cliente: enviado, e aceito ou não.
 *
 * O que está coberto aqui tem um sintoma em comum — **nada disso gera erro em
 * execução**. Sem as guardas, o arquivo é gravado, a tela mostra um documento, e
 * o defeito só aparece em quem lê: um cliente vendo anexo de outro processo, um
 * item marcado sobre documento recusado, uma devolução sem motivo.
 */
describe('DocumentosCertificacaoService', () => {
  let servico: DocumentosCertificacaoService;
  let banco: PrismaMock;
  let uploads: jest.Mocked<UploadsService>;
  let notificacoes: jest.Mocked<NotificacoesService>;

  const arquivo = {
    originalname: 'calibracao.pdf',
    mimetype: 'application/pdf',
    size: 2048,
  } as Express.Multer.File;

  /** A etapa com o processo em volta, do jeito que `anexar` a consulta. */
  const etapaNoBanco = (extra: {
    canceladoEm?: Date | null;
    statusProcesso?: 'ATIVO' | 'INATIVO';
    responsavelId?: number | null;
  } = {}) => ({
    id: ETAPA,
    processoId: PROCESSO,
    status: StatusCertificacao.EM_ANDAMENTO,
    etapa: { nome: 'Ensaios laboratoriais' },
    processo: {
      id: PROCESSO,
      nome: 'Disjuntor DIN 25A',
      clienteId: CLIENTE_DONO,
      canceladoEm: extra.canceladoEm ?? null,
      status: extra.statusProcesso ?? 'ATIVO',
      // `in` e não `??`: `null` aqui é "processo sem responsável", um VALOR com
      // significado — e é justamente um dos casos de teste.
      responsavelId:
        'responsavelId' in extra ? extra.responsavelId : RESPONSAVEL,
    },
  });

  const microNoBanco = (extra: {
    exigeDocumento?: boolean;
    certificacaoId?: number;
  } = {}) => ({
    id: MICRO,
    nome: 'Certificado de calibração',
    exigeDocumento: extra.exigeDocumento ?? true,
    certificacaoId: extra.certificacaoId ?? ETAPA,
  });

  /** O documento com o processo em volta, do jeito que `avaliar` o consulta. */
  const documentoNoBanco = (extra: {
    situacao?: SituacaoDocumento | null;
    itemConcluido?: boolean;
    semMicroEtapa?: boolean;
    responsavelId?: number | null;
  } = {}) => ({
    id: 7,
    nomeArquivo: 'calibracao.pdf',
    // `in`, e não `?? PENDENTE`: aqui o `null` é um VALOR com significado
    // ("não passa por aceite"), e o `??` o trocaria pelo default — o caso que
    // este fixture existe justamente para montar.
    situacao: 'situacao' in extra ? extra.situacao : SituacaoDocumento.PENDENTE,
    microEtapa: extra.semMicroEtapa
      ? null
      : {
          id: MICRO,
          nome: 'Certificado de calibração',
          concluida: extra.itemConcluido ?? false,
        },
    historico: {
      certificacaoId: ETAPA,
      certificacao: {
        status: StatusCertificacao.EM_ANDAMENTO,
        processo: {
          id: PROCESSO,
          nome: 'Disjuntor DIN 25A',
          canceladoEm: null,
          status: 'ATIVO' as const,
          responsavelId:
            'responsavelId' in extra ? extra.responsavelId : RESPONSAVEL,
        },
      },
    },
  });

  /** O `data` do único `documentoCertificacao.create` da transação. */
  const dadosDoCreate = () =>
    banco.tx.documentoCertificacao.create.mock.calls[0][0].data;

  beforeEach(() => {
    jest.clearAllMocks();
    banco = criarPrismaMock();
    uploads = mockDeep<UploadsService>();
    uploads.salvarDocumento.mockResolvedValue(
      '/uploads/certificacoes/uuid.pdf',
    );
    notificacoes = mockDeep<NotificacoesService>();
    // Grava PELO cliente que recebeu, para que `chamadasNaTransacao` prove o
    // commit. Comparar o argumento com `banco.tx` não funciona: o service
    // recebe o Proxy de registro, e não o mock cru — ver `prisma.mock.ts`.
    notificacoes.gravar.mockImplementation(async (tx, avisos) => {
      if (avisos.length > 0) await tx.notificacao.createMany({ data: avisos });
    });

    banco.prisma.certificacaoProcesso.findUnique.mockResolvedValue(
      etapaNoBanco() as never,
    );
    banco.prisma.microEtapaCertificacao.findUnique.mockResolvedValue(
      microNoBanco() as never,
    );
    banco.tx.certificacaoHistorico.create.mockResolvedValue({ id: 50 } as never);
    banco.tx.documentoCertificacao.create.mockResolvedValue({ id: 7 } as never);
    banco.tx.documentoCertificacao.update.mockResolvedValue({ id: 7 } as never);

    servico = new DocumentosCertificacaoService(
      banco.prisma as unknown as PrismaService,
      uploads,
      notificacoes,
    );
  });

  describe('anexar — os dois tipos de documento', () => {
    it('com microEtapaId entra na fila: situacao PENDENTE', async () => {
      await servico.anexar(PROCESSO, ETAPA, arquivo, cliente(CLIENTE_DONO), MICRO);

      expect(dadosDoCreate()).toMatchObject({
        microEtapaId: MICRO,
        situacao: SituacaoDocumento.PENDENTE,
        enviadoPorCliente: true,
      });
    });

    it('SEM microEtapaId é evidência da etapa: situacao fica NULA', async () => {
      // `null` não é "pendente". Marcar evidência da equipe como pendente
      // inventaria uma fila de avaliação que nunca existiu, e ela apareceria
      // na tela como trabalho a fazer.
      await servico.anexar(PROCESSO, ETAPA, arquivo, admin());

      const dados = dadosDoCreate();
      expect(dados.situacao).toBeUndefined();
      expect(dados.microEtapaId).toBeUndefined();
      expect(dados.enviadoPorCliente).toBe(false);
    });

    it('`enviadoPorCliente` é campo próprio, não `enviadoPorId IS NULL`', async () => {
      // Aquele null significa duas coisas — envio do cliente E funcionário
      // excluído depois (a FK é SetNull). A tela decide por este booleano o
      // que exibir, então ele não pode ser derivado do campo ambíguo.
      await servico.anexar(PROCESSO, ETAPA, arquivo, cliente(CLIENTE_DONO), MICRO);

      const dados = dadosDoCreate();
      expect(dados.enviadoPorId).toBeNull();
      expect(dados.enviadoPorCliente).toBe(true);
    });

    it('a equipe também pode responder um item, e não vira envio do cliente', async () => {
      await servico.anexar(PROCESSO, ETAPA, arquivo, admin(), MICRO);

      expect(dadosDoCreate()).toMatchObject({
        microEtapaId: MICRO,
        situacao: SituacaoDocumento.PENDENTE,
        enviadoPorCliente: false,
      });
    });

    it('documento e histórico nascem no MESMO commit', async () => {
      await servico.anexar(PROCESSO, ETAPA, arquivo, cliente(CLIENTE_DONO), MICRO);

      // O aviso ao responsável entra no MESMO commit — ver o describe
      // "aviso ao responsável". A lista é exata de propósito: uma escrita nova
      // escapando da transação tem de aparecer aqui.
      expect(banco.chamadasNaTransacao).toEqual([
        'certificacaoHistorico.create',
        'documentoCertificacao.create',
        'notificacao.createMany',
      ]);
      // E nada escreveu fora da transação.
      expect(banco.prisma.documentoCertificacao.create).not.toHaveBeenCalled();
    });
  });

  describe('anexar — escopo do cliente', () => {
    it('cliente de OUTRO processo recebe 403', async () => {
      await expect(
        servico.anexar(PROCESSO, ETAPA, arquivo, cliente(999), MICRO),
      ).rejects.toThrow(ForbiddenException);

      // Nem o arquivo é gravado: a recusa vem antes do upload.
      expect(uploads.salvarDocumento).not.toHaveBeenCalled();
    });

    it('cliente SEM item do checklist recebe 400', async () => {
      // Sem esta guarda ele anexaria arquivo solto em qualquer etapa, e a
      // equipe ganharia uma caixa de entrada que ninguém pediu.
      await expect(
        servico.anexar(PROCESSO, ETAPA, arquivo, cliente(CLIENTE_DONO)),
      ).rejects.toThrow(BadRequestException);
    });

    it('cliente em item que NÃO pede documento recebe 400', async () => {
      banco.prisma.microEtapaCertificacao.findUnique.mockResolvedValue(
        microNoBanco({ exigeDocumento: false }) as never,
      );

      await expect(
        servico.anexar(PROCESSO, ETAPA, arquivo, cliente(CLIENTE_DONO), MICRO),
      ).rejects.toThrow(/não solicita documento/);
    });

    it('item de OUTRA etapa recebe 404', async () => {
      // O caso que faria o documento aparecer no checklist de um cliente que
      // não o enviou: id de microetapa válido, mas de outro processo.
      banco.prisma.microEtapaCertificacao.findUnique.mockResolvedValue(
        microNoBanco({ certificacaoId: 999 }) as never,
      );

      await expect(
        servico.anexar(PROCESSO, ETAPA, arquivo, cliente(CLIENTE_DONO), MICRO),
      ).rejects.toThrow(NotFoundException);
    });

    it('etapa de outro processo recebe 404', async () => {
      banco.prisma.certificacaoProcesso.findUnique.mockResolvedValue({
        ...etapaNoBanco(),
        processoId: 42,
      } as never);

      await expect(
        servico.anexar(PROCESSO, ETAPA, arquivo, admin()),
      ).rejects.toThrow(NotFoundException);
    });

    it('processo CANCELADO não aceita envio', async () => {
      banco.prisma.certificacaoProcesso.findUnique.mockResolvedValue(
        etapaNoBanco({ canceladoEm: new Date('2026-11-01') }) as never,
      );

      await expect(
        servico.anexar(PROCESSO, ETAPA, arquivo, cliente(CLIENTE_DONO), MICRO),
      ).rejects.toThrow(/cancelado/);
    });

    it('processo INATIVO não aceita envio', async () => {
      banco.prisma.certificacaoProcesso.findUnique.mockResolvedValue(
        etapaNoBanco({ statusProcesso: 'INATIVO' }) as never,
      );

      await expect(
        servico.anexar(PROCESSO, ETAPA, arquivo, cliente(CLIENTE_DONO), MICRO),
      ).rejects.toThrow(/inativo/);
    });
  });

  describe('avaliar', () => {
    beforeEach(() => {
      banco.prisma.documentoCertificacao.findUnique.mockResolvedValue(
        documentoNoBanco() as never,
      );
    });

    it('aceita, grava autoria e data', async () => {
      await servico.avaliar(7, { situacao: SituacaoDocumento.ACEITO }, admin());

      expect(banco.tx.documentoCertificacao.update.mock.calls[0][0].data)
        .toMatchObject({
          situacao: SituacaoDocumento.ACEITO,
          avaliadoPorId: admin().id,
          avaliadoPorNome: admin().nome,
        });
    });

    it('aceitar LIMPA o parecer de uma recusa anterior', async () => {
      // Um motivo de devolução ao lado de um "aceito" afirmaria duas coisas
      // opostas sobre o mesmo arquivo. A invariante do banco não pega isto:
      // ela só exige parecer na recusa.
      await servico.avaliar(7, { situacao: SituacaoDocumento.ACEITO }, admin());

      expect(
        banco.tx.documentoCertificacao.update.mock.calls[0][0].data.parecer,
      ).toBeNull();
    });

    it('recusa guarda o parecer', async () => {
      await servico.avaliar(
        7,
        { situacao: SituacaoDocumento.RECUSADO, parecer: 'Fora da validade.' },
        admin(),
      );

      expect(banco.tx.documentoCertificacao.update.mock.calls[0][0].data)
        .toMatchObject({
          situacao: SituacaoDocumento.RECUSADO,
          parecer: 'Fora da validade.',
        });
    });

    it('evidência da equipe (situacao nula) não passa por aceite', async () => {
      banco.prisma.documentoCertificacao.findUnique.mockResolvedValue(
        documentoNoBanco({ situacao: null, semMicroEtapa: true }) as never,
      );

      await expect(
        servico.avaliar(7, { situacao: SituacaoDocumento.ACEITO }, admin()),
      ).rejects.toThrow(BadRequestException);
      expect(banco.tx.documentoCertificacao.update).not.toHaveBeenCalled();
    });

    it('item já CONCLUÍDO trava a recusa com 409', async () => {
      // Recusar aqui deixaria a conclusão apoiada num documento que a equipe
      // acabou de negar. Desmarcar primeiro é explícito; desmarcar em silêncio
      // apagaria trabalho de outra pessoa.
      banco.prisma.documentoCertificacao.findUnique.mockResolvedValue(
        documentoNoBanco({ itemConcluido: true }) as never,
      );

      await expect(
        servico.avaliar(
          7,
          { situacao: SituacaoDocumento.RECUSADO, parecer: 'Ilegível.' },
          admin(),
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('item concluído NÃO trava a aceitação', async () => {
      // Reafirmar o aceite de um item já concluído não contradiz nada.
      banco.prisma.documentoCertificacao.findUnique.mockResolvedValue(
        documentoNoBanco({ itemConcluido: true }) as never,
      );

      await expect(
        servico.avaliar(7, { situacao: SituacaoDocumento.ACEITO }, admin()),
      ).resolves.toBeDefined();
    });

    it('documento inexistente recebe 404', async () => {
      banco.prisma.documentoCertificacao.findUnique.mockResolvedValue(
        null as never,
      );

      await expect(
        servico.avaliar(7, { situacao: SituacaoDocumento.ACEITO }, admin()),
      ).rejects.toThrow(NotFoundException);
    });

    it('a decisão e o histórico ficam no MESMO commit', async () => {
      // Sem o histórico, a trilha mostraria o envio e nunca o desfecho.
      await servico.avaliar(
        7,
        { situacao: SituacaoDocumento.RECUSADO, parecer: 'Fora da validade.' },
        admin(),
      );

      expect(banco.chamadasNaTransacao).toEqual([
        'documentoCertificacao.update',
        'certificacaoHistorico.create',
        'notificacao.createMany',
      ]);
    });

    it('o parecer da recusa entra no histórico', async () => {
      await servico.avaliar(
        7,
        { situacao: SituacaoDocumento.RECUSADO, parecer: 'Fora da validade.' },
        admin(),
      );

      const historico =
        banco.tx.certificacaoHistorico.create.mock.calls[0][0].data;
      expect(historico.observacao).toContain('Fora da validade.');
      // Marcação de trilha, não transição: os dois status são iguais.
      expect(historico.statusAnterior).toBe(historico.statusNovo);
    });
  });

  describe('temDocumentoAceito', () => {
    it('conta só os ACEITOS', async () => {
      // Um PENDENTE ainda não foi olhado e um RECUSADO foi olhado e negado.
      // Contar qualquer um deixaria o item se concluir sobre documento que a
      // equipe não aprovou.
      banco.prisma.documentoCertificacao.count.mockResolvedValue(0 as never);

      await servico.temDocumentoAceito(MICRO);

      expect(banco.prisma.documentoCertificacao.count.mock.calls[0][0]).toEqual({
        where: { microEtapaId: MICRO, situacao: SituacaoDocumento.ACEITO },
      });
    });

    it('devolve true havendo ao menos um', async () => {
      banco.prisma.documentoCertificacao.count.mockResolvedValue(1 as never);
      await expect(servico.temDocumentoAceito(MICRO)).resolves.toBe(true);
    });
  });

  /**
   * O aviso ao responsável nasce no MESMO commit do evento.
   *
   * O modo de falha que isto cobre é o pior possível: o documento é gravado, a
   * tela diz "enviado", e **ninguém é avisado**. Nenhum erro em lugar nenhum —
   * só um arquivo esperando numa fila que a pessoa responsável não sabe que
   * existe.
   */
  describe('aviso ao responsável', () => {
    /** O primeiro argumento de `gravar` é o cliente de transação. */
    const avisosGravados = () =>
      notificacoes.gravar.mock.calls[0]?.[1] ?? [];

    it('envio do cliente avisa o responsável, dentro da transação', async () => {
      await servico.anexar(PROCESSO, ETAPA, arquivo, cliente(CLIENTE_DONO), MICRO);

      expect(notificacoes.gravar).toHaveBeenCalledTimes(1);
      expect(avisosGravados()).toEqual([
        expect.objectContaining({
          destinatarioId: RESPONSAVEL,
          tipo: 'DOCUMENTO_ENVIADO',
        }),
      ]);
      // O aviso caiu DENTRO do commit, depois do documento. O mock de `gravar`
      // escreve pelo cliente que recebeu, então a ordem aqui é a prova.
      expect(banco.chamadasNaTransacao).toEqual([
        'certificacaoHistorico.create',
        'documentoCertificacao.create',
        'notificacao.createMany',
      ]);
    });

    it('o texto é COMPOSTO na gravação, com nome do arquivo e do item', async () => {
      // Derivar na leitura faria renomear a microetapa reescrever um aviso de
      // três semanas atrás.
      await servico.anexar(PROCESSO, ETAPA, arquivo, cliente(CLIENTE_DONO), MICRO);

      const [aviso] = avisosGravados();
      expect(aviso.titulo).toContain('Disjuntor DIN 25A');
      expect(aviso.detalhe).toContain('calibracao.pdf');
      expect(aviso.detalhe).toContain('Certificado de calibração');
    });

    it('evidência da etapa (sem item) NÃO avisa ninguém', async () => {
      // Ela não espera ação de nenhuma pessoa em particular, e avisar sobre ela
      // treinaria o destinatário a ignorar a caixa.
      await servico.anexar(PROCESSO, ETAPA, arquivo, admin());

      expect(notificacoes.gravar).not.toHaveBeenCalled();
    });

    it('processo SEM responsável: avisa com lista vazia, e não quebra', async () => {
      banco.prisma.certificacaoProcesso.findUnique.mockResolvedValue(
        etapaNoBanco({ responsavelId: null }) as never,
      );

      await expect(
        servico.anexar(PROCESSO, ETAPA, arquivo, cliente(CLIENTE_DONO), MICRO),
      ).resolves.toBeDefined();
      expect(avisosGravados()).toEqual([]);
    });

    it('o autor do envio do CLIENTE viaja como null', async () => {
      // `sub` é o id na tabela Cliente OU na Funcionario, e as sequências são
      // independentes. Passar o id do cliente como autor silenciaria o aviso
      // sempre que ele coincidisse com o do responsável — pessoas diferentes
      // com o mesmo número.
      //
      // O cenário: o CLIENTE DONO tem id 100, e o funcionário responsável
      // também. O aviso TEM de sair.
      banco.prisma.certificacaoProcesso.findUnique.mockResolvedValue(
        etapaNoBanco({ responsavelId: CLIENTE_DONO }) as never,
      );

      await servico.anexar(PROCESSO, ETAPA, arquivo, cliente(CLIENTE_DONO), MICRO);

      expect(avisosGravados()).toEqual([
        expect.objectContaining({ destinatarioId: CLIENTE_DONO }),
      ]);
    });

    it('avaliação avisa o responsável quando OUTRA pessoa decidiu', async () => {
      banco.prisma.documentoCertificacao.findUnique.mockResolvedValue(
        documentoNoBanco() as never,
      );

      await servico.avaliar(
        7,
        { situacao: SituacaoDocumento.RECUSADO, parecer: 'Fora da validade.' },
        admin(),
      );

      expect(avisosGravados()).toEqual([
        expect.objectContaining({
          destinatarioId: RESPONSAVEL,
          tipo: 'DOCUMENTO_RECUSADO',
        }),
      ]);
      // O parecer vai no aviso: é o que o responsável precisa ler.
      expect(avisosGravados()[0].detalhe).toContain('Fora da validade.');
    });

    it('aceitação usa o tipo próprio', async () => {
      banco.prisma.documentoCertificacao.findUnique.mockResolvedValue(
        documentoNoBanco() as never,
      );

      await servico.avaliar(7, { situacao: SituacaoDocumento.ACEITO }, admin());

      expect(avisosGravados()[0].tipo).toBe('DOCUMENTO_ACEITO');
    });

    it('o responsável NÃO é avisado da própria decisão', async () => {
      banco.prisma.documentoCertificacao.findUnique.mockResolvedValue(
        documentoNoBanco() as never,
      );

      await servico.avaliar(
        7,
        { situacao: SituacaoDocumento.ACEITO },
        { ...admin(), id: RESPONSAVEL },
      );

      expect(avisosGravados()).toEqual([]);
    });
  });
});
