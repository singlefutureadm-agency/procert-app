import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { useAuth } from '@/auth/useAuth';
import { BadgeCertificacao } from '@/components/Badge';
import { CabecalhoPagina } from '@/components/CabecalhoPagina';
import { Carregando } from '@/components/Carregando';
import { EstadoVazio } from '@/components/EstadoVazio';
import { Icone, type NomeIcone } from '@/components/Icone';
import { TabelaRolavel } from '@/components/TabelaRolavel';
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
  icone: NomeIcone;
  para?: string;
}) {
  const conteudo = (
    <div className="card vidro">
      <div className="entre">
        <div className="card-metrica__valor">{valor}</div>
        {/* Decorativo: o rótulo logo abaixo já nomeia a métrica. */}
        <Icone nome={icone} tamanho={26} className="icone card-metrica__icone" />
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
        icone="alerta"
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
            icone="predio"
            para="/clientes"
          />
        )}
        <CardMetrica
          valor={data.totalProdutos}
          rotulo="Produtos em certificação"
          icone="caixa"
          para="/produtos"
        />
        <CardMetrica
          valor={data.certificacoesConcluidas}
          rotulo="Certificações concluídas"
          icone="verificado"
          para="/certificacoes"
        />
        <CardMetrica
          valor={data.certificacoesEmAndamento}
          rotulo="Em andamento"
          icone="atualizar"
          para="/certificacoes"
        />
        <CardMetrica
          valor={`${data.percentualPendentes}%`}
          rotulo="Ainda não iniciadas"
          icone="ampulheta"
        />
      </div>

      <section className="card vidro">
        <h2 style={{ fontSize: '1.1rem' }}>Últimas movimentações</h2>

        {data.ultimasAtualizacoes.length === 0 ? (
          <EstadoVazio
            icone="pastas"
            titulo="Nenhuma movimentação registrada"
            descricao="As alterações de etapas aparecerão aqui."
          />
        ) : (
          <TabelaRolavel rotulo="Últimas movimentações">
            <table className="tabela" role="table">
              <thead role="rowgroup">
                <tr role="row">
                  <th role="columnheader">Produto</th>
                  <th role="columnheader">Cliente</th>
                  <th role="columnheader">Etapa</th>
                  <th role="columnheader">Status</th>
                  <th role="columnheader">Atualizado em</th>
                </tr>
              </thead>
              <tbody role="rowgroup">
                {data.ultimasAtualizacoes.map((linha, indice) => (
                  <tr role="row" key={`${linha.produtoId}-${indice}`}>
                    <td role="cell" data-principal>
                      <Link to={`/certificacoes/produto/${linha.produtoId}`}>
                        {linha.produto}
                      </Link>
                    </td>
                    <td role="cell" data-rotulo="Cliente" className="texto-suave">{linha.cliente}</td>
                    <td role="cell" data-rotulo="Etapa" className="texto-suave">{linha.etapa}</td>
                    <td role="cell" data-rotulo="Status">
                      <BadgeCertificacao status={linha.status} />
                    </td>
                    <td role="cell" data-rotulo="Atualizado em" className="texto-pequeno texto-fraco sem-quebra">
                      {formatarDataHora(linha.atualizadoEm)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TabelaRolavel>
        )}
      </section>
    </>
  );
}
