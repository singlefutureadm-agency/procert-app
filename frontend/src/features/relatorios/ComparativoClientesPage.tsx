import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
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
import { formatarDataHora, formatarUltimoAcesso } from '@/lib/formatadores';
import { chaves } from '@/lib/queryClient';
import { funcionariosApi } from '@/features/funcionarios/api';
import {
  comparativosApi,
  type FiltrosComparativoClientes,
  type OrdemClientes,
} from './api';

/**
 * Comparativo de clientes.
 *
 * Responde "qual cliente cadastrou mais produtos", "qual está com mais NCs
 * abertas" e "quem sumiu da plataforma", numa tabela só.
 *
 * Duas definições que a tela declara no rodapé porque não são óbvias:
 * **concluído** é ter todas as etapas obrigatórias aprovadas (a mesma regra que
 * libera o certificado), e **vigente** conta apenas `EMITIDO` e `SUSPENSO` —
 * cancelado é terminal e vencido já passou.
 */

const ORDENS: Array<{ valor: OrdemClientes; rotulo: string }> = [
  { valor: 'produtos', rotulo: 'Mais produtos' },
  { valor: 'produtos_asc', rotulo: 'Menos produtos' },
  { valor: 'certificados', rotulo: 'Mais certificados vigentes' },
  { valor: 'nome', rotulo: 'Nome' },
];

export function ComparativoClientesPage() {
  const [filtros, setFiltros] = useState<FiltrosComparativoClientes>({
    pagina: 1,
    limite: 20,
    ordem: 'produtos',
    busca: '',
  });

  const { data, isLoading } = useQuery({
    queryKey: chaves.comparativoClientes(filtros),
    queryFn: () => comparativosApi.clientes(filtros),
  });

  const { data: equipe } = useQuery({
    queryKey: chaves.funcionariosResumo,
    queryFn: funcionariosApi.listarResumido,
    staleTime: Infinity,
  });

  const [exportando, setExportando] = useState<'xlsx' | 'csv' | null>(null);

  async function exportar(formato: 'xlsx' | 'csv') {
    setExportando(formato);
    try {
      const { pagina: _p, limite: _l, ...recorte } = filtros;
      await comparativosApi.exportarClientes(recorte, formato);
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
        titulo="Comparativo de clientes"
        descricao="Volume, andamento e presença de cada cliente na plataforma."
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
          placeholder="Buscar por nome ou e-mail"
          aoMudar={(busca) => setFiltros((a) => ({ ...a, busca, pagina: 1 }))}
        />

        <Campo label="Ordenar por">
          <select
            value={filtros.ordem}
            onChange={(e) =>
              setFiltros((a) => ({
                ...a,
                ordem: e.target.value as OrdemClientes,
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

        <Campo label="Carteira">
          <select
            value={filtros.responsavelId ?? ''}
            onChange={(e) =>
              setFiltros((a) => ({
                ...a,
                responsavelId: e.target.value
                  ? Number(e.target.value)
                  : undefined,
                pagina: 1,
              }))
            }
          >
            <option value="">Todas</option>
            {equipe?.map((i) => (
              <option key={i.id} value={i.id}>
                {i.nome}
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
            icone="predio"
            titulo="Nenhum cliente no recorte"
            descricao="Ajuste a busca ou o filtro de carteira."
          />
        ) : (
          <>
            <TabelaRolavel rotulo="Comparativo de clientes">
              <table className="tabela" role="table">
                <thead role="rowgroup">
                  <tr role="row">
                    <th role="columnheader">Cliente</th>
                    <th role="columnheader">Responsável</th>
                    <th role="columnheader">Produtos</th>
                    <th role="columnheader">Concluídos</th>
                    <th role="columnheader">Certificados vigentes</th>
                    <th role="columnheader">NCs abertas</th>
                    <th role="columnheader">Última movimentação</th>
                    <th role="columnheader">Último acesso da conta</th>
                  </tr>
                </thead>
                <tbody role="rowgroup">
                  {data?.dados.map((l) => (
                    <tr role="row" key={l.id}>
                      <td role="cell" data-principal style={{ fontWeight: 600 }}>
                        {l.nome}
                      </td>
                      <td role="cell" data-rotulo="Responsável" className="texto-suave">
                        {l.responsavel ?? 'Sem responsável'}
                      </td>
                      <td role="cell" data-rotulo="Produtos">
                        {l.produtos}
                      </td>
                      <td role="cell" data-rotulo="Concluídos">
                        {l.produtosConcluidos}
                      </td>
                      <td role="cell" data-rotulo="Certificados vigentes">
                        {l.certificadosVigentes}
                      </td>
                      <td role="cell" data-rotulo="NCs abertas">
                        {l.ncsAbertas}
                      </td>
                      <td
                        role="cell"
                        data-rotulo="Última movimentação"
                        className="texto-suave"
                      >
                        {formatarDataHora(l.ultimaMovimentacao)}
                      </td>
                      <td
                        role="cell"
                        data-rotulo="Último acesso da conta"
                        className="texto-suave"
                      >
                        {formatarUltimoAcesso(l.ultimoAcessoEm)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TabelaRolavel>

            <p className="texto-suave" style={{ marginTop: 'var(--espaco-3)' }}>
              <strong>Concluídos</strong> conta os produtos com todas as etapas
              obrigatórias aprovadas — a mesma regra que libera a emissão do
              certificado. <strong>Certificados vigentes</strong> soma apenas os
              emitidos e suspensos; cancelado e vencido ficam de fora.{' '}
              <strong>Último acesso</strong> é o da conta do cliente, e responde
              quem parou de acompanhar os próprios processos.
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
