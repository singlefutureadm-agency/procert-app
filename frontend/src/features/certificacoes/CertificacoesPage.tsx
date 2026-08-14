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
            icone="📋"
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
            <div className="tabela-wrapper">
              <table className="tabela">
                <thead>
                  <tr>
                    <th />
                    <th>Produto</th>
                    {equipe && <th>Cliente</th>}
                    <th>Etapa atual</th>
                    <th>Status</th>
                    <th style={{ minWidth: 170 }}>Progresso</th>
                    <th>Atualizado em</th>
                    <th className="texto-direita">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.dados.map((linha) => (
                    <tr key={linha.produtoId}>
                      <td style={{ width: 56 }}>
                        <img
                          className="avatar"
                          src={urlArquivo(linha.produtoFotoUrl)}
                          alt=""
                          onError={(evento) => {
                            evento.currentTarget.style.visibility = 'hidden';
                          }}
                        />
                      </td>
                      <td style={{ fontWeight: 600 }}>{linha.produto}</td>
                      {equipe && <td className="texto-suave">{linha.cliente.nome}</td>}
                      <td className="texto-suave">{linha.etapaAtual ?? '—'}</td>
                      <td>
                        <BadgeCertificacao status={linha.status} />
                      </td>
                      <td>
                        <Progresso valor={linha.progresso} />
                        <span className="texto-pequeno texto-fraco">
                          {linha.etapasAprovadas} de {linha.totalEtapas} etapas
                        </span>
                      </td>
                      <td className="texto-pequeno texto-fraco sem-quebra">
                        {formatarDataHora(linha.atualizadoEm)}
                      </td>
                      <td>
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
            </div>

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
