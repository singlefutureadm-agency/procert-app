import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { BadgeCertificacao } from '@/components/Badge';
import { Carregando } from '@/components/Carregando';
import { Icone } from '@/components/Icone';
import { Modal } from '@/components/Modal';
import { produtosApi } from '@/features/produtos/api';
import {
  ROTULO_FASE,
  ROTULO_PAPEL_FUNCIONAL,
} from '@/features/trilhas/rotulos';
import { mensagemDeErro } from '@/lib/api';
import { formatarPrazoSla } from '@/lib/formatadores';
import { chaves } from '@/lib/queryClient';
import type { CartaoQuadro, EtapaTimeline } from '@/types';
import { certificacoesApi } from './api';

/**
 * O processo aberto a partir do cartão do quadro.
 *
 * É modal, e não navegação, porque a operação diária aqui é **marcar itens de
 * checklist** — uma sequência curta de cliques que não justifica sair do quadro
 * e voltar. A linha do tempo continua existindo e tem um link daqui: é lá que
 * vivem histórico, evidências e não conformidades, e sair do quadro para
 * consultá-los é o certo.
 *
 * Fechar o checklist de uma etapa PODE aprová-la — depende da política do
 * processo, que este modal também deixa mudar.
 */
export function ModalProcesso({
  cartao,
  aoFechar,
}: {
  cartao: CartaoQuadro | null;
  aoFechar: () => void;
}) {
  const clienteQuery = useQueryClient();
  const produtoId = cartao?.produtoId;

  // O formulário de motivo só aparece depois de pedir para cancelar: é ação
  // destrutiva do ponto de vista do fluxo, e um textarea sempre visível
  // convidaria ao clique acidental.
  const [cancelando, setCancelando] = useState(false);
  const [motivo, setMotivo] = useState('');

  const { data: detalhe, isLoading } = useQuery({
    queryKey: chaves.certificacao(produtoId ?? 0),
    queryFn: () => certificacoesApi.porProduto(produtoId!),
    enabled: produtoId !== undefined,
  });

  const { data: produto } = useQuery({
    queryKey: chaves.produto(produtoId ?? 0),
    queryFn: () => produtosApi.buscar(produtoId!),
    enabled: produtoId !== undefined,
  });

  /** Invalida o processo E o quadro: a marcação pode ter mudado a coluna. */
  function recarregar() {
    if (produtoId === undefined) return;
    clienteQuery.invalidateQueries({ queryKey: chaves.certificacao(produtoId) });
    clienteQuery.invalidateQueries({ queryKey: ['certificacoes', 'quadro'] });
  }

  const marcar = useMutation({
    mutationFn: ({ id, concluida }: { id: number; concluida: boolean }) =>
      certificacoesApi.alternarMicroEtapa(id, concluida),
    onSuccess: (resultado) => {
      if (resultado.etapaAprovada) {
        toast.success('Checklist concluído: a etapa foi aprovada.');
      } else if (resultado.aviso) {
        // O aviso é o caso em que o checklist fechou e nada aconteceu. Sem
        // mostrá-lo, o usuário marca o último item e fica sem entender.
        toast.warning(resultado.aviso, { duration: 8000 });
      }
      recarregar();
    },
    onError: (erro) =>
      toast.error(mensagemDeErro(erro, 'Não foi possível marcar a microetapa.')),
  });

  const alterarPolitica = useMutation({
    mutationFn: (aprovacaoAutomatica: boolean | null) =>
      produtosApi.atualizar(produtoId!, { aprovacaoAutomatica }),
    onSuccess: () => {
      if (produtoId !== undefined) {
        clienteQuery.invalidateQueries({ queryKey: chaves.produto(produtoId) });
      }
      toast.success('Modo de aprovação atualizado para este processo.');
    },
    onError: (erro) =>
      toast.error(mensagemDeErro(erro, 'Não foi possível mudar o modo de aprovação.')),
  });

  /**
   * Cancelar e reabrir na mesma mutação: são a mesma decisão em dois sentidos,
   * e separá-las duplicaria a invalidação e o tratamento de erro.
   * `motivo === null` significa reabrir.
   */
  const cancelamento = useMutation({
    mutationFn: (motivoOuNulo: string | null) =>
      motivoOuNulo === null
        ? certificacoesApi.reabrir(produtoId!)
        : certificacoesApi.cancelar(produtoId!, motivoOuNulo),
    onSuccess: (resposta) => {
      toast.success(resposta.mensagem);
      setCancelando(false);
      setMotivo('');
      recarregar();
      // O cartão sai (ou volta) de coluna, e o modal exibe o estado antigo.
      aoFechar();
    },
    onError: (erro) =>
      toast.error(mensagemDeErro(erro, 'Não foi possível concluir a ação.')),
  });

  if (!cartao) return null;

  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      titulo={cartao.produto}
      largura="ampla"
      comBotaoFechar
    >
      <p className="texto-pequeno texto-suave processo__identificacao">
        {cartao.codigoProcesso ?? 'Sem código de processo'} · {cartao.cliente.nome}
      </p>

      {isLoading && <Carregando />}

      {detalhe && (
        <>
          <PoliticaDeAprovacao
            valor={produto?.aprovacaoAutomatica ?? null}
            salvando={alterarPolitica.isPending}
            aoMudar={(valor) => alterarPolitica.mutate(valor)}
          />

          <div className="processo__etapas">
            {detalhe.etapas.map((etapa) => (
              <BlocoEtapa
                key={etapa.id}
                etapa={etapa}
                salvando={marcar.isPending}
                aoAlternar={(id, concluida) => marcar.mutate({ id, concluida })}
              />
            ))}
          </div>

          <div className="processo__saidas">
            <Link
              to={`/certificacoes/produto/${cartao.produtoId}`}
              className="btn btn--secundario"
            >
              <Icone nome="prancheta" />
              Linha do tempo
            </Link>

            {/* O modelo que gerou este checklist. Estava a dois menus de
                distância; daqui é um clique. */}
            {produto?.modeloTrilha && (
              <Link
                to={`/trilhas/${produto.modeloTrilha.trilha.id}`}
                className="btn btn--secundario"
              >
                <Icone nome="bussola" />
                Trilha (v{produto.modeloTrilha.versao})
              </Link>
            )}

            {cartao.cancelamento ? (
              <button
                type="button"
                className="btn btn--secundario"
                disabled={cancelamento.isPending}
                onClick={() => cancelamento.mutate(null)}
              >
                <Icone nome="reciclar" />
                Reabrir processo
              </button>
            ) : (
              <button
                type="button"
                className="btn btn--perigo"
                disabled={cancelamento.isPending}
                onClick={() => setCancelando(true)}
              >
                <Icone nome="proibido" />
                Cancelar processo
              </button>
            )}
          </div>

          {cancelando && (
            <form
              className="processo__cancelar"
              onSubmit={(evento) => {
                evento.preventDefault();
                cancelamento.mutate(motivo.trim());
              }}
            >
              <label htmlFor="motivo-cancelamento">
                Por que o processo está sendo interrompido?
              </label>
              <textarea
                id="motivo-cancelamento"
                rows={3}
                required
                minLength={5}
                value={motivo}
                onChange={(evento) => setMotivo(evento.target.value)}
                placeholder="Ex.: cliente desistiu da certificação."
              />
              <p className="texto-pequeno texto-fraco">
                As etapas ficam como estão. O processo sai do fluxo e vai para a
                coluna Cancelado — não é exclusão.
              </p>
              <div className="processo__cancelar-acoes">
                <button
                  type="button"
                  className="btn btn--secundario"
                  onClick={() => setCancelando(false)}
                >
                  Voltar
                </button>
                <button
                  type="submit"
                  className="btn btn--perigo"
                  disabled={motivo.trim().length < 5 || cancelamento.isPending}
                >
                  Confirmar cancelamento
                </button>
              </div>
            </form>
          )}
        </>
      )}
    </Modal>
  );
}

