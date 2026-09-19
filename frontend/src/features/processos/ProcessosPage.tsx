import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { useAuth } from '@/auth/useAuth';
import { CabecalhoPagina } from '@/components/CabecalhoPagina';
import { CampoBusca } from '@/components/CampoBusca';
import { EsqueletoTabela } from '@/components/Esqueleto';
import { EstadoVazio } from '@/components/EstadoVazio';
import { Icone } from '@/components/Icone';
import { ModalConfirmacao } from '@/components/ModalConfirmacao';
import { Paginacao } from '@/components/Paginacao';
import { Progresso } from '@/components/Progresso';
import { TabelaRolavel } from '@/components/TabelaRolavel';
import { mensagemDeErro, urlArquivo } from '@/lib/api';
import { moeda } from '@/lib/formatadores';
import { chaves } from '@/lib/queryClient';
import type { Processo, StatusRegistro } from '@/types';
import { processosApi, type FiltrosProcessos } from './api';

export function ProcessosPage() {
  const { temPapel } = useAuth();
  const queryClient = useQueryClient();
  const equipe = temPapel('ADMIN', 'FUNCIONARIO');

  const [filtros, setFiltros] = useState<FiltrosProcessos>({
    pagina: 1,
    limite: 20,
    status: 'ATIVO',
    busca: '',
  });
  const [alvo, setAlvo] = useState<Processo | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: chaves.processos(filtros),
    queryFn: () => processosApi.listar(filtros),
  });

  const alterarStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: StatusRegistro }) =>
      processosApi.alterarStatus(id, status),
    onSuccess: () => {
      toast.success('Status do processo atualizado.');
      void queryClient.invalidateQueries({ queryKey: ['processos'] });
      setAlvo(null);
    },
    onError: (erro) => toast.error(mensagemDeErro(erro)),
  });

  const vendoInativos = filtros.status === 'INATIVO';
  const listaVazia = !isLoading && (data?.dados.length ?? 0) === 0;

  return (
    <>
      <CabecalhoPagina
        titulo={vendoInativos ? 'Processos inativos' : 'Processos'}
        descricao="Itens submetidos ao processo de certificação."
        acoes={
          equipe && (
            <>
              <button
                type="button"
                className="btn"
                onClick={() =>
                  setFiltros((atual) => ({
                    ...atual,
                    pagina: 1,
                    status: vendoInativos ? 'ATIVO' : 'INATIVO',
                  }))
                }
              >
                {vendoInativos ? (
                <>
                  <Icone nome="seta-esquerda" tamanho={16} />
                  Ver ativos
                </>
              ) : (
                <>
                  <Icone nome="lixeira" tamanho={16} />
                  Ver inativos
                </>
              )}
              </button>
              <Link to="/processos/novo" className="btn btn--primario">
                + Novo processo
              </Link>
            </>
          )
        }
      />

      <div className="entre">
        <CampoBusca
          valor={filtros.busca ?? ''}
          placeholder="Buscar por processo ou cliente"
          aoMudar={(busca) => setFiltros((atual) => ({ ...atual, busca, pagina: 1 }))}
        />
      </div>

      <section className="vidro">
        {isLoading ? (
          <EsqueletoTabela />
        ) : listaVazia ? (
          <EstadoVazio
            icone="caixa"
            titulo="Nenhum processo encontrado"
            descricao={
              equipe
                ? 'Ao cadastrar um processo, a trilha de certificação é aberta automaticamente.'
                : 'Você ainda não possui processos em certificação.'
            }
            acao={
              equipe && (
                <Link to="/processos/novo" className="btn btn--primario">
                  Cadastrar processo
                </Link>
              )
            }
          />
        ) : (
          <>
            <TabelaRolavel rotulo="Processos">
              <table className="tabela" role="table">
                <thead role="rowgroup">
                  <tr role="row">
                    <th role="columnheader" />
                    <th role="columnheader">Processo</th>
                    {equipe && <th role="columnheader">Cliente</th>}
                    <th role="columnheader">Etapa atual</th>
                    <th role="columnheader" style={{ minWidth: 160 }}>Progresso</th>
                    <th role="columnheader">Valor</th>
                    <th role="columnheader" className="texto-direita">Ações</th>
                  </tr>
                </thead>
                <tbody role="rowgroup">
                  {data?.dados.map((processo) => (
                    <tr role="row" key={processo.id}>
                      <td role="cell" className="tabela__celula-inicial" style={{ width: 56 }}>
                        <img
                          className="avatar"
                          src={urlArquivo(processo.fotoUrl, '/placeholder-processo.svg')}
                          alt=""
                          onError={(evento) => {
                            evento.currentTarget.style.visibility = 'hidden';
                          }}
                        />
                      </td>
                      <td role="cell" data-principal style={{ fontWeight: 600 }}>{processo.nome}</td>
                      {equipe && (
                        <td role="cell" data-rotulo="Cliente" className="texto-suave">{processo.cliente.nome}</td>
                      )}
                      <td role="cell" data-rotulo="Etapa atual" className="texto-suave">
                        {processo.resumoCertificacao.etapaAtual ?? '—'}
                      </td>
                      <td role="cell" data-rotulo="Progresso">
                        <Progresso valor={processo.resumoCertificacao.progresso} />
                      </td>
                      <td role="cell" data-rotulo="Valor" className="sem-quebra">{moeda.format(processo.preco)}</td>
                      <td role="cell" className="tabela__celula-acoes">
                        <div className="tabela__acoes">
                          <Link
                            to={`/certificacoes/processo/${processo.id}`}
                            className="btn btn--icone"
                            title="Ver certificação"
                            aria-label="Ver certificação"
                          >
                            <Icone nome="olho" />
                          </Link>
                          {equipe && (
                            <>
                              <Link
                                to={`/processos/${processo.id}/editar`}
                                className="btn btn--icone"
                                title="Editar"
                                aria-label="Editar"
                              >
                                <Icone nome="lapis" />
                              </Link>
                              <button
                                type="button"
                                className="btn btn--icone"
                                title={
                                  processo.status === 'ATIVO' ? 'Desativar' : 'Reativar'
                                }
                                aria-label={ processo.status === 'ATIVO' ? 'Desativar' : 'Reativar' }
                                onClick={() => setAlvo(processo)}
                              >
                                <Icone nome={processo.status === 'ATIVO' ? 'proibido' : 'reciclar'} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TabelaRolavel>

            <Paginacao
              pagina={data?.pagina ?? 1}
              totalPaginas={data?.totalPaginas ?? 1}
              total={data?.total ?? 0}
              aoMudar={(pagina) => setFiltros((atual) => ({ ...atual, pagina }))}
            />
          </>
        )}
      </section>

      <ModalConfirmacao
        aberto={Boolean(alvo)}
        titulo="Confirmar ação"
        mensagem={
          alvo?.status === 'ATIVO'
            ? `Desativar o processo "${alvo?.nome}"? O histórico de certificação é preservado.`
            : `Reativar o processo "${alvo?.nome}"?`
        }
        rotuloConfirmar={alvo?.status === 'ATIVO' ? 'Desativar' : 'Reativar'}
        perigo={alvo?.status === 'ATIVO'}
        carregando={alterarStatus.isPending}
        aoCancelar={() => setAlvo(null)}
        aoConfirmar={() =>
          alvo &&
          alterarStatus.mutate({
            id: alvo.id,
            status: alvo.status === 'ATIVO' ? 'INATIVO' : 'ATIVO',
          })
        }
      />
    </>
  );
}
