import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { useAuth } from '@/auth/useAuth';
import { BadgeCertificacao } from '@/components/Badge';
import { CabecalhoPagina } from '@/components/CabecalhoPagina';
import { Carregando } from '@/components/Carregando';
import { EstadoVazio } from '@/components/EstadoVazio';
import { api } from '@/lib/api';
import { formatarDataHora } from '@/lib/formatadores';
import { chaves } from '@/lib/queryClient';
import type { MetricasDashboard } from '@/types';

function CardMetrica({
  valor,
  rotulo,
  icone,
  para,
}: {
  valor: number | string;
  rotulo: string;
  icone: string;
  para?: string;
}) {
  const conteudo = (
    <div className="card vidro">
      <div className="entre">
        <div className="card-metrica__valor">{valor}</div>
        <span style={{ fontSize: '1.7rem', opacity: 0.85 }} aria-hidden>
          {icone}
        </span>
      </div>
      <div className="card-metrica__rotulo">{rotulo}</div>
    </div>
  );

  return para ? <Link to={para}>{conteudo}</Link> : conteudo;
}

export function DashboardPage() {
  const { usuario, temPapel } = useAuth();

  const { data, isLoading, isError } = useQuery({
    queryKey: chaves.dashboard,
    queryFn: async () => {
      const { data } = await api.get<MetricasDashboard>('/dashboard/metricas');
      return data;
    },
  });

  if (isLoading) return <Carregando mensagem="Carregando indicadores..." />;

  if (isError || !data) {
    return (
      <EstadoVazio
        icone="⚠️"
        titulo="Não foi possível carregar os indicadores"
        descricao="Verifique se a API está no ar e tente novamente."
      />
    );
  }

  return (
    <>
      <CabecalhoPagina
        titulo={`Olá, ${usuario?.nome.split(' ')[0]}`}
        descricao="Panorama das certificações em andamento."
      />

      <div className="grade-cards">
        {temPapel('ADMIN', 'FUNCIONARIO') && (
          <CardMetrica
            valor={data.totalClientes}
            rotulo="Clientes ativos"
            icone="🏢"
            para="/clientes"
          />
        )}
        <CardMetrica
          valor={data.totalProdutos}
          rotulo="Produtos em certificação"
          icone="📦"
          para="/produtos"
        />
        <CardMetrica
          valor={data.certificacoesConcluidas}
          rotulo="Certificações concluídas"
          icone="✅"
          para="/certificacoes"
        />
        <CardMetrica
          valor={data.certificacoesEmAndamento}
          rotulo="Em andamento"
          icone="🔄"
          para="/certificacoes"
        />
        <CardMetrica
          valor={`${data.percentualPendentes}%`}
          rotulo="Ainda não iniciadas"
          icone="⏳"
        />
      </div>

      <section className="card vidro">
        <h2 style={{ fontSize: '1.1rem' }}>Últimas movimentações</h2>

        {data.ultimasAtualizacoes.length === 0 ? (
          <EstadoVazio
            icone="🗂️"
            titulo="Nenhuma movimentação registrada"
            descricao="As alterações de etapas aparecerão aqui."
          />
        ) : (
          <div className="tabela-wrapper">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Cliente</th>
                  <th>Etapa</th>
                  <th>Status</th>
                  <th>Atualizado em</th>
                </tr>
              </thead>
              <tbody>
                {data.ultimasAtualizacoes.map((linha, indice) => (
                  <tr key={`${linha.produtoId}-${indice}`}>
                    <td>
                      <Link to={`/certificacoes/produto/${linha.produtoId}`}>
                        {linha.produto}
                      </Link>
                    </td>
                    <td className="texto-suave">{linha.cliente}</td>
                    <td className="texto-suave">{linha.etapa}</td>
                    <td>
                      <BadgeCertificacao status={linha.status} />
                    </td>
                    <td className="texto-pequeno texto-fraco sem-quebra">
                      {formatarDataHora(linha.atualizadoEm)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