/**
 * O campo do PRODUTO que decide como as etapas dele são aprovadas.
 *
 * Três estados, não dois: "herdar" é diferente de "manual". Um processo que
 * herda acompanha a trilha quando a política dela mudar; um marcado como
 * manual continua manual. Um checkbox de dois estados perderia essa diferença.
 */
function PoliticaDeAprovacao({
  valor,
  salvando,
  aoMudar,
}: {
  valor: boolean | null;
  salvando: boolean;
  aoMudar: (valor: boolean | null) => void;
}) {
  const opcoes: { valor: boolean | null; rotulo: string; dica: string }[] = [
    {
      valor: null,
      rotulo: 'Como a trilha',
      dica: 'Segue o padrão do processo definido na trilha.',
    },
    {
      valor: true,
      rotulo: 'Automática',
      dica: 'Fechar o checklist de uma etapa aprova a etapa.',
    },
    {
      valor: false,
      rotulo: 'Manual',
      dica: 'O checklist orienta; quem aprova é a equipe.',
    },
  ];

  const atual = opcoes.find((opcao) => opcao.valor === valor) ?? opcoes[0];

  return (
    <fieldset className="processo__politica">
      <legend>Aprovação das etapas neste processo</legend>

      <div className="processo__politica-opcoes">
        {opcoes.map((opcao) => (
          <label key={String(opcao.valor)} className="processo__politica-opcao">
            <input
              type="radio"
              name="aprovacao"
              checked={opcao.valor === valor}
              disabled={salvando}
              onChange={() => aoMudar(opcao.valor)}
            />
            <span>{opcao.rotulo}</span>
          </label>
        ))}
      </div>

      <p className="texto-pequeno texto-fraco">{atual.dica}</p>
    </fieldset>
  );
}

