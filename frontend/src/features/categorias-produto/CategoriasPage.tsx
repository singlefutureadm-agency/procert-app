import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { BadgeStatus } from '@/components/Badge';
import { CabecalhoPagina } from '@/components/CabecalhoPagina';
import { CampoBusca } from '@/components/CampoBusca';
import { Carregando } from '@/components/Carregando';
import { EstadoVazio } from '@/components/EstadoVazio';
import { ModalConfirmacao } from '@/components/ModalConfirmacao';
import { Paginacao } from '@/components/Paginacao';
import { mensagemDeErro } from '@/lib/api';
import { chaves } from '@/lib/queryClient';
import type { CategoriaProduto, StatusRegistro } from '@/types';
import { categoriasApi, type FiltrosCategorias } from './api';
import { ModalCategoria } from './ModalCategoria';

export function CategoriasPage() {
  const queryClient = useQueryClient();
  const [filtros, setFiltros] = useState<FiltrosCategorias>({
    pagina: 1,
    limite: 20,
    status: 'ATIVO',
    busca: '',
  });
  const [modalAberto, setModalAberto] = useState(false);
  const [emEdicao, setEmEdicao] = useState<CategoriaProduto | null>(null);
  const [alvo, setAlvo] = useState<CategoriaProduto | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: chaves.categorias(filtros),
    queryFn: () => categoriasApi.listar(filtros),
  });

  const alterarStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: StatusRegistro }) =>
      categoriasApi.alterarStatus(id, status),
    onSuccess: (_, variaveis) => {
      toast.success(
        variaveis.status === 'ATIVO'
          ? 'Categoria reativada.'
          : 'Categoria desativada.',
      );
      void queryClient.invalidateQueries({ queryKey: ['categorias'] });
      setAlvo(null);
    },
    onError: (erro) => toast.error(mensagemDeErro(erro)),
  });

  const listaVazia = !isLoading && (data?.dados.length ?? 0) === 0;
  const vendoInativas = filtros.status === 'INATIVO';

  return (
    <>
      <CabecalhoPagina
        titulo={vendoInativas ? 'Categorias inativas' : 'Categorias de produto'}
        descricao="Cada categoria define a própria trilha de certificação, versionada."
        acoes={
          <>
            <button
              type="button"
              className="btn"
              onClick={() =>
                setFiltros((atual) => ({
                  ...atual,
                  pagina: 1,
                  status: vendoInativas ? 'ATIVO' : 'INATIVO',
                }))
              }
            >
              {vendoInativas ? '← Ver ativas' : '🗑️ Ver inativas'}
            </button>
            <button
              type="button"
              className="btn btn--primario"
              onClick={() => {
                setEmEdicao(null);
                setModalAberto(true);
              }}
            >
              + Nova categoria
            </button>
          </>
        }
      />

      <div className="entre">
        <CampoBusca
          valor={filtros.busca ?? ''}
          placeholder="Buscar por nome ou norma de referência"
          aoMudar={(busca) => setFiltros((atual) => ({ ...atual, busca, pagina: 1 }))}
        />
      </div>

      <section className="vidro">
        {isLoading ? (
          <Carregando />
        ) : listaVazia ? (
          <EstadoVazio
            icone="🗂️"
            titulo="Nenhuma categoria encontrada"
            descricao={
              filtros.busca
                ? 'Tente ajustar os termos da busca.'
                : 'Crie a primeira categoria para definir uma trilha de certificação.'
            }
            acao={
              <button
                type="button"
                className="btn btn--primario"
                onClick={() => setModalAberto(true)}
              >
                Cadastrar categoria
              </button>
            }
          />
        ) : (
          <div className="tabela-wrapper">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Categoria</th>
                  <th>Norma</th>
                  <th>Trilha vigente</th>
                  <th>Produtos</th>
                  <th>Situação</th>
                  <th className="texto-direita">Ações</th>
                </tr>
              </thead>
              <tbody>
                {data?.dados.map((categoria) => (
                  <tr key={categoria.id}>
                    <td>
                      <Link
                        to={`/categorias/${categoria.id}`}
                        style={{ fontWeight: 600 }}
                      >
                        {categoria.nome}
                      </Link>
                      {categoria.descricao && (
                        <div className="texto-pequeno texto-fraco">
                          {categoria.descricao}
                        </div>
                      )}
                    </td>
                    <td className="texto-suave">{categoria.normaReferencia ?? '—'}</td>
                    <td>
                      {categoria.modeloVigente ? (
                        <span className="badge badge--aprovado sem-quebra">
                          v{categoria.modeloVigente.versao} ·{' '}
                          {categoria.modeloVigente.totalEtapas} etapa(s)
                        </span>
                      ) : (
                        // Sem trilha a categoria não aceita produto — o alerta
                        // precisa aparecer na listagem, não só no cadastro.
                        <span className="badge badge--reprovado sem-quebra">
                          sem trilha
                        </span>
                      )}
                      {categoria.totalVersoes > 1 && (
                        <div className="texto-pequeno texto-fraco">
                          {categoria.totalVersoes} versões
                        </div>
                      )}
                    </td>
                    <td className="texto-suave">{categoria.totalProdutos}</td>
                    <td>
                      <BadgeStatus status={categoria.status} />
                    </td>
                    <td>
                      <div className="tabela__acoes">
                        <Link
                          to={`/categorias/${categoria.id}`}
                          className="btn btn--icone"
                          title="Ver trilha"
                        >
                          🧭
                        </Link>
                        <button
                          type="button"
                          className="btn btn--icone"
                          title="Editar"
                          onClick={() => {
                            setEmEdicao(categoria);
                            setModalAberto(true);
                          }}
                        >
                          ✏️
                        </button>
                        <button
                          type="button"
                          className="btn btn--icone"
                          title={
                            categoria.status === 'ATIVO' ? 'Desativar' : 'Reativar'
                          }
                          onClick={() => setAlvo(categoria)}
                        >
                          {categoria.status === 'ATIVO' ? '🚫' : '♻️'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data && data.totalPaginas > 1 && (
          <Paginacao
            pagina={data.pagina}
            totalPaginas={data.totalPaginas}
            total={data.total}
            aoMudar={(pagina) => setFiltros((atual) => ({ ...atual, pagina }))}
          />
        )}
      </section>

      <ModalCategoria
        aberto={modalAberto}
        categoria={emEdicao}
        aoFechar={() => {
          setModalAberto(false);
          setEmEdicao(null);
        }}
      />

      <ModalConfirmacao
        aberto={Boolean(alvo)}
        titulo={alvo?.status === 'ATIVO' ? 'Desativar categoria' : 'Reativar categoria'}
        mensagem={
          alvo?.status === 'ATIVO'
            ? `Desativar "${alvo?.nome}"? Ela deixa de aceitar novos produtos; os produtos em andamento não são afetados.`
            : `Reativar "${alvo?.nome}"? Ela volta a aceitar novos produtos.`
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
