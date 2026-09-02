import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { CabecalhoPagina } from '@/components/CabecalhoPagina';
import { Carregando } from '@/components/Carregando';
import { EstadoVazio } from '@/components/EstadoVazio';
import { Icone } from '@/components/Icone';
import { ModalConfirmacao } from '@/components/ModalConfirmacao';
import { TabelaRolavel } from '@/components/TabelaRolavel';
import { mensagemDeErro } from '@/lib/api';
import { formatarData } from '@/lib/formatadores';
import { chaves } from '@/lib/queryClient';
import type { EtapaModeloEntrada, ModeloEtapa, ModeloTrilha } from '@/types';
import { modelosTrilhaApi, trilhasApi } from './api';
import { ModalEtapaModelo } from './ModalEtapaModelo';
import { ROTULO_TIPO_ETAPA } from './rotulos';

function LinhaEtapa({
  etapa,
  editavel,
  aoEditar,
  aoRemover,
}: {
  etapa: ModeloEtapa;
  editavel: boolean;
  aoEditar: (etapa: ModeloEtapa) => void;
  aoRemover: (etapa: ModeloEtapa) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    // Diz ao dnd-kit qual elemento é a alça. Sem isso ele continua arrastando
    // pelo ponteiro, mas as instruções de teclado ficam penduradas no <tr>, que
    // não é focável — a reordenação por teclado nunca chegaria a ser anunciada.
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: etapa.id, disabled: !editavel });

  return (
    /*
     * `attributes` e `listeners` do dnd-kit ficam na alça, não na linha.
     *
     * Espalhados no <tr> — como estavam — eles sobrescreviam o papel da linha
     * com `role="button"`: o leitor de tela anunciava a linha inteira como um
     * botão e a estrutura da tabela desaparecia, junto com a associação entre
     * cada célula e seu cabeçalho. De quebra, a linha toda virava área de
     * arraste, o que impedia selecionar o texto da etapa e obrigava cada botão
     * de ação a abafar o `onPointerDown` para continuar clicável.
     */
    <tr
      role="row"
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.55 : 1,
      }}
    >
      <td role="cell" className="tabela__celula-inicial" style={{ width: 52 }}>
        {editavel && (
          <button
            type="button"
            className="tabela__alca arrastavel"
            aria-label={`Reordenar a etapa ${etapa.nome}`}
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
          >
            <Icone nome="arrastar" tamanho={18} />
          </button>
        )}
      </td>
      <td
        role="cell"
        className="tabela__celula-inicial"
        style={{ width: 64, fontWeight: 700 }}
      >
        {etapa.ordem}
      </td>
      <td role="cell" data-principal>
        <div style={{ fontWeight: 600 }}>{etapa.nome}</div>
        {etapa.descricao && (
          <div className="texto-pequeno texto-fraco">{etapa.descricao}</div>
        )}
      </td>
      <td role="cell" data-rotulo="Tipo" className="texto-suave sem-quebra">
        {ROTULO_TIPO_ETAPA[etapa.tipo] ?? etapa.tipo}
      </td>
      <td role="cell" data-rotulo="Prazo" className="texto-suave sem-quebra">
        {etapa.prazoSlaDias ? `${etapa.prazoSlaDias} dia(s)` : '—'}
      </td>
      <td role="cell" data-rotulo="Regras">
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {etapa.obrigatoria && (
            <span className="badge badge--andamento">obrigatória</span>
          )}
          {etapa.exigeDocumento && (
            <span className="badge badge--pendente">documento</span>
          )}
        </div>
      </td>
      <td role="cell" className="tabela__celula-acoes">
        {editavel && (
          <div className="tabela__acoes">
            <button
              type="button"
              className="btn btn--icone"
              title="Editar"
              aria-label={`Editar a etapa ${etapa.nome}`}
              onClick={() => aoEditar(etapa)}
            >
              <Icone nome="lapis" />
            </button>
            <button
              type="button"
              className="btn btn--icone"
              title="Remover"
              aria-label={`Remover a etapa ${etapa.nome}`}
              onClick={() => aoRemover(etapa)}
            >
              <Icone nome="lixeira" />
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}

export function TrilhaDetalhePage() {
  const { id } = useParams();
  const trilhaId = Number(id);
  const queryClient = useQueryClient();

  const [versaoSelecionada, setVersaoSelecionada] = useState<number | null>(null);
  const [etapas, setEtapas] = useState<ModeloEtapa[]>([]);
  const [modalEtapa, setModalEtapa] = useState(false);
  const [etapaEmEdicao, setEtapaEmEdicao] = useState<ModeloEtapa | null>(null);
  const [etapaARemover, setEtapaARemover] = useState<ModeloEtapa | null>(null);
  const [confirmarVersao, setConfirmarVersao] = useState(false);
  const [versaoAPromover, setVersaoAPromover] = useState<ModeloTrilha | null>(null);
  const [versaoARemover, setVersaoARemover] = useState<ModeloTrilha | null>(null);

  const trilha = useQuery({
    queryKey: chaves.trilha(trilhaId),
    queryFn: () => trilhasApi.buscarPorId(trilhaId),
    enabled: Number.isFinite(trilhaId),
  });

  const versoes = useQuery({
    queryKey: chaves.modelosTrilha(trilhaId),
    queryFn: () => modelosTrilhaApi.listarPorTrilha(trilhaId),
    enabled: Number.isFinite(trilhaId),
  });

  const modelo: ModeloTrilha | undefined =
    versoes.data?.find((versao) => versao.id === versaoSelecionada) ??
    versoes.data?.find((versao) => versao.ativo) ??
    versoes.data?.[0];

  useEffect(() => {
    if (modelo) setEtapas(modelo.etapas);
  }, [modelo]);

  const sensores = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function invalidar() {
    void queryClient.invalidateQueries({ queryKey: ['trilhas'] });
    // A categoria exibe "vX · N etapas" da trilha que segue: mexer na trilha
    // muda o que a tela de categorias mostra.
    void queryClient.invalidateQueries({ queryKey: ['categorias'] });
  }

  const reordenar = useMutation({
    mutationFn: (ordem: number[]) =>
      modelosTrilhaApi.reordenarEtapas(modelo!.id, ordem),
    onSuccess: () => {
      toast.success('Ordem das etapas atualizada.');
      invalidar();
    },
    onError: (erro) => {
      toast.error(mensagemDeErro(erro, 'Não foi possível salvar a nova ordem.'));
      if (modelo) setEtapas(modelo.etapas);
    },
  });

  /** A API troca a lista inteira: edição, inclusão e remoção passam por aqui. */
  const salvarEtapas = useMutation({
    mutationFn: (lista: EtapaModeloEntrada[]) =>
      modelosTrilhaApi.substituirEtapas(modelo!.id, lista),
    onSuccess: () => {
      toast.success('Trilha atualizada.');
      invalidar();
      setEtapaARemover(null);
    },
    onError: (erro) => toast.error(mensagemDeErro(erro)),
  });

  /**
   * Cria uma versão da trilha.
   *
   * Sem `etapas`, a API copia as da versão vigente. Isso não serve para a
   * PRIMEIRA versão: não há de onde copiar, e o servidor recusa com "informe as
   * etapas da nova versão". Por isso a tela distingue os dois casos — chamar
   * sempre sem etapas deixava a trilha recém-criada sem versão para sempre, e
   * sem versão nenhuma categoria consegue usá-la.
   */
  const criarVersao = useMutation({
    mutationFn: (etapasIniciais?: EtapaModeloEntrada[]) =>
      modelosTrilhaApi.criarVersao(trilhaId, etapasIniciais),
    onSuccess: (nova) => {
      toast.success(
        nova.versao === 1
          ? 'Versão 1 criada. Acrescente as demais etapas do processo.'
          : `Versão ${nova.versao} criada a partir da vigente.`,
      );
      setVersaoSelecionada(nova.id);
      setConfirmarVersao(false);
      setModalEtapa(false);
      invalidar();
    },
    onError: (erro) => toast.error(mensagemDeErro(erro)),
  });

  const promoverVersao = useMutation({
    mutationFn: (modeloId: number) => modelosTrilhaApi.definirVigente(modeloId),
    onSuccess: (promovida) => {
      toast.success(`A versão ${promovida.versao} passou a ser a vigente.`);
      setVersaoAPromover(null);
      invalidar();
    },
    onError: (erro) => toast.error(mensagemDeErro(erro)),
  });

  const removerVersao = useMutation({
    mutationFn: (modeloId: number) => modelosTrilhaApi.removerVersao(modeloId),
    onSuccess: (resposta) => {
      toast.success(resposta.mensagem);
      // A excluída pode ser a que estava selecionada: voltar ao padrão evita
      // a tela ficar apontando para um id que não existe mais.
      setVersaoSelecionada(null);
      setVersaoARemover(null);
      invalidar();
    },
    onError: (erro) => toast.error(mensagemDeErro(erro)),
  });

  /** Nenhuma versão ainda: o botão cria a v1, não uma "nova versão". */
  const semVersao = !versoes.isLoading && (versoes.data?.length ?? 0) === 0;

  function paraEntrada(lista: ModeloEtapa[]): EtapaModeloEntrada[] {
    return lista.map((etapa) => ({
      nome: etapa.nome,
      descricao: etapa.descricao ?? undefined,
      tipo: etapa.tipo,
      obrigatoria: etapa.obrigatoria,
      prazoSlaDias: etapa.prazoSlaDias ?? undefined,
      exigeDocumento: etapa.exigeDocumento,
    }));
  }

  function aoSoltar(evento: DragEndEvent) {
    const { active, over } = evento;
    if (!over || active.id === over.id || !modelo) return;

    const de = etapas.findIndex((etapa) => etapa.id === active.id);
    const para = etapas.findIndex((etapa) => etapa.id === over.id);
    const nova = arrayMove(etapas, de, para);

    setEtapas(nova.map((etapa, indice) => ({ ...etapa, ordem: indice + 1 })));
    reordenar.mutate(nova.map((etapa) => etapa.id));
  }

  if (trilha.isLoading || versoes.isLoading) return <Carregando />;

  if (trilha.isError || !trilha.data) {
    return (
      <EstadoVazio
        icone="bussola"
        titulo="Trilha não encontrada"
        acao={
          <Link to="/trilhas" className="btn btn--primario">
            Voltar
          </Link>
        }
      />
    );
  }

  const editavel = Boolean(modelo?.editavel);
  const categorias = trilha.data.categorias;

  return (
    <>
      <CabecalhoPagina
        titulo={trilha.data.nome}
        descricao={
          trilha.data.descricao ?? 'Processo de avaliação, versionado e imutável em uso.'
        }
        acoes={
          <>
            <Link to="/trilhas" className="btn">
              <Icone nome="seta-esquerda" tamanho={16} />
              Trilhas
            </Link>
            <button
              type="button"
              className="btn btn--primario"
              onClick={() => {
                // Sem versão anterior o modal de confirmação não tem o que
                // confirmar — o que falta é a primeira etapa.
                if (semVersao) {
                  setEtapaEmEdicao(null);
                  setModalEtapa(true);
                } else {
                  setConfirmarVersao(true);
                }
              }}
            >
              {semVersao ? '+ Criar versão 1' : '+ Nova versão'}
            </button>
          </>
        }
      />

      <section className="vidro" style={{ marginBottom: 16 }}>
        <div className="entre" style={{ paddingBottom: 12 }}>
          <div>
            <h3 className="titulo-bloco" style={{ margin: 0 }}>
              Categorias que seguem esta trilha
            </h3>
            <p className="texto-pequeno texto-fraco" style={{ margin: '4px 0 0' }}>
              {categorias.length === 0
                ? 'Nenhuma ainda. O vínculo é feito na tela da categoria.'
                : 'Produto novo nestas categorias entra pela versão vigente abaixo.'}
            </p>
          </div>
        </div>
        {categorias.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {categorias.map((categoria) => (
              <Link
                key={categoria.id}
                to={`/categorias/${categoria.id}`}
                className="badge badge--andamento sem-quebra"
              >
                <Icone nome="elo" tamanho={14} />
                {categoria.nome}
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="vidro" style={{ marginBottom: 16 }}>
        <TabelaRolavel rotulo="Versões da trilha">
          <table className="tabela" role="table">
            <thead role="rowgroup">
              <tr role="row">
                <th role="columnheader">Versão</th>
                <th role="columnheader">Vigência</th>
                <th role="columnheader">Etapas</th>
                <th role="columnheader">Produtos</th>
                <th role="columnheader">Situação</th>
                <th role="columnheader" className="texto-direita">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody role="rowgroup">
              {versoes.data?.map((versao) => (
                <tr
                  role="row"
                  key={versao.id}
                  onClick={() => setVersaoSelecionada(versao.id)}
                  style={{
                    cursor: 'pointer',
                    outline:
                      versao.id === modelo?.id
                        ? '1px solid var(--cor-primaria)'
                        : undefined,
                  }}
                >
                  <td role="cell" data-principal style={{ fontWeight: 700 }}>
                    v{versao.versao}
                  </td>
                  <td
                    role="cell"
                    data-rotulo="Vigência"
                    className="texto-suave sem-quebra"
                  >
                    {formatarData(versao.vigenteDe)}
                    {versao.vigenteAte ? ` → ${formatarData(versao.vigenteAte)}` : ''}
                  </td>
                  <td role="cell" data-rotulo="Etapas" className="texto-suave">
                    {versao.etapas.length}
                  </td>
                  <td role="cell" data-rotulo="Produtos" className="texto-suave">
                    {versao.totalProdutos}
                  </td>
                  <td role="cell" data-rotulo="Situação">
                    <span
                      className={`badge ${versao.ativo ? 'badge--aprovado' : 'badge--pendente'}`}
                    >
                      {versao.ativo ? 'Vigente' : 'Encerrada'}
                    </span>
                  </td>
                  <td role="cell" className="tabela__celula-acoes">
                    <div className="tabela__acoes">
                      {!versao.ativo && versao.etapas.length > 0 && (
                        <button
                          type="button"
                          className="btn btn--icone"
                          title="Tornar vigente"
                          aria-label={`Tornar a versão ${versao.versao} a vigente`}
                          onClick={(evento) => {
                            evento.stopPropagation();
                            setVersaoAPromover(versao);
                          }}
                        >
                          <Icone nome="reciclar" />
                        </button>
                      )}
                      {versao.totalProdutos === 0 && (
                        <button
                          type="button"
                          className="btn btn--icone"
                          title="Excluir versão"
                          aria-label={`Excluir a versão ${versao.versao}`}
                          onClick={(evento) => {
                            evento.stopPropagation();
                            setVersaoARemover(versao);
                          }}
                        >
                          <Icone nome="lixeira" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TabelaRolavel>
      </section>

      <section className="vidro">
        <div className="entre" style={{ padding: '4px 4px 12px' }}>
          <div>
            <h3 style={{ margin: 0 }}>
              {semVersao
                ? 'Etapas da trilha'
                : `Etapas da versão ${modelo?.versao ?? '—'}`}
            </h3>
            <p className="texto-pequeno texto-fraco" style={{ margin: '4px 0 0' }}>
              {/* Sem versão, a mensagem de imutabilidade dizia "já está em uso
                  por 0 produto(s)" — descrevia uma versão que não existe. */}
              {semVersao
                ? 'Esta trilha ainda não tem versão. Crie a primeira para poder vinculá-la a uma categoria.'
                : editavel
                  ? 'Arraste para reordenar. A ordem é salva automaticamente.'
                  : `Esta versão já está em uso por ${modelo?.totalProdutos ?? 0} produto(s) e não pode ser alterada — crie uma nova versão para mudar o processo.`}
            </p>
          </div>
          {editavel && (
            <button
              type="button"
              className="btn"
              onClick={() => {
                setEtapaEmEdicao(null);
                setModalEtapa(true);
              }}
            >
              + Etapa
            </button>
          )}
        </div>

        {etapas.length === 0 ? (
          <EstadoVazio
            icone="peca"
            titulo={semVersao ? 'Nenhuma versão definida' : 'Nenhuma etapa nesta versão'}
            descricao="Sem etapas, a trilha não pode ser vinculada a uma categoria."
            acao={
              editavel || semVersao ? (
                <button
                  type="button"
                  className="btn btn--primario"
                  onClick={() => {
                    setEtapaEmEdicao(null);
                    setModalEtapa(true);
                  }}
                >
                  {semVersao ? 'Criar versão 1' : 'Adicionar etapa'}
                </button>
              ) : undefined
            }
          />
        ) : (
          <TabelaRolavel rotulo="Etapas da versão">
            <DndContext
              sensors={sensores}
              collisionDetection={closestCenter}
              modifiers={[restrictToVerticalAxis]}
              onDragEnd={aoSoltar}
            >
              <table className="tabela" role="table">
                <thead role="rowgroup">
                  <tr role="row">
                    <th role="columnheader" />
                    <th role="columnheader">Ordem</th>
                    <th role="columnheader">Etapa</th>
                    <th role="columnheader">Tipo</th>
                    <th role="columnheader">Prazo</th>
                    <th role="columnheader">Regras</th>
                    <th role="columnheader" className="texto-direita">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody role="rowgroup">
                  <SortableContext
                    items={etapas.map((etapa) => etapa.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {etapas.map((etapa) => (
                      <LinhaEtapa
                        key={etapa.id}
                        etapa={etapa}
                        editavel={editavel}
                        aoEditar={(selecionada) => {
                          setEtapaEmEdicao(selecionada);
                          setModalEtapa(true);
                        }}
                        aoRemover={setEtapaARemover}
                      />
                    ))}
                  </SortableContext>
                </tbody>
              </table>
            </DndContext>
          </TabelaRolavel>
        )}
      </section>

      <ModalEtapaModelo
        aberto={modalEtapa}
        etapa={etapaEmEdicao}
        salvando={salvarEtapas.isPending || criarVersao.isPending}
        aoFechar={() => {
          setModalEtapa(false);
          setEtapaEmEdicao(null);
        }}
        aoSalvar={(dados) => {
          // Primeira versão da trilha: não há versão para substituir as etapas,
          // então a própria criação da versão leva a etapa inicial.
          if (semVersao) {
            criarVersao.mutate([dados]);
            return;
          }

          const lista = paraEntrada(etapas);
          if (etapaEmEdicao) {
            const indice = etapas.findIndex((e) => e.id === etapaEmEdicao.id);
            lista[indice] = dados;
          } else {
            lista.push(dados);
          }
          salvarEtapas.mutate(lista, {
            onSuccess: () => {
              setModalEtapa(false);
              setEtapaEmEdicao(null);
            },
          });
        }}
      />

      <ModalConfirmacao
        aberto={Boolean(etapaARemover)}
        titulo="Remover etapa"
        mensagem={`Remover "${etapaARemover?.nome}" desta versão da trilha?`}
        rotuloConfirmar="Remover"
        perigo
        carregando={salvarEtapas.isPending}
        aoCancelar={() => setEtapaARemover(null)}
        aoConfirmar={() =>
          salvarEtapas.mutate(
            paraEntrada(etapas.filter((etapa) => etapa.id !== etapaARemover?.id)),
          )
        }
      />

      <ModalConfirmacao
        aberto={confirmarVersao}
        titulo="Criar nova versão da trilha"
        mensagem={
          `A versão ${modelo?.versao ?? 1} será encerrada e uma nova entra em vigor, ` +
          'copiando as etapas atuais como ponto de partida. Produtos já submetidos ' +
          'continuam na versão em que entraram.'
        }
        rotuloConfirmar="Criar versão"
        carregando={criarVersao.isPending}
        aoCancelar={() => setConfirmarVersao(false)}
        aoConfirmar={() => criarVersao.mutate(undefined)}
      />

      <ModalConfirmacao
        aberto={Boolean(versaoAPromover)}
        titulo="Tornar esta a versão vigente"
        mensagem={
          `A versão ${versaoAPromover?.versao} volta a vigorar e a atual é encerrada. ` +
          `Vale para produtos NOVOS de ${categorias.length} categoria(s): os que já estão ` +
          'em avaliação seguem na versão pela qual entraram.'
        }
        rotuloConfirmar="Tornar vigente"
        carregando={promoverVersao.isPending}
        aoCancelar={() => setVersaoAPromover(null)}
        aoConfirmar={() =>
          versaoAPromover && promoverVersao.mutate(versaoAPromover.id)
        }
      />

      <ModalConfirmacao
        aberto={Boolean(versaoARemover)}
        titulo="Excluir versão"
        mensagem={
          `Excluir a versão ${versaoARemover?.versao} e suas etapas definitivamente? ` +
          (versaoARemover?.ativo
            ? 'Ela é a vigente — a versão anterior volta a vigorar no lugar dela.'
            : 'Ela já está encerrada e nenhum produto a utiliza.')
        }
        rotuloConfirmar="Excluir"
        perigo
        carregando={removerVersao.isPending}
        aoCancelar={() => setVersaoARemover(null)}
        aoConfirmar={() => versaoARemover && removerVersao.mutate(versaoARemover.id)}
      />
    </>
  );
}
