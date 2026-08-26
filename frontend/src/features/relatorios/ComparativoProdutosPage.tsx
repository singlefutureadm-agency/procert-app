import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { CabecalhoPagina } from '@/components/CabecalhoPagina';
import { Campo } from '@/components/Campo';
import { CampoBusca } from '@/components/CampoBusca';
import { EsqueletoTabela } from '@/components/Esqueleto';
import { EstadoVazio } from '@/components/EstadoVazio';
import { Icone } from '@/components/Icone';
import { Paginacao } from '@/components/Paginacao';
import { TabelaRolavel } from '@/components/TabelaRolavel';
import { mensagemDeErro } from '@/lib/api';
import { formatarDataHora } from '@/lib/formatadores';
import { chaves } from '@/lib/queryClient';
import { categoriasApi } from '@/features/categorias-produto/api';
import {
  comparativosApi,
  type FiltrosComparativoProdutos,
  type OrdemProdutos,
} from './api';

/**
 * Comparativo de avanço por produto.
 *
 * **Progresso sozinho engana.** 60% parado há 90 dias é pior que 30% mexido
 * ontem, e a coluna "Dias parado" existe justamente para isso não passar
 * despercebido — é ela que a ordenação `paradas` usa.
 *
 * **"Obrigatórias pendentes" ≠ "Pendentes".** Só a etapa obrigatória trava a
 * emissão do certificado; opcional pendente não bloqueia. Um produto pode estar
 * em 80% e já poder emitir, ou em 95% e não poder.
 */

const ORDENS: Array<{ valor: OrdemProdutos; rotulo: string }> = [
  { valor: 'progresso', rotulo: 'Maior progresso' },
  { valor: 'progresso_asc', rotulo: 'Menor progresso' },
  { valor: 'paradas', rotulo: 'Mais tempo parado' },
  { valor: 'nome', rotulo: 'Nome' },
];

