import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { BadgeStatus } from '@/components/Badge';
import { CabecalhoPagina } from '@/components/CabecalhoPagina';
import { CampoBusca } from '@/components/CampoBusca';
import { EsqueletoTabela } from '@/components/Esqueleto';
import { EstadoVazio } from '@/components/EstadoVazio';
import { Icone } from '@/components/Icone';
import { ModalConfirmacao } from '@/components/ModalConfirmacao';
import { Paginacao } from '@/components/Paginacao';
import { TabelaRolavel } from '@/components/TabelaRolavel';
import { mensagemDeErro } from '@/lib/api';
import { chaves } from '@/lib/queryClient';
import type { StatusRegistro, Trilha } from '@/types';
import { trilhasApi, type FiltrosTrilhas } from './api';
import { ModalDuplicarTrilha } from './ModalDuplicarTrilha';
import { ModalTrilha } from './ModalTrilha';

/** Ação destrutiva escolhida na tabela — decide o texto do modal de confirmação. */
type Alvo = { trilha: Trilha; acao: 'status' | 'excluir' };

export function TrilhasPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [filtros, setFiltros] = useState<FiltrosTrilhas>({
    pagina: 1,
    limite: 20,
    status: 'ATIVO',
    busca: '',
  });
  const [modalAberto, setModalAberto] = useState(false);
  const [emEdicao, setEmEdicao] = useState<Trilha | null>(null);
  const [aDuplicar, setADuplicar] = useState<Trilha | null>(null);
  const [alvo, setAlvo] = useState<Alvo | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: chaves.trilhas(filtros),
    queryFn: () => trilhasApi.listar(filtros),
  });

  function invalidar() {
    void queryClient.invalidateQueries({ queryKey: ['trilhas'] });
    // A categoria mostra a trilha que segue: mexer numa reflete na outra tela.
    void queryClient.invalidateQueries({ queryKey: ['categorias'] });
  }

  const alterarStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: StatusRegistro }) =>
      trilhasApi.alterarStatus(id, status),
    onSuccess: (_, variaveis) => {
      toast.success(
        variaveis.status === 'ATIVO' ? 'Trilha reativada.' : 'Trilha desativada.',
      );
      invalidar();
      setAlvo(null);
    },
    onError: (erro) => toast.error(mensagemDeErro(erro)),
  });

  const remover = useMutation({
    mutationFn: (id: number) => trilhasApi.remover(id),
    onSuccess: (resposta) => {
      toast.success(resposta.mensagem);
      invalidar();
      setAlvo(null);
    },
    onError: (erro) => toast.error(mensagemDeErro(erro)),
  });

  const listaVazia = !isLoading && (data?.dados.length ?? 0) === 0;
  const vendoInativas = filtros.status === 'INATIVO';

  return (
    <>
      <CabecalhoPagina
        titulo={vendoInativas ? 'Trilhas inativas' : 'Trilhas de certificação'}
        descricao="Catálogo de processos de avaliação. Uma trilha atende quantas categorias precisarem."
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
              {vendoInativas ? (
                <>
                  <Icone nome="seta-esquerda" tamanho={16} />
                  Ver ativas
                </>
              ) : (
                <>
                  <Icone nome="lixeira" tamanho={16} />
                  Ver inativas
                </>
              )}
            </button>
            <button
              type="button"
              className="btn btn--primario"
              onClick={() => {
                setEmEdicao(null);
                setModalAberto(true);
              }}
            >
              + Nova trilha
            </button>
          </>
        }
      />

      <div className="entre">
        <CampoBusca
          valor={filtros.busca ?? ''}
          placeholder="Buscar por nome ou descrição"
          aoMudar={(busca) => setFiltros((atual) => ({ ...atual, busca, pagina: 1 }))}
        />
      </div>

      <section className="vidro">
        {isLoading ? (
          <EsqueletoTabela />
        ) : listaVazia ? (
          <EstadoVazio
            icone="bussola"
            titulo="Nenhuma trilha encontrada"
            descricao={
              filtros.busca
                ? 'Tente ajustar os termos da busca.'
                : 'Crie a primeira trilha para descrever o processo de avaliação e vinculá-la às categorias.'
            }
            acao={
              <button
                type="button"
                className="btn btn--primario"
                onClick={() => {
                  setEmEdicao(null);
                  setModalAberto(true);
                }}
              >
                Cadastrar trilha
              </button>
            }
          />
        ) : (
          <TabelaRolavel rotulo="Trilhas de certificação">
            <table className="tabela" role="table">
              <thead role="rowgroup">
                <tr role="row">
                  <th role="columnheader">Trilha</th>
                  <th role="columnheader">Versão vigente</th>
                  <th role="columnheader">Categorias</th>
                  <th role="columnheader">Produtos</th>
                  <th role="columnheader">Situação</th>
                  <th role="columnheader" className="texto-direita">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody role="rowgroup">
                {data?.dados.map((trilha) => (
                  <tr role="row" key={trilha.id}>
                    <td role="cell" data-principal>
                      <Link
                        to={`/trilhas/${trilha.id}`}
                        style={{ fontWeight: 600 }}
                      >
                        {trilha.nome}
                      </Link>
                      {trilha.descricao && (
                        <div className="texto-pequeno texto-fraco">
                          {trilha.descricao}
                        </div>
                      )}
                    </td>
                    <td role="cell" data-rotulo="Versão vigente">
                      {trilha.modeloVigente ? (
                        <span className="badge badge--aprovado sem-quebra">
                          v{trilha.modeloVigente.versao} ·{' '}
                          {trilha.modeloVigente.totalEtapas} etapa(s)
                        </span>
                      ) : (
                        /* Trilha sem versão vigente não pode ser vinculada — o
                           alerta precisa aparecer aqui, não só na categoria. */
                        <span className="badge badge--reprovado sem-quebra">
                          sem versão
                        </span>
                      )}
                      {trilha.totalVersoes > 1 && (
                        <div className="texto-pequeno texto-fraco">
                          {trilha.totalVersoes} versões
                        </div>
                      )}
                    </td>
                    <td role="cell" data-rotulo="Categorias" className="texto-suave">
                      {trilha.totalCategorias === 0 ? (
                        <span className="texto-fraco">nenhuma</span>
                      ) : (
                        <span title={trilha.categorias.map((c) => c.nome).join(', ')}>
                          {trilha.totalCategorias}
                        </span>
                      )}
                    </td>
                    <td role="cell" data-rotulo="Produtos" className="texto-suave">
                      {trilha.totalProdutos}
                    </td>
                    <td role="cell" data-rotulo="Situação">
                      <BadgeStatus status={trilha.status} />
                    </td>
                    <td role="cell" className="tabela__celula-acoes">
                      <div className="tabela__acoes">
                        <Link
                          to={`/trilhas/${trilha.id}`}
                          className="btn btn--icone"
                          title="Ver etapas"
                          aria-label={`Ver etapas da trilha ${trilha.nome}`}
                        >
                          <Icone nome="bussola" />
                        </Link>
                        <button
                          type="button"
                          className="btn btn--icone"
                          title="Editar"
                          aria-label={`Editar a trilha ${trilha.nome}`}
                          onClick={() => {
                            setEmEdicao(trilha);
                            setModalAberto(true);
                          }}
                        >
                          <Icone nome="lapis" />
                        </button>
                        <button
                          type="button"
                          className="btn btn--icone"
                          title="Duplicar"
                          aria-label={`Duplicar a trilha ${trilha.nome}`}
                          disabled={!trilha.modeloVigente}
                          onClick={() => setADuplicar(trilha)}
                        >
                          <Icone nome="copiar" />
                        </button>
                        <button
                          type="button"
                          className="btn btn--icone"
                          title={trilha.status === 'ATIVO' ? 'Desativar' : 'Reativar'}
                          aria-label={`${trilha.status === 'ATIVO' ? 'Desativar' : 'Reativar'} a trilha ${trilha.nome}`}
                          onClick={() => setAlvo({ trilha, acao: 'status' })}
                        >
                          <Icone
                            nome={trilha.status === 'ATIVO' ? 'proibido' : 'reciclar'}
                          />
                        </button>
                        <button
                          type="button"
                          className="btn btn--icone"
                          title="Excluir"
                          aria-label={`Excluir a trilha ${trilha.nome}`}
                          onClick={() => setAlvo({ trilha, acao: 'excluir' })}
                        >
                          <Icone nome="lixeira" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TabelaRolavel>
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

      <ModalTrilha
        aberto={modalAberto}
        trilha={emEdicao}
        aoFechar={() => {
          setModalAberto(false);
          setEmEdicao(null);
        }}
        // Trilha criada nasce sem versão: o passo seguinte é montar as etapas,
        // e ele só existe no detalhe. Deixar o usuário na lista o faria voltar
        // para uma trilha marcada "sem versão" sem saber o que fazer.
        aoCriar={(trilha) => navigate(`/trilhas/${trilha.id}`)}
      />

      <ModalDuplicarTrilha
        aberto={Boolean(aDuplicar)}
        origem={aDuplicar}
        aoFechar={() => setADuplicar(null)}
        aoDuplicar={(trilha) => navigate(`/trilhas/${trilha.id}`)}
      />

      <ModalConfirmacao
        aberto={Boolean(alvo)}
        titulo={
          alvo?.acao === 'excluir'
            ? 'Excluir trilha'
            : alvo?.trilha.status === 'ATIVO'
              ? 'Desativar trilha'
              : 'Reativar trilha'
        }
        mensagem={
          alvo?.acao === 'excluir'
            ? `Excluir "${alvo.trilha.nome}" definitivamente, junto de todas as suas versões e etapas? A operação é recusada se houver categoria vinculada ou produto em avaliação.`
            : alvo?.trilha.status === 'ATIVO'
              ? `Desativar "${alvo?.trilha.nome}"? Ela sai do catálogo de trilhas vinculáveis. Categorias que já a seguem precisam ser desvinculadas antes.`
              : `Reativar "${alvo?.trilha.nome}"? Ela volta a poder ser vinculada a categorias.`
        }
        rotuloConfirmar={
          alvo?.acao === 'excluir'
            ? 'Excluir'
            : alvo?.trilha.status === 'ATIVO'
              ? 'Desativar'
              : 'Reativar'
        }
        perigo={alvo?.acao === 'excluir' || alvo?.trilha.status === 'ATIVO'}
        carregando={alterarStatus.isPending || remover.isPending}
        aoCancelar={() => setAlvo(null)}
        aoConfirmar={() => {
          if (!alvo) return;
          if (alvo.acao === 'excluir') {
            remover.mutate(alvo.trilha.id);
          } else {
            alterarStatus.mutate({
              id: alvo.trilha.id,
              status: alvo.trilha.status === 'ATIVO' ? 'INATIVO' : 'ATIVO',
            });
          }
        }}
      />
    </>
  );
}
