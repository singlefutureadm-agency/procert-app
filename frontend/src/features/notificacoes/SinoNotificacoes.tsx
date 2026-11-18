import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { Icone } from '@/components/Icone';
import { mensagemDeErro } from '@/lib/api';
import { chaves } from '@/lib/queryClient';
import type { Notificacao } from '@/types';
import { notificacoesApi } from './api';
import { ROTULO_TIPO, tempoRelativo } from './rotulos';

/** De quanto em quanto tempo o badge reconsulta. Ver a nota em `Props`. */
const INTERVALO_POLLING = 60_000;

/**
 * O sino do cabeçalho, com a caixa de avisos pendurada nele.
 *
 * ## Por que polling, e não WebSocket
 *
 * A API roda como função serverless na Vercel: não há processo de longa duração
 * para manter uma conexão aberta. Um minuto de atraso num aviso que já espera a
 * ação de uma pessoa não muda nada, e o custo é uma consulta que devolve **um
 * número** — a rota `/notificacoes/nao-lidas` existe exatamente para isso.
 *
 * `refetchOnWindowFocus` está desligado globalmente no `queryClient`, mas aqui
 * ele é religado: voltar para a aba é o momento em que a pessoa quer o número
 * certo, e é mais barato que encurtar o intervalo.
 *
 * ## A lista só é consultada quando o painel abre
 *
 * O badge precisa do número a cada minuto; a lista, só quando alguém olha.
 * `enabled: aberto` é o que separa as duas coisas — sem isso, toda tela do
 * painel carregaria vinte avisos por minuto para não mostrar nenhum.
 */
