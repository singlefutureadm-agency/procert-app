import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role, StatusCertificacao } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import { DocumentosCertificacaoService } from './documentos.service';
import { garantirProcessoAberto, marcosDaTransicao } from './certificacoes.service';

/**
 * Resolve a política de aprovação automática de um processo.
 *
 * Duas fontes, e a ordem importa: o processo sobrepõe a trilha, mas **só quando
 * opinou**. `null` no processo NÃO é "não" — é "herda". Um `Boolean` com default
 * `false` no processo não distinguiria "o admin desligou aqui" de "o admin não
 * mexeu", e a segunda precisa acompanhar a trilha quando a política dela mudar.
 *
 * Ponto único da regra: nenhum outro lugar deve ler
 * `Processo.aprovacaoAutomatica` cru para decidir.
 */
export function aprovacaoAutomaticaDoProcesso(processo: {
  aprovacaoAutomatica: boolean | null;
  modeloTrilha: { aprovacaoAutomatica: boolean };
}): boolean {
  return processo.aprovacaoAutomatica ?? processo.modeloTrilha.aprovacaoAutomatica;
}

/** O que a marcação de uma microetapa produziu, para a tela poder explicar. */
export interface ResultadoMarcacao {
  etapaAprovada: boolean;
  /**
   * Preenchido quando a etapa completou o checklist mas NÃO foi aprovada, com
   * o motivo. Silenciar isso faria o usuário marcar o último item e não
   * entender por que nada aconteceu.
   */
  aviso: string | null;
  concluidas: number;
  total: number;
}

/**
 * Microetapas — o checklist de uma etapa dentro de um processo.
 *
 * ## A aprovação automática é efeito do ATO, não estado derivado
 *
 * Marcar a última microetapa PODE aprovar a etapa. Mas "todas marcadas" nunca é
 * lido como "logo, aprovada": a aprovação acontece aqui, no instante da
 * marcação, e fica gravada em `CertificacaoProcesso.status` como qualquer outra.
 *
 * A diferença não é estilo. Uma não conformidade resolvida devolve a etapa para
 * `EM_ANDAMENTO` com todos os itens ainda marcados — se o status fosse derivado
 * do checklist, ela se reaprovaria sozinha no próximo carregamento de tela, e a
 * reavaliação que a NC existe para forçar nunca aconteceria. Como é efeito do
 * ato, nada reaprova: alguém precisa desmarcar e marcar de novo, ou aprovar à
 * mão.
 *
 * ## O que a automação NÃO contorna
 *
 * `exigeDocumento` continua valendo. Etapa que exige evidência e não tem anexo
 * completa o checklist e **não** aprova — devolve `aviso` dizendo o que falta.
 * Furar isso aqui reabriria por outra porta a regra que `salvar()` protege.
 *
 * ## Item que PEDE documento não se marca sem aceite
 *
 * `MicroEtapaCertificacao.exigeDocumento` é outra coisa: o item é um documento
 * pedido ao CLIENTE, e concluí-lo exige um envio com situação `ACEITO`. A
 * guarda recusa a marcação (400) em vez de devolver `aviso`, e a diferença é
 * deliberada: o `aviso` existe para "o checklist fechou mas a etapa não
 * aprovou", um caso em que a marcação é legítima. Aqui a marcação em si é que
 * não pode valer — o item afirma que a equipe conferiu um arquivo que ela não
 * conferiu.
 */
