import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { useAuth } from '@/auth/useAuth';
import { BadgeCertificacao } from '@/components/Badge';
import { CabecalhoPagina } from '@/components/CabecalhoPagina';
import { Carregando } from '@/components/Carregando';
import { EstadoVazio } from '@/components/EstadoVazio';
import { Icone, type NomeIcone } from '@/components/Icone';
import { ModalConfirmacao } from '@/components/ModalConfirmacao';
import { Progresso } from '@/components/Progresso';
import { mensagemDeErro, urlArquivo } from '@/lib/api';
import {
  formatarDataHora,
  rotuloStatusCertificacao,
  STATUS_CERTIFICACAO,
} from '@/lib/formatadores';
import { chaves } from '@/lib/queryClient';
import { PainelCertificadoProduto } from '@/features/certificados/PainelCertificadoProduto';
import { naoConformidadesApi } from '@/features/nao-conformidades/api';
import { CartaoNaoConformidade } from '@/features/nao-conformidades/CartaoNaoConformidade';
import type {
  AberturaNaoConformidade,
  CriticidadeNaoConformidade,
  EtapaTimeline,
  StatusCertificacao,
} from '@/types';
import { certificacoesApi, type EtapaAlteracao } from './api';
import { DocumentosEtapa } from './DocumentosEtapa';

const CLASSE_ETAPA: Record<StatusCertificacao, string> = {
  PENDENTE: 'etapa--pendente',
  EM_ANDAMENTO: 'etapa--andamento',
  APROVADO: 'etapa--aprovado',
  REPROVADO: 'etapa--reprovado',
};

const ICONE_ETAPA: Record<StatusCertificacao, NomeIcone> = {
  PENDENTE: 'ampulheta',
  EM_ANDAMENTO: 'atualizar',
  APROVADO: 'check',
  REPROVADO: 'x',
};

type Rascunho = Record<number, { status: StatusCertificacao; observacao: string }>;

/** NCs digitadas mas ainda não enviadas, por linha de certificação. */
type RascunhoNc = Record<number, AberturaNaoConformidade | undefined>;

/**
 * Campos da NC exibidos quando a etapa é marcada como reprovada.
 * Fica embutido no card da etapa porque a NC é enviada junto do lote — não há
 * "salvar NC" separado enquanto a reprovação não foi confirmada.
 */
function FormularioNaoConformidade({
  valor,
  aoMudar,
}: {
  valor?: AberturaNaoConformidade;
  aoMudar: (dados: AberturaNaoConformidade | undefined) => void;
}) {
  const atual: AberturaNaoConformidade = valor ?? {
    descricao: '',
    criticidade: 'MENOR',
  };

  return (
    <div className="nc-formulario">
      <span className="texto-pequeno texto-fraco">
        Registrar não conformidade (opcional)
      </span>

      <textarea
        rows={3}
        value={atual.descricao}
        placeholder="O que foi encontrado de não conforme"
        onChange={(evento) => {
          const descricao = evento.target.value;
          // Campo esvaziado significa "não abrir NC".
          aoMudar(descricao.trim() ? { ...atual, descricao } : undefined);
        }}
      />

      <div className="nc-formulario__linha">
        <select
          value={atual.criticidade}
          aria-label="Criticidade"
          onChange={(evento) =>
            aoMudar({
              ...atual,
              criticidade: evento.target.value as CriticidadeNaoConformidade,
            })
          }
        >
          <option value="MENOR">Menor</option>
          <option value="MAIOR">Maior</option>
        </select>

        <input
          type="date"
          aria-label="Prazo de resposta"
          value={atual.prazoResposta ?? ''}
          onChange={(evento) =>
            aoMudar({ ...atual, prazoResposta: evento.target.value || undefined })
          }
        />
      </div>
    </div>
  );
}

function montarRascunho(etapas: EtapaTimeline[]): Rascunho {
  return Object.fromEntries(
    etapas.map((etapa) => [
      etapa.id,
      { status: etapa.status, observacao: etapa.observacao ?? '' },
    ]),
  );
}

