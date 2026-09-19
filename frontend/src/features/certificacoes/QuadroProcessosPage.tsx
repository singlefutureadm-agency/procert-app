import {
  closestCorners,
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { CabecalhoPagina } from '@/components/CabecalhoPagina';
import { CampoBusca } from '@/components/CampoBusca';
import { Carregando } from '@/components/Carregando';
import { EstadoVazio } from '@/components/EstadoVazio';
import { Icone } from '@/components/Icone';
import { Progresso } from '@/components/Progresso';
import { RegiaoRolavel } from '@/components/RegiaoRolavel';
import { categoriasApi } from '@/features/categorias-processo/api';
import {
  ROTULO_FASE,
  ROTULO_MOTIVO_PROCESSO,
  ROTULO_PAPEL_FUNCIONAL,
} from '@/features/trilhas/rotulos';
import { mensagemDeErro } from '@/lib/api';
import { formatarDataHora, formatarPrazoSla } from '@/lib/formatadores';
import { chaves } from '@/lib/queryClient';
import type {
  CartaoQuadro,
  ColunaDoQuadro,
  ColunaQuadro,
  FaseProcesso,
  PapelFuncional,
  SemaforoAging,
} from '@/types';
import { certificacoesApi, type FiltrosQuadro } from './api';
import { ModalProcesso } from './ModalProcesso';
import { AlternarVisaoCertificacoes } from './AlternarVisao';

/** Título de cada coluna. `CONCLUIDO` não vem do enum de fases. */
const TITULO_COLUNA: Record<ColunaQuadro, string> = {
  ...ROTULO_FASE,
  CONCLUIDO: 'Concluído',
  CANCELADO: 'Cancelado',
};

/**
 * Colunas que NÃO recebem soltura: são desfechos, não posições no fluxo.
 * Concluir exige aprovar etapa com evidência; cancelar exige motivo.
 */
const COLUNAS_TERMINAIS: string[] = ['CONCLUIDO', 'CANCELADO'];

const ROTULO_SEMAFORO: Record<SemaforoAging, string> = {
  VERDE: 'Em dia',
  AMARELO: 'Atenção',
  VERMELHO: 'Atrasado',
};

/**
 * Quadro de processos — o pipeline por fase.
 *
 * ## O arrastar-e-soltar move a ETAPA, não o cartão
 *
 * A coluna continua DERIVADA da etapa atual: nada de posição é gravado no
 * processo. Soltar um cartão em "Ensaios de laboratório" chama
 * `POST /mover-fase`, que marca como `EM_ANDAMENTO` a primeira etapa não
 * aprovada daquela fase e devolve à fila as que estavam em andamento antes —
 * com histórico e autoria, como qualquer mudança de status.
 *
 * O cartão para na coluna certa porque o processo foi mesmo para lá. Guardar a
 * fase no processo seria mais simples e é exatamente o que o quadro Trello fazia
 * de errado: a lista dizia uma coisa e o checklist dizia outra.
 *
 * **Arrastar não aprova nada.** Pular para a última fase não marca as
 * anteriores como aprovadas — aprovação é ato com evidência e autoria. Por isso
 * também `Concluído` e `Cancelado` não recebem soltura: são desfechos, com
 * ações próprias.
 */
export function QuadroProcessosPage() {
  const [filtros, setFiltros] = useState<FiltrosQuadro>({ busca: '' });
  // O cartão aberto no modal. Guardado inteiro (e não só o id) para o modal
  // ter título e cliente antes mesmo de a consulta do processo responder.
  const [aberto, setAberto] = useState<CartaoQuadro | null>(null);
  const clienteQuery = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: chaves.quadroProcessos(filtros),
    queryFn: () => certificacoesApi.quadro(filtros),
  });

  const { data: categorias } = useQuery({
    queryKey: chaves.categoriasResumo,
    queryFn: () => categoriasApi.resumo(),
  });

  const totalGeral =
    data?.colunas.reduce((soma, coluna) => soma + coluna.total, 0) ?? 0;

  function alterar<C extends keyof FiltrosQuadro>(
    campo: C,
    valor: FiltrosQuadro[C],
  ) {
    setFiltros((atual) => ({ ...atual, [campo]: valor }));
  }

  /*
   * 6px antes de considerar arrasto.
   *
   * Sem essa distância mínima, um clique é um arrasto de zero pixel e o modal
   * do cartão nunca abriria — o `onClick` do botão jamais dispararia. É o
   * mesmo motivo pelo qual a reordenação de etapas da trilha usa uma alça.
   */
  const sensores = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const mover = useMutation({
    mutationFn: ({ processoId, fase }: { processoId: number; fase: FaseProcesso }) =>
      certificacoesApi.moverParaFase(processoId, fase),
    onSuccess: (resposta) => {
      toast.success(resposta.mensagem);
      clienteQuery.invalidateQueries({ queryKey: ['certificacoes'] });
    },
    // A recusa é informativa: "a trilha deste processo não tem etapa nessa
    // fase" é a resposta certa, e engoli-la deixaria o cartão voltando ao
    // lugar sem explicação.
    onError: (erro) =>
      toast.error(mensagemDeErro(erro, 'Não foi possível mover o processo.')),
  });

  function aoSoltar(evento: DragEndEvent) {
    const destino = evento.over?.id;
    const cartao = evento.active.data.current?.cartao as CartaoQuadro | undefined;

    // Soltou fora de coluna, ou na própria: nada a fazer.
    if (!destino || !cartao) return;
    if (COLUNAS_TERMINAIS.includes(destino as string)) return;

    mover.mutate({ processoId: cartao.processoId, fase: destino as FaseProcesso });
  }

  return (
    <>
      <CabecalhoPagina
        titulo="Quadro de processos"
        descricao="Clique num cartão para abrir o checklist, ou arraste-o para outra fase — arrastar move a etapa do processo, com histórico e autoria. Concluir e cancelar têm ações próprias."
        acoes={
          <div className="quadro__acoes-cabecalho">
            {/*
              Abrir processo e ajustar a trilha eram as duas ações que exigiam
              sair do quadro e navegar por outro menu. São links, não botões:
              levam a telas próprias, e precisam abrir em nova aba.
            */}
            <Link to="/trilhas" className="btn btn--secundario">
              <Icone nome="bussola" />
              Trilhas
            </Link>
            <Link to="/processos/novo" className="btn btn--primario">
              Novo processo
            </Link>
            <AlternarVisaoCertificacoes atual="quadro" />
          </div>
        }
      />

      <div className="quadro__filtros">
        <CampoBusca
          valor={filtros.busca ?? ''}
          placeholder="Buscar por processo, processo ou cliente"
          aoMudar={(busca) => alterar('busca', busca)}
        />

        <div className="campo">
          <label htmlFor="quadro-categoria">Categoria</label>
          <select
            id="quadro-categoria"
            value={filtros.categoriaId ?? ''}
            onChange={(evento) =>
              alterar(
                'categoriaId',
                evento.target.value ? Number(evento.target.value) : undefined,
              )
            }
          >
            <option value="">Todas</option>
            {categorias?.map((categoria) => (
              <option key={categoria.id} value={categoria.id}>
                {categoria.nome}
              </option>
            ))}
          </select>
        </div>

        <div className="campo">
          <label htmlFor="quadro-papel">Responsável</label>
          <select
            id="quadro-papel"
            value={filtros.papelResponsavel ?? ''}
            onChange={(evento) =>
              alterar(
                'papelResponsavel',
                (evento.target.value || undefined) as PapelFuncional | undefined,
              )
            }
          >
            <option value="">Todos</option>
            {(Object.keys(ROTULO_PAPEL_FUNCIONAL) as PapelFuncional[]).map(
              (papel) => (
                <option key={papel} value={papel}>
                  {ROTULO_PAPEL_FUNCIONAL[papel]}
                </option>
              ),
            )}
          </select>
        </div>

        <div className="campo">
          <label htmlFor="quadro-semaforo">Situação</label>
          <select
            id="quadro-semaforo"
            value={filtros.semaforo ?? ''}
            onChange={(evento) =>
              alterar(
                'semaforo',
                (evento.target.value || undefined) as SemaforoAging | undefined,
              )
            }
          >
            <option value="">Todas</option>
            {(Object.keys(ROTULO_SEMAFORO) as SemaforoAging[]).map((chave) => (
              <option key={chave} value={chave}>
                {ROTULO_SEMAFORO[chave]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {data && (
        <p className="texto-pequeno texto-fraco quadro__legenda">
          Atenção a partir de {data.limiares.amarelo} dias em aberto, atrasado a
          partir de {data.limiares.vermelho}. O tempo para quando o processo
          conclui.
        </p>
      )}

      {isLoading && <Carregando />}

      {!isLoading && totalGeral === 0 && (
        <EstadoVazio
          icone="caixa-vazia"
          titulo="Nenhum processo no quadro"
          descricao="Nenhum processo ativo casa com os filtros escolhidos."
        />
      )}

      {!isLoading && totalGeral > 0 && (
        <DndContext
          sensors={sensores}
          collisionDetection={closestCorners}
          onDragEnd={aoSoltar}
        >
          <RegiaoRolavel rotulo="Colunas do quadro de processos" className="quadro">
            <div className="quadro__colunas">
              {data?.colunas.map((coluna) => (
                <ColunaQuadroProcessos
                  key={coluna.fase}
                  coluna={coluna}
                  limitePorFase={data.limitePorFase}
                  aoAbrir={setAberto}
                />
              ))}
            </div>
          </RegiaoRolavel>
        </DndContext>
      )}

      <ModalProcesso cartao={aberto} aoFechar={() => setAberto(null)} />
    </>
  );
}

function ColunaQuadroProcessos({
  coluna,
  limitePorFase,
  aoAbrir,
}: {
  coluna: ColunaDoQuadro;
  limitePorFase: number;
  aoAbrir: (cartao: CartaoQuadro) => void;
}) {
  // `total` é a contagem REAL; `cartoes` é o recorte. Quando divergem, o rodapé
  // diz quantos ficaram de fora — um quadro que mostra 50 e diz "50" havendo
  // 300 esconde a fila em vez de mostrá-la.
  const ocultos = coluna.total - coluna.cartoes.length;

  /*
   * Só as FASES recebem soltura. `CONCLUIDO` e `CANCELADO` não são posições no
   * fluxo, são desfechos: concluir exige aprovar etapa com evidência e autoria,
   * cancelar exige motivo. Nenhum dos dois cabe num arrasto, e aceitá-los aqui
   * ofereceria um atalho para pular exatamente as regras que os protegem.
   */
  const aceitaSoltura =
    coluna.fase !== 'CONCLUIDO' && coluna.fase !== 'CANCELADO';

  const { setNodeRef, isOver } = useDroppable({
    id: coluna.fase,
    disabled: !aceitaSoltura,
  });

  return (
    <section
      ref={aceitaSoltura ? setNodeRef : undefined}
      className={`quadro__coluna ${isOver ? 'quadro__coluna--alvo' : ''}`}
      aria-label={`${TITULO_COLUNA[coluna.fase]}: ${coluna.total} processo(s)`}
    >
      <header className="quadro__coluna-cabecalho">
        <h2 className="titulo-bloco">{TITULO_COLUNA[coluna.fase]}</h2>
        <span className="quadro__contagem" aria-hidden>
          {coluna.total}
        </span>
      </header>

      <div className="quadro__pilha">
        {coluna.cartoes.length === 0 && (
          <p className="texto-pequeno texto-fraco quadro__vazio">
            Nenhum processo nesta fase.
          </p>
        )}

        {coluna.cartoes.map((cartao) => (
          <Cartao key={cartao.processoId} cartao={cartao} aoAbrir={aoAbrir} />
        ))}

        {ocultos > 0 && (
          <p className="texto-pequeno texto-fraco quadro__vazio">
            + {ocultos} processo(s) além dos {limitePorFase} exibidos. Use os
            filtros para reduzir a coluna.
          </p>
        )}
      </div>
    </section>
  );
}

/**
 * O cartão ABRE O MODAL do processo; não navega.
 *
 * A operação diária a partir do quadro é marcar checklist, uma sequência curta
 * de cliques. Levar para outra tela a cada cartão e voltar tornaria isso caro.
 * O caminho para a linha do tempo — histórico, evidências, NCs — está dentro
 * do modal, porque ali sair do quadro é o certo.
 *
 * `<button>`, e não `<div onClick>`: precisa ser alcançável por Tab e acionável
 * por Enter/Espaço sem que nada disso seja reimplementado à mão.
 */
function Cartao({
  cartao,
  aoAbrir,
}: {
  cartao: CartaoQuadro;
  aoAbrir: (cartao: CartaoQuadro) => void;
}) {
  /*
   * Arrastável, mas continua sendo um `<button>` que abre o modal ao clicar.
   *
   * O dnd-kit distingue clique de arrasto pela distância mínima configurada no
   * sensor (ver `PointerSensor` na página): sem ela, todo clique viraria um
   * arrasto de zero pixel e o modal nunca abriria.
   *
   * Processo cancelado não se arrasta: ele não está numa fase, e devolvê-lo ao
   * fluxo é a ação "Reabrir", que exige decisão explícita.
   */
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: cartao.processoId,
      data: { cartao },
      disabled: Boolean(cartao.cancelamento),
    });

  return (
    <button
      type="button"
      ref={setNodeRef}
      onClick={() => aoAbrir(cartao)}
      className={`quadro__cartao ${isDragging ? 'quadro__cartao--arrastando' : ''}`}
      aria-label={`Abrir o processo ${cartao.processo}`}
      style={
        transform
          ? {
              transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
              zIndex: 20,
            }
          : undefined
      }
      {...listeners}
      {...attributes}
    >
      <div className="quadro__cartao-topo">
        <span className="quadro__codigo">{cartao.codigoProcesso ?? '—'}</span>
        <MarcaDeSituacao cartao={cartao} />
      </div>

      <h3 className="quadro__processo">{cartao.processo}</h3>
      <p className="quadro__cliente texto-pequeno texto-suave">
        {cartao.cliente.nome}
      </p>

      <div className="quadro__etapa">
        <Icone nome="bussola" />
        <span>{cartao.etapaAtual?.nome ?? 'Sem etapa aberta'}</span>
      </div>

      <Progresso valor={cartao.progresso} />

      <div className="quadro__rodape">
        {cartao.etapaAtual?.papelResponsavel && (
          <span className="badge badge--andamento">
            {ROTULO_PAPEL_FUNCIONAL[cartao.etapaAtual.papelResponsavel]}
          </span>
        )}

        {cartao.motivoProcesso !== 'INICIAL' && (
          <span className="badge badge--pendente">
            {ROTULO_MOTIVO_PROCESSO[cartao.motivoProcesso]}
          </span>
        )}

        {cartao.naoConformidadesAbertas > 0 && (
          <span className="badge badge--reprovado">
            {cartao.naoConformidadesAbertas} NC aberta
            {cartao.naoConformidadesAbertas > 1 ? 's' : ''}
          </span>
        )}
      </div>

      <MarcaDeSla cartao={cartao} />
      <ProgressoChecklist cartao={cartao} />
    </button>
  );
}

/**
 * Progresso do checklist da etapa atual.
 *
 * Só aparece quando a etapa TEM checklist: "0 de 0" não informa nada e
 * sugeriria que falta fazer algo.
 */
function ProgressoChecklist({ cartao }: { cartao: CartaoQuadro }) {
  const { concluidas, total } = cartao.checklist;
  if (total === 0 || cartao.concluido || cartao.cancelamento) return null;

  return (
    <p className="quadro__checklist texto-pequeno">
      <Icone nome="check" />
      Checklist {concluidas}/{total}
    </p>
  );
}

/**
 * Semáforo de aging — ou, em processo concluído, o tempo total que ele levou.
 *
 * São RELÓGIOS DIFERENTES e por isso têm rótulos diferentes. "24 dias em
 * aberto" e "levou 24 dias" respondem a perguntas distintas, e o projeto recusa
 * medida de tempo sem nome próprio (ver as três medidas do relatório de ciclo).
 */
function MarcaDeSituacao({ cartao }: { cartao: CartaoQuadro }) {
  // Cancelado precede tudo: não é um desfecho de prazo, é a ausência de
  // desfecho. Mostrar "Levou N dias" aqui afirmaria uma conclusão que não houve.
  if (cartao.cancelamento) {
    return (
      <span className="quadro__tempo quadro__tempo--cancelado">Cancelado</span>
    );
  }

  if (cartao.concluido) {
    return (
      <span className="quadro__tempo quadro__tempo--concluido">
        Levou {cartao.diasEmAberto} {cartao.diasEmAberto === 1 ? 'dia' : 'dias'}
      </span>
    );
  }

  // Semáforo nunca é a única pista: a cor vem acompanhada do número de dias e
  // de um rótulo em texto, porque `--cor-sucesso` × `--cor-erro` não se separam
  // sob deuteranopia.
  return (
    <span
      className={`quadro__tempo quadro__tempo--${(cartao.semaforo ?? 'VERDE').toLowerCase()}`}
      title={ROTULO_SEMAFORO[cartao.semaforo ?? 'VERDE']}
    >
      {cartao.diasEmAberto}d · {ROTULO_SEMAFORO[cartao.semaforo ?? 'VERDE']}
    </span>
  );
}

/**
 * Prazo da etapa atual, nos TRÊS estados que o backend distingue.
 *
 * `SEM_PRAZO` e `NAO_INICIADA` renderizados como o mesmo "—" fariam
 * desaparecer o segundo, que é justamente um processo parado na fila — o que o
 * quadro existe para mostrar. O `switch` é exaustivo de propósito: estado novo
 * no backend vira erro de type-check, não cartão em branco.
 */
function MarcaDeSla({ cartao }: { cartao: CartaoQuadro }) {
  // Processo encerrado ou interrompido não tem prazo correndo.
  if (cartao.concluido || cartao.cancelamento) return null;

  const sla = cartao.sla;

  switch (sla.situacao) {
    case 'SEM_PRAZO':
      return (
        <p className="quadro__sla texto-pequeno texto-fraco">
          Etapa sem prazo definido
        </p>
      );

    case 'NAO_INICIADA':
      return (
        <p className="quadro__sla quadro__sla--parado texto-pequeno">
          <Icone nome="relogio" />
          Não iniciada · prazo de {formatarPrazoSla(sla.prazoHoras)}
        </p>
      );

    case 'EM_CONTAGEM': {
      const horas = Math.abs(Math.round(sla.horasRestantes));

      return (
        <p
          className={`quadro__sla texto-pequeno ${
            sla.estourado ? 'quadro__sla--estourado' : 'quadro__sla--em-dia'
          }`}
        >
          <Icone nome="relogio" />
          {sla.estourado
            ? `SLA estourado há ${formatarPrazoSla(horas)}`
            : `Faltam ${formatarPrazoSla(horas)} do SLA`}
          {/*
            A data ABSOLUTA ao lado da contagem regressiva. "Faltam 70h" não
            responde "cai em que dia?", que é a pergunta de quem monta a agenda
            da semana — e é como a operação lia o prazo no quadro anterior.
            O dado já vinha do servidor; faltava mostrá-lo.
          */}
          <span className="texto-fraco quadro__sla-data">
            · vence {formatarDataHora(sla.limiteEm)}
          </span>
        </p>
      );
    }
  }
}
