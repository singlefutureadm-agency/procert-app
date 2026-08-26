import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';

import { CabecalhoPagina } from '@/components/CabecalhoPagina';
import { Campo } from '@/components/Campo';
import { EsqueletoTabela } from '@/components/Esqueleto';
import { EstadoVazio } from '@/components/EstadoVazio';
import { Icone } from '@/components/Icone';
import { Paginacao } from '@/components/Paginacao';
import { TabelaRolavel } from '@/components/TabelaRolavel';
import { mensagemDeErro } from '@/lib/api';
import { formatarDataHora, formatarUltimoAcesso } from '@/lib/formatadores';
import { chaves } from '@/lib/queryClient';
import { relatoriosApi, type FiltrosRelatorioEquipe } from './api';

/**
 * Desempenho da equipe.
 *
 * **Carteira e atividade são colunas independentes.** A carteira é retrato de
 * hoje e ignora o período; tudo o mais é recortado por ele. Nada nesta tela
 * soma as duas, e o rodapé diz isso em texto — alguém pode ter 30 clientes na
 * carteira e nenhuma movimentação no mês, e é exatamente esse caso que o
 * relatório existe para mostrar.
 */

/** Primeiro dia do mês corrente, em `YYYY-MM-DD`. */
function inicioDoMes(): string {
  const hoje = new Date();
  return new Date(hoje.getFullYear(), hoje.getMonth(), 1)
    .toISOString()
    .slice(0, 10);
}

function hojeIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const ROTULO_PAPEL: Record<string, string> = {
  ADMIN: 'Administrador',
  FUNCIONARIO: 'Funcionário',
};

export function EquipeRelatorioPage() {
  const [filtros, setFiltros] = useState<FiltrosRelatorioEquipe>({
    pagina: 1,
    limite: 20,
    de: inicioDoMes(),
    ate: hojeIso(),
  });

  const { data, isLoading } = useQuery({
    queryKey: chaves.relatorioEquipe(filtros),
    queryFn: () => relatoriosApi.equipe(filtros),
  });

  const [exportando, setExportando] = useState<'xlsx' | 'csv' | null>(null);

  async function exportar(formato: 'xlsx' | 'csv') {
    if (!filtros.de || !filtros.ate) {
      toast.error('Informe o período antes de exportar.');
      return;
    }

    setExportando(formato);
    try {
      await relatoriosApi.exportarEquipe(
        { de: filtros.de, ate: filtros.ate },
        formato,
      );
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
        titulo="Desempenho da equipe"
        descricao="O que cada colaborador registrou no período, pela autoria dos lançamentos."
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
        <Campo label="Início do período">
          <input
            type="date"
            value={filtros.de ?? ''}
            max={filtros.ate}
            onChange={(evento) =>
              setFiltros((atual) => ({
                ...atual,
                de: evento.target.value,
                pagina: 1,
              }))
            }
          />
        </Campo>

        <Campo label="Fim do período">
          <input
            type="date"
            value={filtros.ate ?? ''}
            min={filtros.de}
            onChange={(evento) =>
              setFiltros((atual) => ({
                ...atual,
                ate: evento.target.value,
                pagina: 1,
              }))
            }
          />
        </Campo>
      </div>

      <section className="vidro">
        {isLoading ? (
          <EsqueletoTabela />
        ) : listaVazia ? (
          <EstadoVazio
            icone="pessoas"
            titulo="Nenhum colaborador encontrado"
            descricao="Cadastre a equipe interna para acompanhar o desempenho."
          />
        ) : (
          <>
            <TabelaRolavel rotulo="Desempenho da equipe">
              <table className="tabela" role="table">
                <thead role="rowgroup">
                  <tr role="row">
                    <th role="columnheader">Colaborador</th>
                    <th role="columnheader">Papel</th>
                    <th role="columnheader">Clientes na carteira</th>
                    <th role="columnheader">Etapas avaliadas</th>
                    <th role="columnheader">Aprovações</th>
                    <th role="columnheader">Reprovações</th>
                    <th role="columnheader">NCs abertas</th>
                    <th role="columnheader">Certificados emitidos</th>
                    <th role="columnheader">Documentos enviados</th>
                    <th role="columnheader">Última movimentação</th>
                    <th role="columnheader">Último acesso da conta</th>
                  </tr>
                </thead>
                <tbody role="rowgroup">
                  {data?.dados.map((linha) => (
                    <tr role="row" key={linha.id}>
                      <td role="cell" data-principal style={{ fontWeight: 600 }}>
                        {linha.nome}
                      </td>
                      <td role="cell" data-rotulo="Papel" className="texto-suave">
                        {ROTULO_PAPEL[linha.role] ?? linha.role}
                      </td>
                      {/* Retrato de hoje: NÃO respeita o período dos filtros. */}
                      <td role="cell" data-rotulo="Clientes na carteira">
                        {linha.carteira.clientes}
                      </td>
                      <td role="cell" data-rotulo="Etapas avaliadas">
                        {linha.atividade.etapasAvaliadas}
                      </td>
                      <td role="cell" data-rotulo="Aprovações">
                        {linha.atividade.aprovacoes}
                      </td>
                      <td role="cell" data-rotulo="Reprovações">
                        {linha.atividade.reprovacoes}
                      </td>
                      <td role="cell" data-rotulo="NCs abertas">
                        {linha.atividade.ncsAbertas}
                      </td>
                      <td role="cell" data-rotulo="Certificados emitidos">
                        {linha.atividade.certificadosEmitidos}
                      </td>
                      <td role="cell" data-rotulo="Documentos enviados">
                        {linha.atividade.documentosEnviados}
                      </td>
                      <td
                        role="cell"
                        data-rotulo="Última movimentação"
                        className="texto-suave"
                      >
                        {formatarDataHora(linha.atividade.ultimaMovimentacao)}
                      </td>
                      <td
                        role="cell"
                        data-rotulo="Último acesso da conta"
                        className="texto-suave"
                      >
                        {formatarUltimoAcesso(linha.ultimoAcessoEm)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TabelaRolavel>

            <p className="texto-suave" style={{ marginTop: 'var(--espaco-3)' }}>
              <strong>Clientes na carteira</strong> é um retrato de hoje e não
              respeita o período selecionado. As demais colunas contam apenas o
              que foi registrado dentro do período, pela autoria de cada
              lançamento — um colaborador pode movimentar o produto de um cliente
              que não está na carteira dele, e isso conta como atividade dele.
            </p>

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
