import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { useAuth } from '@/auth/useAuth';
import { BadgeCertificacao } from '@/components/Badge';
import { CabecalhoPagina } from '@/components/CabecalhoPagina';
import { CampoBusca } from '@/components/CampoBusca';
import { Carregando } from '@/components/Carregando';
import { EstadoVazio } from '@/components/EstadoVazio';
import { Paginacao } from '@/components/Paginacao';
import { TabelaRolavel } from '@/components/TabelaRolavel';
import { Progresso } from '@/components/Progresso';
import { urlArquivo } from '@/lib/api';
import {
  formatarDataHora,
  rotuloStatusCertificacao,
  STATUS_CERTIFICACAO,
} from '@/lib/formatadores';
import { chaves } from '@/lib/queryClient';
import type { StatusCertificacao } from '@/types';
import { certificacoesApi, type FiltrosCertificacoes } from './api';

export function CertificacoesPage() {
  const { temPapel } = useAuth();
  const equipe = temPapel('ADMIN', 'FUNCIONARIO');

  const [filtros, setFiltros] = useState<FiltrosCertificacoes>({
    pagina: 1,
    limite: 20,
    busca: '',
  });

  const { data, isLoading } = useQuery({
    queryKey: chaves.certificacoes(filtros),
    queryFn: () => certificacoesApi.painel(filtros),
  });

  const listaVazia = !isLoading && (data?.dados.length ?? 0) === 0;

  return (
    <>
      <CabecalhoPagina
        titulo="Acompanhamento das certificações"
        descricao={
          equipe
            ? 'Situação de cada produto no processo de certificação.'
            : 'Acompanhe o andamento dos seus produtos.'
        }
      />

      <div className="entre">
        <CampoBusca
          valor={filtros.busca ?? ''}
          placeholder="Buscar por produto ou cliente"
          aoMudar={(busca) => setFiltros((atual) => ({ ...atual, busca, pagina: 1 }))}
        />

        <div className="campo" style={{ minWidth: 200 }}>
          <select
            value={filtros.status ?? ''}
            onChange={(evento) =>
              setFiltros((atual) => ({
                ...atual,
                pagina: 1,
                status: (evento.target.value || undefined) as
                  | StatusCertificacao
                  | undefined,
              }))
            }
            aria-label="Filtrar por status"
          >
            <option value="">Todos os status</option>
            {STATUS_CERTIFICACAO.map((status) => (
              <option key={status} value={status}>
                {rotuloStatusCertificacao[status]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <section className="vidro">
        {isLoading ? (
          <Carregando />
        ) : listaVazia ? (
          <EstadoVazio
            icone="prancheta"
            titulo="Nenhuma certificação encontrada"
            descricao={
              equipe
                ? 'Cadastre um produto para abrir automaticamente a trilha de certificação.'
                : 'Você ainda não possui produtos em processo de certificação.'
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
            <TabelaRolavel rotulo="Certificações em acompanhamento">
              <table className="tabela" role="table">
                <thead role="rowgroup">
                  <tr role="row">
                    <th role="columnheader" />
                    <th role="columnheader">Produto</th>
                    {equipe && <th role="columnheader">Cliente</th>}
                    <th role="columnheader">Etapa atual</th>
                    <th role="columnheader">Status</th>
                    <th role="columnheader" style={{ minWidth: 170 }}>Progresso</th>
                    <th role="columnheader">Atualizado em</th>
                    <th role="columnheader" className="texto-direita">Ações</th>
                  </tr>
                </thead>
                <tbody role="rowgroup">
                  {data?.dados.map((linha) => (
                    <tr role="row" key={linha.produtoId}>
                      <td role="cell" className="tabela__celula-inicial" style={{ width: 56 }}>
                        <img
                          className="avatar"
                          src={urlArquivo(linha.produtoFotoUrl)}
                          alt=""
                          onError={(evento) => {
                            evento.currentTarget.style.visibility = 'hidden';
                          }}
                        />
                      </td>
                      <td role="cell" data-principal style={{ fontWeight: 600 }}>{linha.produto}</td>
                      {equipe && <td role="cell" data-rotulo="Cliente" className="texto-suave">{linha.cliente.nome}</td>}
                      <td role="cell" data-rotulo="Etapa atual" className="texto-suave">{linha.etapaAtual ?? '—'}</td>
                      <td role="cell" data-rotulo="Status">
                        <BadgeCertificacao status={linha.status} />
                      </td>
                      <td role="cell" data-rotulo="Progresso">
                        <Progresso valor={linha.progresso} />
                        <span className="texto-pequeno texto-fraco">
                          {linha.etapasAprovadas} de {linha.totalEtapas} etapas
                        </span>
                      </td>
                      <td role="cell" data-rotulo="Atualizado em" className="texto-pequeno texto-fraco sem-quebra">
                        {formatarDataHora(linha.atualizadoEm)}
                      </td>
                      <td role="cell" className="tabela__celula-acoes">
                        <div className="tabela__acoes">
                          <Link
                            to={`/certificacoes/produto/${linha.produtoId}`}
                            className="btn btn--pequeno"
                          >
                            {equipe ? 'Gerenciar' : 'Ver detalhes'}
                          </Link>
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
    </>
  );
}