export function SinoNotificacoes() {
  const queryClient = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const painelId = useId();
  const container = useRef<HTMLDivElement>(null);
  const botao = useRef<HTMLButtonElement>(null);

  const contador = useQuery({
    queryKey: chaves.notificacoesNaoLidas,
    queryFn: notificacoesApi.contarNaoLidas,
    refetchInterval: INTERVALO_POLLING,
    refetchOnWindowFocus: true,
  });

  const lista = useQuery({
    queryKey: chaves.notificacoes({ limite: 20 }),
    queryFn: () => notificacoesApi.listar({ limite: 20 }),
    enabled: aberto,
  });

  const naoLidas = contador.data?.naoLidas ?? 0;

  /** Atualiza badge E lista: as duas chaves são separadas de propósito. */
  const recarregar = () => {
    void queryClient.invalidateQueries({ queryKey: chaves.notificacoesNaoLidas });
    void queryClient.invalidateQueries({ queryKey: ['notificacoes', 'lista'] });
  };

  const marcarLida = useMutation({
    mutationFn: notificacoesApi.marcarLida,
    onSuccess: recarregar,
    onError: (erro) => toast.error(mensagemDeErro(erro)),
  });

  const marcarTodas = useMutation({
    mutationFn: notificacoesApi.marcarTodasLidas,
    onSuccess: ({ marcadas }) => {
      if (marcadas > 0) {
        toast.success(
          `${marcadas} aviso${marcadas > 1 ? 's' : ''} marcado${marcadas > 1 ? 's' : ''} como lido${marcadas > 1 ? 's' : ''}.`,
        );
      }
      recarregar();
    },
    onError: (erro) => toast.error(mensagemDeErro(erro)),
  });

  /*
   * Fecha ao clicar fora e no Escape, e devolve o foco ao sino.
   *
   * Não usa `Modal`: este painel não é modal — não prende o foco nem cobre a
   * tela, e um suspenso que capturasse o Tab impediria de navegar o cabeçalho.
   * A mecânica mínima de um suspenso é outra, e é esta.
   */
  useEffect(() => {
    if (!aberto) return;

    const aoClicarFora = (evento: MouseEvent) => {
      if (!container.current?.contains(evento.target as Node)) setAberto(false);
    };
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key !== 'Escape') return;
      setAberto(false);
      // Devolve o foco: fechar com Escape e deixá-lo no <body> perde o lugar
      // de quem navega por teclado.
      // `as FocusOptions` como no `Modal`: a opção existe nos navegadores e
      // ainda não está no lib.dom do TypeScript. Sem ela o anel de foco não
      // acende, porque foco dado por código não conta como `:focus-visible`.
      botao.current?.focus({ focusVisible: true } as FocusOptions);
    };

    document.addEventListener('mousedown', aoClicarFora);
    document.addEventListener('keydown', aoTeclar);
    return () => {
      document.removeEventListener('mousedown', aoClicarFora);
      document.removeEventListener('keydown', aoTeclar);
    };
  }, [aberto]);

  return (
    <div className="sino" ref={container}>
      <button
        ref={botao}
        type="button"
        className="btn btn--icone sino__botao"
        aria-expanded={aberto}
        aria-controls={painelId}
        /* O número vai no NOME do controle, não só no badge visual: o badge é
           `aria-hidden`, e sem isto o leitor de tela anunciaria só "Avisos". */
        aria-label={
          naoLidas > 0
            ? `Avisos — ${naoLidas} não lido${naoLidas > 1 ? 's' : ''}`
            : 'Avisos'
        }
        onClick={() => setAberto((estava) => !estava)}
      >
        <Icone nome="sino" />
        {naoLidas > 0 && (
          <span className="sino__contador" aria-hidden>
            {naoLidas > 99 ? '99+' : naoLidas}
          </span>
        )}
      </button>

      {aberto && (
        <div className="sino__painel vidro" id={painelId} role="region" aria-label="Avisos">
          <div className="sino__topo">
            <strong>Avisos</strong>
            {naoLidas > 0 && (
              <button
                type="button"
                className="btn btn--pequeno"
                disabled={marcarTodas.isPending}
                onClick={() => marcarTodas.mutate()}
              >
                Marcar todos como lidos
              </button>
            )}
          </div>

          {lista.isLoading ? (
            <p className="texto-pequeno texto-fraco sino__vazio">Carregando…</p>
          ) : (lista.data?.dados.length ?? 0) === 0 ? (
            <p className="texto-pequeno texto-fraco sino__vazio">
              Nenhum aviso. Você é avisado aqui quando um cliente envia um
              documento de um processo seu, ou quando alguém avalia um.
            </p>
          ) : (
            <ul className="sino__lista">
              {lista.data?.dados.map((aviso) => (
                <ItemAviso
                  key={aviso.id}
                  aviso={aviso}
                  aoAbrir={() => {
                    setAberto(false);
                    if (!aviso.lidaEm) marcarLida.mutate(aviso.id);
                  }}
                  aoMarcarLida={() => marcarLida.mutate(aviso.id)}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function ItemAviso({
  aviso,
  aoAbrir,
  aoMarcarLida,
}: {
  aviso: Notificacao;
  aoAbrir: () => void;
  aoMarcarLida: () => void;
}) {
  const conteudo = (
    <>
      <span className="sino__item-topo">
        <span className="badge badge--pendente">{ROTULO_TIPO[aviso.tipo]}</span>
        <span className="texto-pequeno texto-fraco">
          {tempoRelativo(aviso.criadoEm)}
        </span>
      </span>
      <span className="sino__item-titulo">{aviso.titulo}</span>
      {aviso.detalhe && (
        <span className="texto-pequeno texto-suave">{aviso.detalhe}</span>
      )}
    </>
  );

  return (
    <li className={`sino__item ${aviso.lidaEm ? 'sino__item--lido' : ''}`}>
      {/* Sem `processoId` o aviso não leva a lugar nenhum — o processo deixou
          de existir. Vira texto, e não um link morto. */}
      {aviso.processoId ? (
        <Link
          to={`/certificacoes/processo/${aviso.processoId}`}
          className="sino__item-link"
          onClick={aoAbrir}
        >
          {conteudo}
        </Link>
      ) : (
        <span className="sino__item-link">{conteudo}</span>
      )}

      {!aviso.lidaEm && (
        <button
          type="button"
          className="btn btn--icone btn--pequeno"
          aria-label={`Marcar "${aviso.titulo}" como lido`}
          title="Marcar como lido"
          onClick={aoMarcarLida}
        >
          <Icone nome="check" />
        </button>
      )}
    </li>
  );
}