@Injectable()
export class MicroEtapasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly documentos: DocumentosCertificacaoService,
  ) {}

  /**
   * Marca ou desmarca uma microetapa.
   *
   * Idempotente por valor: marcar o que já está marcado não regrava autoria nem
   * dispara aprovação de novo.
   */
  async alternar(
    id: number,
    concluida: boolean,
    usuario: UsuarioAutenticado,
  ): Promise<ResultadoMarcacao> {
    if (usuario.role === Role.CLIENTE) {
      throw new ForbiddenException(
        'Clientes acompanham o processo, mas não executam etapas.',
      );
    }

    const micro = await this.prisma.microEtapaCertificacao.findUnique({
      where: { id },
      select: {
        id: true,
        nome: true,
        concluida: true,
        exigeDocumento: true,
        certificacaoId: true,
        certificacao: {
          select: {
            id: true,
            status: true,
            iniciadaEm: true,
            etapa: { select: { nome: true, exigeDocumento: true } },
            processo: {
              select: {
                id: true,
                canceladoEm: true,
                status: true,
                aprovacaoAutomatica: true,
                modeloTrilha: { select: { aprovacaoAutomatica: true } },
              },
            },
          },
        },
      },
    });

    if (!micro) {
      throw new NotFoundException(`Microetapa ${id} não encontrada.`);
    }

    const certificacao = micro.certificacao;
    garantirProcessoAberto(certificacao.processo);

    // Etapa já aprovada não aceita mexer no checklist: o histórico afirma que
    // ela foi avaliada com aquele conjunto marcado, e mudá-lo depois faria o
    // registro divergir do que sustentou a aprovação.
    if (certificacao.status === StatusCertificacao.APROVADO) {
      throw new BadRequestException(
        'Esta etapa já está aprovada. Para retomar o checklist, reabra a etapa ' +
          'mudando o status dela na linha do tempo.',
      );
    }

    // Item que PEDE documento ao cliente só se conclui com um envio ACEITO.
    // Vale apenas ao MARCAR: desmarcar é sempre permitido, e é o caminho que a
    // recusa de um documento já aceito manda usar.
    if (concluida && micro.exigeDocumento) {
      const aceito = await this.documentos.temDocumentoAceito(micro.id);

      if (!aceito) {
        throw new BadRequestException(
          `O item "${micro.nome}" espera um documento do cliente. Marque-o ` +
            'apenas depois de aceitar o arquivo enviado — aceitar o documento ' +
            'não marca o item sozinho.',
        );
      }
    }

    await this.prisma.microEtapaCertificacao.update({
      where: { id },
      data: {
        concluida,
        // Desmarcar limpa a autoria: um nome ao lado de um item não concluído
        // afirmaria que alguém o concluiu.
        concluidaEm: concluida ? new Date() : null,
        concluidaPorId: concluida ? usuario.id : null,
        concluidaPorNome: concluida ? usuario.nome : null,
      },
    });

    const { concluidas, total } = await this.contar(micro.certificacaoId);

    // Só o ato que FECHA o checklist é candidato a aprovar. Desmarcar nunca
    // aprova, e marcar um item no meio também não.
    if (!concluida || total === 0 || concluidas < total) {
      return { etapaAprovada: false, aviso: null, concluidas, total };
    }

    if (!aprovacaoAutomaticaDoProcesso(certificacao.processo)) {
      return {
        etapaAprovada: false,
        aviso:
          'Checklist concluído. Este processo aprova as etapas manualmente — ' +
          'a aprovação continua sendo um ato da equipe, na linha do tempo.',
        concluidas,
        total,
      };
    }

    // Etapa reprovada ou com NC em aberto não se aprova por checklist: o
    // caminho de volta é o ciclo da não conformidade, e fechar os itens aqui
    // o contornava.
    const ncsAbertas = await this.prisma.naoConformidade.count({
      where: {
        certificacaoId: certificacao.id,
        status: { in: ['ABERTA', 'EM_TRATATIVA'] },
      },
    });
    if (certificacao.status === StatusCertificacao.REPROVADO || ncsAbertas > 0) {
      return {
        etapaAprovada: false,
        aviso:
          'Checklist concluído, mas esta etapa está reprovada ou tem não ' +
          'conformidade em aberto. Encerre a não conformidade e reavalie a ' +
          'etapa na linha do tempo.',
        concluidas,
        total,
      };
    }

    if (certificacao.etapa.exigeDocumento) {
      const semDocumento = await this.documentos.etapasSemDocumento([
        certificacao.id,
      ]);

      if (semDocumento.length) {
        return {
          etapaAprovada: false,
          aviso:
            // Anexar não aprova sozinho (a aprovação é efeito do ATO de marcar):
            // o texto diz o que fazer depois, em vez de prometer o que não vem.
            'Checklist concluído, mas esta etapa exige evidência anexada para ' +
            'ser aprovada. Anexe o documento e depois desmarque e marque o ' +
            'último item, ou aprove a etapa na linha do tempo.',
          concluidas,
          total,
        };
      }
    }

    const aprovou = await this.aprovar(certificacao, usuario);
    if (!aprovou) {
      return {
        etapaAprovada: false,
        aviso:
          'Checklist concluído, mas a etapa foi alterada por outra pessoa neste ' +
          'instante e não foi aprovada. Confira o status na linha do tempo.',
        concluidas,
        total,
      };
    }

    return { etapaAprovada: true, aviso: null, concluidas, total };
  }

  // ------------------------------------------------------------- internos

  private contar(certificacaoId: number) {
    return this.prisma.microEtapaCertificacao
      .groupBy({
        by: ['concluida'],
        where: { certificacaoId },
        _count: { _all: true },
      })
      .then((grupos) => {
        const total = grupos.reduce((soma, g) => soma + g._count._all, 0);
        const concluidas =
          grupos.find((g) => g.concluida)?._count._all ?? 0;
        return { concluidas, total };
      });
  }

  /**
   * Aprova a etapa pelo mesmo caminho que uma aprovação manual: status,
   * histórico com autoria e os marcos temporais.
   *
   * Reusa `marcosDaTransicao` de propósito — a invariante
   * `ck_certificacao_concluida_em` recusaria a linha se este caminho gravasse
   * o status sem a conclusão, e duplicar a regra aqui era a chance de errar.
   *
   * Trava a linha e confere o status lido lá em cima — o mesmo padrão do lote em
   * `salvar`. Sem isso, uma reprovação gravada entre a leitura e esta escrita
   * era sobrescrita pela aprovação, com `statusAnterior` errado no histórico
   * (achado na auditoria de 17/11/2026). Devolve `false` quando a etapa mudou.
   */
  private aprovar(
    certificacao: {
      id: number;
      status: StatusCertificacao;
      iniciadaEm: Date | null;
      etapa: { nome: string };
    },
    usuario: UsuarioAutenticado,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const [atual] = await tx.$queryRaw<
        { status: StatusCertificacao }[]
      >`SELECT status::text AS status FROM certificacoes_processo WHERE id = ${certificacao.id} FOR UPDATE`;
      if (atual?.status !== certificacao.status) return false;

      await tx.certificacaoProcesso.update({
        where: { id: certificacao.id },
        data: {
          status: StatusCertificacao.APROVADO,
          ...marcosDaTransicao(
            { status: certificacao.status, iniciadaEm: certificacao.iniciadaEm },
            StatusCertificacao.APROVADO,
            true,
          ),
        },
      });

      await tx.certificacaoHistorico.create({
        data: {
          certificacaoId: certificacao.id,
          statusAnterior: certificacao.status,
          statusNovo: StatusCertificacao.APROVADO,
          observacao:
            'Aprovada automaticamente: todas as microetapas do checklist foram concluídas.',
          // Autoria de quem marcou o último item. "Sistema" seria mentira: a
          // decisão foi de uma pessoa, e a auditoria precisa do nome dela.
          alteradoPorId: usuario.id,
          alteradoPorNome: usuario.nome,
        },
      });
      return true;
    });
  }
}