export function CertificacaoDetalhePage() {
  const { produtoId } = useParams();
  const id = Number(produtoId);
  const { temPapel } = useAuth();
  const podeEditar = temPapel('ADMIN', 'FUNCIONARIO');
  const queryClient = useQueryClient();

  const [rascunho, setRascunho] = useState<Rascunho>({});
  const [ncsNovas, setNcsNovas] = useState<RascunhoNc>({});
  const [confirmarMigracao, setConfirmarMigracao] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: chaves.certificacao(id),
    queryFn: () => certificacoesApi.porProduto(id),
    enabled: Number.isFinite(id),
  });

  useEffect(() => {
    if (data) setRascunho(montarRascunho(data.etapas));
  }, [data]);

  const salvar = useMutation({
    mutationFn: (alteracoes: EtapaAlteracao[]) =>
      certificacoesApi.salvar(id, alteracoes),
    onSuccess: (atualizado) => {
      queryClient.setQueryData(chaves.certificacao(id), atualizado);
      void queryClient.invalidateQueries({ queryKey: ['certificacoes'] });
      void queryClient.invalidateQueries({ queryKey: ['produtos'] });
      void queryClient.invalidateQueries({ queryKey: ['nao-conformidades'] });
      void queryClient.invalidateQueries({ queryKey: chaves.dashboard });
      setNcsNovas({});
      toast.success('Certificação atualizada e histórico registrado.');
    },
    onError: (erro) => toast.error(mensagemDeErro(erro)),
  });

  const avaliarNc = useMutation({
    mutationFn: ({
      id: ncId,
      status,
    }: {
      id: number;
      status: 'RESOLVIDA' | 'REPROVADA';
    }) => naoConformidadesApi.avaliar(ncId, status),
    onSuccess: (_, variaveis) => {
      toast.success(
        variaveis.status === 'RESOLVIDA'
          ? 'Não conformidade resolvida — etapa reaberta para reavaliação.'
          : 'Não conformidade encerrada como reprovada.',
      );
      void queryClient.invalidateQueries({ queryKey: ['certificacoes'] });
      void queryClient.invalidateQueries({ queryKey: ['nao-conformidades'] });
    },
    onError: (erro) => toast.error(mensagemDeErro(erro)),
  });

  // Consulta silenciosa: se a categoria publicou uma versão nova da trilha
  // depois da submissão, o aviso aparece — mas migrar exige confirmação.
  const { data: versao } = useQuery({
    queryKey: chaves.versaoTrilha(id),
    queryFn: () => certificacoesApi.verificarVersao(id),
    enabled: podeEditar,
  });

  const migrarVersao = useMutation({
    mutationFn: () => certificacoesApi.migrarVersao(id),
    onSuccess: (resultado) => {
      toast.success(resultado.mensagem);
      setConfirmarMigracao(false);
      void queryClient.invalidateQueries({ queryKey: ['certificacoes'] });
      void queryClient.invalidateQueries({ queryKey: ['produtos'] });
    },
    onError: (erro) => toast.error(mensagemDeErro(erro)),
  });

  /** Progresso recalculado ao vivo, antes mesmo de salvar. */
  const progressoLocal = useMemo(() => {
    const valores = Object.values(rascunho);
    if (valores.length === 0) return 0;

    const aprovadas = valores.filter((item) => item.status === 'APROVADO').length;
    return Math.round((aprovadas / valores.length) * 100);
  }, [rascunho]);

  const alteracoes = useMemo(() => {
    if (!data) return [];

    return data.etapas
      .filter((etapa) => {
        const atual = rascunho[etapa.id];
        if (!atual) return false;
        return (
          atual.status !== etapa.status ||
          atual.observacao !== (etapa.observacao ?? '')
        );
      })
      .map<EtapaAlteracao>((etapa) => ({
        id: etapa.id,
        status: rascunho[etapa.id].status,
        observacao: rascunho[etapa.id].observacao || undefined,
        // A NC só acompanha a etapa quando ela de fato vai como reprovada.
        naoConformidade:
          rascunho[etapa.id].status === 'REPROVADO' && ncsNovas[etapa.id]?.descricao
            ? ncsNovas[etapa.id]
            : undefined,
      }));
  }, [data, rascunho, ncsNovas]);

  if (isLoading) return <Carregando mensagem="Carregando certificação..." />;

  if (isError || !data) {
    return (
      <EstadoVazio
        icone="alerta"
        titulo="Certificação não encontrada"
        descricao="O produto pode ter sido removido ou você não tem acesso a ele."
        acao={
          <Link to="/certificacoes" className="btn btn--primario">
            Voltar ao acompanhamento
          </Link>
        }
      />
    );
  }

  return (
    <>
      <CabecalhoPagina
        titulo={data.produto.nome}
        descricao={`Cliente: ${data.cliente.nome} · ${data.resumo.etapasAprovadas} de ${data.resumo.totalEtapas} etapas aprovadas`}
        acoes={
          <>
            <Link to="/certificacoes" className="btn">
              <Icone nome="seta-esquerda" tamanho={16} />
              Voltar
            </Link>
            {podeEditar && versao && !versao.atualizado && (
              <button
                type="button"
                className="btn"
                onClick={() => setConfirmarMigracao(true)}
                title={versao.mensagem}
              >
                <Icone nome="atualizar" tamanho={16} />
                Atualizar trilha (v{versao.versaoProduto} → v{versao.versaoVigente})
              </button>
            )}
          </>
        }
      />

      <section className="card vidro">
        <div className="entre">
          <div className="linha-flex">
            {data.produto.fotoUrl && (
              <img
                className="avatar"
                style={{ width: 64, height: 64 }}
                src={urlArquivo(data.produto.fotoUrl)}
                alt=""
              />
            )}
            <div>
              <strong>{data.produto.nome}</strong>
              <p className="texto-pequeno texto-suave" style={{ margin: '4px 0 0' }}>
                {data.produto.descricao ?? 'Sem descrição técnica cadastrada.'}
              </p>
            </div>
          </div>

          <div style={{ minWidth: 220 }}>
            <Progresso valor={podeEditar ? progressoLocal : data.resumo.progresso} />
            <p className="texto-pequeno texto-fraco" style={{ margin: '6px 0 0' }}>
              {data.resumo.concluida ? (
                <>
                  <Icone nome="verificado" tamanho={14} className="icone icone--em-linha" />
                  Certificação concluída
                </>
              ) : (
                'Certificação em andamento'
              )}
            </p>
          </div>
        </div>
      </section>

      <section className="vidro" style={{ padding: 12 }}>
        <div className="timeline">
          <div className="timeline__trilha" />
          <div
            className="timeline__progresso"
            style={{
              width: `calc(${podeEditar ? progressoLocal : data.resumo.progresso}% - 24px)`,
            }}
          />

          {data.etapas.map((etapa) => {
            const atual = rascunho[etapa.id] ?? {
              status: etapa.status,
              observacao: etapa.observacao ?? '',
            };

            return (
              <article
                key={etapa.id}
                className={`etapa vidro ${CLASSE_ETAPA[atual.status]}`}
              >
                {/* Decorativo: o BadgeCertificacao ao lado já anuncia o
                    status em texto — repetir aqui duplicaria a leitura. */}
                <div className="etapa__marcador" aria-hidden>
                  <Icone nome={ICONE_ETAPA[atual.status]} tamanho={16} />
                </div>

                <div className="etapa__titulo">
                  {etapa.ordem}. {etapa.etapa.nome}
                </div>

                {podeEditar ? (
                  <>
                    <div className="campo">
                      <label htmlFor={`status-${etapa.id}`}>Status</label>
                      <select
                        id={`status-${etapa.id}`}
                        value={atual.status}
                        onChange={(evento) =>
                          setRascunho((anterior) => ({
                            ...anterior,
                            [etapa.id]: {
                              ...atual,
                              status: evento.target.value as StatusCertificacao,
                            },
                          }))
                        }
                      >
                        {STATUS_CERTIFICACAO.map((status) => (
                          <option key={status} value={status}>
                            {rotuloStatusCertificacao[status]}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="campo">
                      <label htmlFor={`obs-${etapa.id}`}>Observação</label>
                      <textarea
                        id={`obs-${etapa.id}`}
                        rows={3}
                        value={atual.observacao}
                        placeholder="Registre o parecer técnico desta etapa"
                        onChange={(evento) =>
                          setRascunho((anterior) => ({
                            ...anterior,
                            [etapa.id]: { ...atual, observacao: evento.target.value },
                          }))
                        }
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ textAlign: 'center' }}>
                      <BadgeCertificacao status={etapa.status} />
                    </div>
                    <p className="texto-pequeno texto-suave">
                      {etapa.observacao ?? 'Sem observações.'}
                    </p>
                  </>
                )}

                <DocumentosEtapa
                  produtoId={id}
                  etapa={etapa}
                  podeAnexar={podeEditar}
                />

                {/* NC pendente de abertura: o formulário viaja no mesmo lote
                    do salvamento, então a reprovação e a NC nascem juntas. */}
                {podeEditar &&
                  atual.status === 'REPROVADO' &&
                  etapa.status !== 'REPROVADO' && (
                    <FormularioNaoConformidade
                      valor={ncsNovas[etapa.id]}
                      aoMudar={(dados) =>
                        setNcsNovas((anterior) => ({ ...anterior, [etapa.id]: dados }))
                      }
                    />
                  )}

                {etapa.naoConformidades.length > 0 && (
                  <div className="nc-lista nc-lista--compacta">
                    {etapa.naoConformidades.map((nc) => (
                      <CartaoNaoConformidade
                        key={nc.id}
                        nc={nc}
                        acoes={
                          podeEditar &&
                          (nc.status === 'ABERTA' || nc.status === 'EM_TRATATIVA') ? (
                            <>
                              <button
                                type="button"
                                className="btn"
                                onClick={() =>
                                  avaliarNc.mutate({ id: nc.id, status: 'RESOLVIDA' })
                                }
                                disabled={avaliarNc.isPending}
                                title="Reabre a etapa como Em andamento para reavaliação"
                              >
                                <Icone nome="check" tamanho={16} />
                                Resolver
                              </button>
                              <button
                                type="button"
                                className="btn"
                                onClick={() =>
                                  avaliarNc.mutate({ id: nc.id, status: 'REPROVADA' })
                                }
                                disabled={avaliarNc.isPending}
                                title="Encerra a NC mantendo a etapa reprovada"
                              >
                                <Icone nome="x" tamanho={16} />
                                Reprovar
                              </button>
                            </>
                          ) : undefined
                        }
                      />
                    ))}
                  </div>
                )}

                <p className="texto-pequeno texto-fraco">
                  Atualizado em {formatarDataHora(etapa.atualizadoEm)}
                </p>
              </article>
            );
          })}
        </div>

        {podeEditar && (
          <div className="form-acoes" style={{ padding: '8px 12px 12px' }}>
            <span className="texto-pequeno texto-fraco" style={{ marginRight: 'auto' }}>
              {alteracoes.length === 0
                ? 'Nenhuma alteração pendente.'
                : `${alteracoes.length} etapa(s) alterada(s).`}
            </span>
            <button
              type="button"
              className="btn"
              onClick={() => data && setRascunho(montarRascunho(data.etapas))}
              disabled={alteracoes.length === 0 || salvar.isPending}
            >
              Descartar
            </button>
            <button
              type="button"
              className="btn btn--primario"
              onClick={() => salvar.mutate(alteracoes)}
              disabled={alteracoes.length === 0 || salvar.isPending}
            >
              {salvar.isPending ? 'Salvando...' : 'Salvar alterações'}
            </button>
          </div>
        )}
      </section>

      <PainelCertificadoProduto
        produtoId={id}
        produtoNome={data.produto.nome}
        obrigatoriasAprovadas={data.resumo.obrigatoriasAprovadas}
      />

      <section className="card vidro">
        <h2 style={{ fontSize: '1.05rem' }}>Histórico de alterações</h2>
        <p className="texto-pequeno texto-fraco">
          Registro imutável de cada mudança de status, com autoria e data.
        </p>

        {data.etapas.every((etapa) => etapa.historico.length === 0) ? (
          <EstadoVazio
            icone="relogio"
            titulo="Nenhuma alteração registrada"
            descricao="O histórico começa a ser preenchido na primeira mudança de status."
          />
        ) : (
          <div style={{ display: 'grid', gap: 18, marginTop: 14 }}>
            {data.etapas
              .filter((etapa) => etapa.historico.length > 0)
              .map((etapa) => (
                <div key={etapa.id}>
                  <h3 style={{ fontSize: '0.95rem' }}>
                    {etapa.ordem}. {etapa.etapa.nome}
                  </h3>
                  <ul className="historico">
                    {etapa.historico.map((registro) => (
                      <li key={registro.id}>
                        {/* Anexo não é transição: o registro nasce com o
                            status inalterado só para datar e assinar o envio. */}
                        {registro.statusAnterior === registro.statusNovo ? (
                          <strong className="linha-flex">
                            <Icone nome="clipe" tamanho={14} />
                            Documento anexado
                          </strong>
                        ) : (
                          <>
                            <strong>
                              {registro.statusAnterior
                                ? rotuloStatusCertificacao[registro.statusAnterior]
                                : '—'}
                            </strong>{' '}
                            →{' '}
                            <strong>
                              {rotuloStatusCertificacao[registro.statusNovo]}
                            </strong>
                          </>
                        )}
                        {registro.observacao && (
                          <p className="texto-suave" style={{ margin: '6px 0 0' }}>
                            {registro.observacao}
                          </p>
                        )}
                        <time>
                          {registro.alteradoPorNome} ·{' '}
                          {formatarDataHora(registro.alteradoEm)}
                        </time>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
          </div>
        )}
      </section>

      <ModalConfirmacao
        aberto={confirmarMigracao}
        titulo="Atualizar a trilha deste produto"
        mensagem={
          `${versao?.mensagem ?? ''} ` +
          'As etapas já avaliadas e o histórico são preservados; nada é reavaliado.'
        }
        rotuloConfirmar="Atualizar trilha"
        carregando={migrarVersao.isPending}
        aoCancelar={() => setConfirmarMigracao(false)}
        aoConfirmar={() => migrarVersao.mutate()}
      />
    </>
  );
}