export function ComparativoProdutosPage() {
  const [filtros, setFiltros] = useState<FiltrosComparativoProdutos>({
    pagina: 1,
    limite: 20,
    ordem: 'progresso',
    busca: '',
  });

  const { data, isLoading } = useQuery({
    queryKey: chaves.comparativoProdutos(filtros),
    queryFn: () => comparativosApi.produtos(filtros),
  });

  const { data: categorias } = useQuery({
    queryKey: chaves.categoriasResumo,
    queryFn: categoriasApi.resumo,
    staleTime: Infinity,
  });

  const [exportando, setExportando] = useState<'xlsx' | 'csv' | null>(null);

  async function exportar(formato: 'xlsx' | 'csv') {
    setExportando(formato);
    try {
      const { pagina: _p, limite: _l, ...recorte } = filtros;
      await comparativosApi.exportarProdutos(recorte, formato);
    } catch (erro) {
      toast.error(mensagemDeErro(erro, 'Não foi possível gerar a planilha.'));
    } finally {
      setExportando(null);
    }
  }

  const listaVazia = !isLoading && (data?.dados.length ?? 0) === 0;

  return (
    <>
      <CabecalhoPagina
        titulo="Comparativo de produtos"
        descricao="Qual produto avança melhor, e qual está parado."
        acoes={
          <>
            <button
              type="button"
              className="btn"
              onClick={() => void exportar('xlsx')}
              disabled={exportando !== null}
            >
              <Icone nome="download" tamanho={16} />
              {exportando === 'xlsx' ? 'Gerando...' : 'Excel'}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => void exportar('csv')}
              disabled={exportando !== null}
            >
              <Icone nome="download" tamanho={16} />
              {exportando === 'csv' ? 'Gerando...' : 'CSV'}
            </button>
          </>
        }
      />

      <div className="entre">
        <CampoBusca
          valor={filtros.busca ?? ''}
          placeholder="Buscar por produto ou cliente"
          aoMudar={(busca) => setFiltros((a) => ({ ...a, busca, pagina: 1 }))}
        />

        <Campo label="Ordenar por">
          <select
            value={filtros.ordem}
            onChange={(e) =>
              setFiltros((a) => ({
                ...a,
                ordem: e.target.value as OrdemProdutos,
                pagina: 1,
              }))
            }
          >
            {ORDENS.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.rotulo}
              </option>
            ))}
          </select>
        </Campo>

        <Campo label="Categoria">
          <select
            value={filtros.categoriaId ?? ''}
            onChange={(e) =>
              setFiltros((a) => ({
                ...a,
                categoriaId: e.target.value ? Number(e.target.value) : undefined,
                pagina: 1,
              }))
            }
          >
            <option value="">Todas</option>
            {categorias?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </Campo>
      </div>

      <section className="vidro">
        {isLoading ? (
          <EsqueletoTabela />
        ) : listaVazia ? (
          <EstadoVazio
            icone="caixa"
            titulo="Nenhum produto no recorte"
            descricao="Ajuste a busca ou a categoria."
          />
        ) : (
          <>
            <TabelaRolavel rotulo="Comparativo de produtos">
              <table className="tabela" role="table">
                <thead role="rowgroup">
                  <tr role="row">
                    <th role="columnheader">Produto</th>
                    <th role="columnheader">Cliente</th>
                    <th role="columnheader">Categoria</th>
                    <th role="columnheader">Progresso</th>
                    <th role="columnheader">Etapas aprovadas</th>
                    <th role="columnheader">Obrigatórias pendentes</th>
                    <th role="columnheader">Reprovadas</th>
                    <th role="columnheader">NCs abertas</th>
                    <th role="columnheader">Dias parado</th>
                    <th role="columnheader">Última movimentação</th>
                  </tr>
                </thead>
                <tbody role="rowgroup">
                  {data?.dados.map((l) => (
                    <tr role="row" key={l.id}>
                      <td role="cell" data-principal style={{ fontWeight: 600 }}>
                        <Link to={`/certificacoes/produto/${l.id}`}>{l.nome}</Link>
                      </td>
                      <td role="cell" data-rotulo="Cliente" className="texto-suave">
                        {l.cliente}
                      </td>
                      <td role="cell" data-rotulo="Categoria" className="texto-suave">
                        {l.categoria} · v{l.trilhaVersao}
                      </td>
                      <td role="cell" data-rotulo="Progresso">
                        {l.progresso}%
                      </td>
                      <td role="cell" data-rotulo="Etapas aprovadas">
                        {l.aprovadas} de {l.totalEtapas}
                      </td>
                      {/* É esta que trava o certificado, não a de pendentes. */}
                      <td role="cell" data-rotulo="Obrigatórias pendentes">
                        {l.obrigatoriasPendentes}
                      </td>
                      <td role="cell" data-rotulo="Reprovadas">
                        {l.reprovadas}
                      </td>
                      <td role="cell" data-rotulo="NCs abertas">
                        {l.ncsAbertas}
                      </td>
                      <td role="cell" data-rotulo="Dias parado">
                        {l.diasParado === null ? 'Sem movimentação' : l.diasParado}
                      </td>
                      <td
                        role="cell"
                        data-rotulo="Última movimentação"
                        className="texto-suave"
                      >
                        {formatarDataHora(l.ultimaMovimentacao)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TabelaRolavel>

            <p className="texto-suave" style={{ marginTop: 'var(--espaco-3)' }}>
              <strong>Progresso</strong> é sobre todas as etapas da trilha.{' '}
              <strong>Obrigatórias pendentes</strong> é o que realmente trava a
              emissão do certificado — etapa opcional pendente não bloqueia.{' '}
              <strong>Dias parado</strong> conta desde a última movimentação
              registrada: um progresso alto e parado há meses é pior que um baixo
              e ativo.
            </p>

            <Paginacao
              pagina={data?.pagina ?? 1}
              totalPaginas={data?.totalPaginas ?? 1}
              total={data?.total ?? 0}
              aoMudar={(pagina) => setFiltros((a) => ({ ...a, pagina }))}
            />
          </>
        )}
      </section>
    </>
  );
}
