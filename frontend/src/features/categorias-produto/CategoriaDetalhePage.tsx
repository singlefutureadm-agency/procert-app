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
import { ModalConfirmacao } from '@/components/ModalConfirmacao';
import { mensagemDeErro } from '@/lib/api';
import { formatarData } from '@/lib/formatadores';
import { chaves } from '@/lib/queryClient';
import type { EtapaModeloEntrada, ModeloEtapa, ModeloTrilha } from '@/types';
import { categoriasApi, modelosTrilhaApi } from './api';
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
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: etapa.id, disabled: !editavel });

  return (
    <tr
      ref={setNodeRef}
      className={editavel ? 'arrastavel' : undefined}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.55 : 1,
      }}
      {...attributes}
      {...listeners}
    >
      <td style={{ width: 52, textAlign: 'center' }} aria-hidden>
        {editavel ? '⠿' : ''}
      </td>
      <td style={{ width: 64, fontWeight: 700 }}>{etapa.ordem}</td>
      <td>
        <div style={{ fontWeight: 600 }}>{etapa.nome}</div>
        {etapa.descricao && (
          <div className="texto-pequeno texto-fraco">{etapa.descricao}</div>
        )}
      </td>
      <td className="texto-suave sem-quebra">
        {ROTULO_TIPO_ETAPA[etapa.tipo] ?? etapa.tipo}
      </td>
      <td className="texto-suave sem-quebra">
        {etapa.prazoSlaDias ? `${etapa.prazoSlaDias} dia(s)` : '—'}
      </td>
      <td>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {etapa.obrigatoria && <span className="badge badge--andamento">obrigatória</span>}
          {etapa.exigeDocumento && <span className="badge badge--pendente">documento</span>}
        </div>
      </td>
      <td>
        {editavel && (
          <div className="tabela__acoes">
            <button
              type="button"
              className="btn btn--icone"
              title="Editar etapa"
              onPointerDown={(evento) => evento.stopPropagation()}
              onClick={() => aoEditar(etapa)}
            >
              ✏️
            </button>
            <button
              type="button"
              className="btn btn--icone"
              title="Remover etapa"
              onPointerDown={(evento) => evento.stopPropagation()}
              onClick={() => aoRemover(etapa)}
            >
              🗑️
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}

export function CategoriaDetalhePage() {
  const { id } = useParams();
  const categoriaId = Number(id);
  const queryClient = useQueryClient();

  const [versaoSelecionada, setVersaoSelecionada] = useState<number | null>(null);
  const [etapas, setEtapas] = useState<ModeloEtapa[]>([]);
  const [modalEtapa, setModalEtapa] = useState(false);
  const [etapaEmEdicao, setEtapaEmEdicao] = useState<ModeloEtapa | null>(null);
  const [etapaARemover, setEtapaARemover] = useState<ModeloEtapa | null>(null);
  const [confirmarVersao, setConfirmarVersao] = useState(false);

  const categoria = useQuery({
    queryKey: chaves.categoria(categoriaId),
    queryFn: () => categoriasApi.buscarPorId(categoriaId),
    enabled: Number.isFinite(categoriaId),
  });

  const versoes = useQuery({
    queryKey: chaves.modelosTrilha(categoriaId),
    queryFn: () => modelosTrilhaApi.listarPorCategoria(categoriaId),
    enabled: Number.isFinite(categoriaId),
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

  const criarVersao = useMutation({
    mutationFn: () => modelosTrilhaApi.criarVersao(categoriaId),
    onSuccess: (nova) => {
      toast.success(`Versão ${nova.versao} criada a partir da vigente.`);
      setVersaoSelecionada(nova.id);
      setConfirmarVersao(false);
      invalidar();
    },
    onError: (erro) => toast.error(mensagemDeErro(erro)),
  });

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

  if (categoria.isLoading || versoes.isLoading) return <Carregando />;

  if (categoria.isError || !categoria.data) {
    return (
      <EstadoVazio
        icone="🗂️"
        titulo="Categoria não encontrada"
        acao={
          <Link to="/categorias" className="btn btn--primario">
            Voltar
          </Link>
        }
      />
    );
  }

  const editavel = Boolean(modelo?.editavel);

  return (
    <>
      <CabecalhoPagina
        titulo={categoria.data.nome}
        descricao={
          categoria.data.normaReferencia
            ? `Norma de referência: ${categoria.data.normaReferencia}`
            : 'Trilha de certificação desta categoria.'
        }
        acoes={
          <>
            <Link to="/categorias" className="btn">
              ← Categorias
            </Link>
            <button
              type="button"
              className="btn btn--primario"
              onClick={() => setConfirmarVersao(true)}
            >
              + Nova versão
            </button>
          </>
        }
      />

      <section className="vidro" style={{ marginBottom: 16 }}>
        <div className="tabela-wrapper">
          <table className="tabela">
            <thead>
              <tr>
                <th>Versão</th>
                <th>Vigência</th>
                <th>Etapas</th>
                <th>Produtos</th>
                <th>Situação</th>
              </tr>
            </thead>
            <tbody>
              {versoes.data?.map((versao) => (
                <tr
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
                  <td style={{ fontWeight: 700 }}>v{versao.versao}</td>
                  <td className="texto-suave sem-quebra">
                    {formatarData(versao.vigenteDe)}
                    {versao.vigenteAte ? ` → ${formatarData(versao.vigenteAte)}` : ''}
                  </td>
                  <td className="texto-suave">{versao.etapas.length}</td>
                  <td className="texto-suave">{versao.totalProdutos}</td>
                  <td>
                    <span
                      className={`badge ${versao.ativo ? 'badge--aprovado' : 'badge--pendente'}`}
                    >
                      {versao.ativo ? 'Vigente' : 'Encerrada'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="vidro">
        <div className="entre" style={{ padding: '4px 4px 12px' }}>
          <div>
            <h3 style={{ margin: 0 }}>Etapas da versão {modelo?.versao ?? '—'}</h3>
            <p className="texto-pequeno texto-fraco" style={{ margin: '4px 0 0' }}>
              {editavel
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
            icone="🧩"
            titulo="Nenhuma etapa nesta versão"
            descricao="Sem etapas, a categoria não aceita produtos."
            acao={
              editavel ? (
                <button
                  type="button"
                  className="btn btn--primario"
                  onClick={() => setModalEtapa(true)}
                >
                  Adicionar etapa
                </button>
              ) : undefined
            }
          />
        ) : (
          <div className="tabela-wrapper">
            <DndContext
              sensors={sensores}
              collisionDetection={closestCenter}
              modifiers={[restrictToVerticalAxis]}
              onDragEnd={aoSoltar}
            >
              <table className="tabela">
                <thead>
                  <tr>
                    <th />
                    <th>Ordem</th>
                    <th>Etapa</th>
                    <th>Tipo</th>
                    <th>Prazo</th>
                    <th>Regras</th>
                    <th className="texto-direita">Ações</th>
                  </tr>
                </thead>
                <tbody>
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
          </div>
        )}
      </section>

      <ModalEtapaModelo
        aberto={modalEtapa}
        etapa={etapaEmEdicao}
        salvando={salvarEtapas.isPending}
        aoFechar={() => {
          setModalEtapa(false);
          setEtapaEmEdicao(null);
        }}
        aoSalvar={(dados) => {
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
        aoConfirmar={() => criarVersao.mutate()}
      />
    </>
  );
}