function BlocoEtapa({
  etapa,
  salvando,
  aoAlternar,
}: {
  etapa: EtapaTimeline;
  salvando: boolean;
  aoAlternar: (id: number, concluida: boolean) => void;
}) {
  const concluidas = etapa.microEtapas.filter((m) => m.concluida).length;
  const total = etapa.microEtapas.length;
  const aprovada = etapa.status === 'APROVADO';

  return (
    <section className="processo__etapa">
      <header className="processo__etapa-cabecalho">
        <div>
          <h3 className="titulo-bloco">
            {etapa.ordem}. {etapa.etapa.nome}
          </h3>
          <p className="texto-pequeno texto-fraco">
            {ROTULO_FASE[etapa.etapa.fase]}
            {etapa.etapa.papelResponsavel &&
              ` · ${ROTULO_PAPEL_FUNCIONAL[etapa.etapa.papelResponsavel]}`}
            {etapa.etapa.prazoSlaHoras &&
              ` · ${formatarPrazoSla(etapa.etapa.prazoSlaHoras)}`}
          </p>
        </div>
        <BadgeCertificacao status={etapa.status} />
      </header>

      {total === 0 && (
        <p className="texto-pequeno texto-fraco processo__sem-checklist">
          Esta etapa não tem checklist definido na trilha.
        </p>
      )}

      {total > 0 && (
        <>
          <p className="texto-pequeno texto-suave">
            {concluidas} de {total} concluída{total === 1 ? '' : 's'}
          </p>

          <ul className="processo__checklist">
            {etapa.microEtapas.map((micro) => (
              <li key={micro.id}>
                <label
                  className={`processo__item ${
                    micro.concluida ? 'processo__item--feito' : ''
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={micro.concluida}
                    // Etapa aprovada trava o checklist: o histórico afirma que
                    // ela foi avaliada com aquele conjunto marcado. O backend
                    // recusa de qualquer forma; aqui é só não oferecer.
                    disabled={salvando || aprovada}
                    onChange={(evento) =>
                      aoAlternar(micro.id, evento.target.checked)
                    }
                  />
                  <span>
                    {micro.nome}
                    {/* Área e prazo PRÓPRIOS do item. Em branco, ele segue os
                        da etapa — repetir ali seria ruído. */}
                    {(micro.papelResponsavel || micro.prazoSlaHoras) && (
                      <span className="texto-pequeno texto-fraco processo__item-meta">
                        {[
                          micro.papelResponsavel &&
                            ROTULO_PAPEL_FUNCIONAL[micro.papelResponsavel],
                          micro.prazoSlaHoras &&
                            formatarPrazoSla(micro.prazoSlaHoras),
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    )}
                  </span>
                </label>

                {micro.concluida && micro.concluidaPorNome && (
                  <span className="texto-pequeno texto-fraco processo__autoria">
                    {micro.concluidaPorNome}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
