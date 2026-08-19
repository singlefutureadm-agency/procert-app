import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { useAuth } from '@/auth/useAuth';
import { CabecalhoPagina } from '@/components/CabecalhoPagina';
import { CampoBusca } from '@/components/CampoBusca';
import { Carregando } from '@/components/Carregando';
import { EstadoVazio } from '@/components/EstadoVazio';
import { Icone } from '@/components/Icone';
import { ModalConfirmacao } from '@/components/ModalConfirmacao';
import { Paginacao } from '@/components/Paginacao';
import { TabelaRolavel } from '@/components/TabelaRolavel';
import { Progresso } from '@/components/Progresso';
import { mensagemDeErro, urlArquivo } from '@/lib/api';
import { moeda } from '@/lib/formatadores';
import { chaves } from '@/lib/queryClient';
import type { Produto, StatusRegistro } from '@/types';
import { produtosApi, type FiltrosProdutos } from './api';

export function ProdutosPage() {
  const { temPapel } = useAuth();
  const queryClient = useQueryClient();
  const equipe = temPapel('ADMIN', 'FUNCIONARIO');

  const [filtros, setFiltros] = useState<FiltrosProdutos>({
    pagina: 1,
    limite: 20,
    status: 'ATIVO',
    busca: '',
  });
  const [alvo, setAlvo] = useState<Produto | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: chaves.produtos(filtros),
    queryFn: () => produtosApi.listar(filtros),
  });

  const alterarStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: StatusRegistro }) =>
      produtosApi.alterarStatus(id, status),
    onSuccess: () => {
      toast.success('Status do produto atualizado.');
      void queryClient.invalidateQueries({ queryKey: ['produtos'] });
      setAlvo(null);
    },
    onError: (erro) => toast.error(mensagemDeErro(erro)),
  });

  const vendoInativos = filtros.status === 'INATIVO';
  const listaVazia = !isLoading && (data?.dados.length ?? 0) === 0;

  return (
    <>
      <CabecalhoPagina
        titulo={vendoInativos ? 'Produtos inativos' : 'Produtos'}
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
              <Link to="/produtos/novo" className="btn btn--primario">
                + Novo produto
              </Link>
            </>
          )
        }
      />

      <div className="entre">
        <CampoBusca
          valor={filtros.busca ?? ''}
          placeholder="Buscar por produto ou cliente"
          aoMudar={(busca) => setFiltros((atual) => ({ ...atual, busca, pagina: 1 }))}
        />
      </div>

      <section className="vidro">
        {isLoading ? (
          <Carregando />
        ) : listaVazia ? (
          <EstadoVazio
            icone="caixa"
            titulo="Nenhum produto encontrado"
            descricao={
              equipe
                ? 'Ao cadastrar um produto, a trilha de certificação é aberta automaticamente.'
                : 'Você ainda não possui produtos em certificação.'
            }
            acao={
              equipe && (
                <Link to="/produtos/novo" className="btn btn--primario">
                  Cadastrar produto
                </Link>
              )
            }
          />
        ) : (
          <>
            <TabelaRolavel rotulo="Produtos">
              <table className="tabela" role="table">
                <thead role="rowgroup">
                  <tr role="row">
                    <th role="columnheader" />
                    <th role="columnheader">Produto</th>
                    {equipe && <th role="columnheader">Cliente</th>}
                    <th role="columnheader">Etapa atual</th>
                    <th role="columnheader" style={{ minWidth: 160 }}>Progresso</th>
                    <th role="columnheader">Valor</th>
                    <th role="columnheader" className="texto-direita">Ações</th>
                  </tr>
                </thead>
                <tbody role="rowgroup">
                  {data?.dados.map((produto) => (
                    <tr role="row" key={produto.id}>
                      <td role="cell" className="tabela__celula-inicial" style={{ width: 56 }}>
                        <img
                          className="avatar"
                          src={urlArquivo(produto.fotoUrl, '/placeholder-produto.svg')}
                          alt=""
                          onError={(evento) => {
                            evento.currentTarget.style.visibility = 'hidden';
                          }}
                        />
                      </td>
                      <td role="cell" data-principal style={{ fontWeight: 600 }}>{produto.nome}</td>
                      {equipe && (
                        <td role="cell" data-rotulo="Cliente" className="texto-suave">{produto.cliente.nome}</td>
                      )}
                      <td role="cell" data-rotulo="Etapa atual" className="texto-suave">
                        {produto.resumoCertificacao.etapaAtual ?? '—'}
                      </td>
                      <td role="cell" data-rotulo="Progresso">
                        <Progresso valor={produto.resumoCertificacao.progresso} />
                      </td>
                      <td role="cell" data-rotulo="Valor" className="sem-quebra">{moeda.format(produto.preco)}</td>
                      <td role="cell" className="tabela__celula-acoes">
                        <div className="tabela__acoes">
                          <Link
                            to={`/certificacoes/produto/${produto.id}`}
                            className="btn btn--icone"
                            title="Ver certificação"
                            aria-label="Ver certificação"
                          >
                            <Icone nome="olho" />
                          </Link>
                          {equipe && (
                            <>
                              <Link
                                to={`/produtos/${produto.id}/editar`}
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
                                  produto.status === 'ATIVO' ? 'Desativar' : 'Reativar'
                                }
                                aria-label={ produto.status === 'ATIVO' ? 'Desativar' : 'Reativar' }
                                onClick={() => setAlvo(produto)}
                              >
                                <Icone nome={produto.status === 'ATIVO' ? 'proibido' : 'reciclar'} />
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
            ? `Desativar o produto "${alvo?.nome}"? O histórico de certificação é preservado.`
            : `Reativar o produto "${alvo?.nome}"?`
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
