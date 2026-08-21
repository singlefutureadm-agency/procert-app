import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
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
import { mensagemDeErro, urlArquivo } from '@/lib/api';
import { chaves } from '@/lib/queryClient';
import type { Funcionario, StatusRegistro } from '@/types';
import { funcionariosApi, type FiltrosFuncionarios, type RoleEquipe } from './api';

const ROTULO_PAPEL: Record<RoleEquipe, string> = {
  ADMIN: 'Administrador',
  FUNCIONARIO: 'Funcionário',
};

/**
 * Tela única para administradores e funcionários.
 * No legado eram dois módulos completos e praticamente idênticos.
 */
export function FuncionariosPage() {
  const queryClient = useQueryClient();
  const [filtros, setFiltros] = useState<FiltrosFuncionarios>({
    pagina: 1,
    limite: 20,
    status: 'ATIVO',
    busca: '',
  });
  const [alvo, setAlvo] = useState<Funcionario | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: chaves.funcionarios(filtros),
    queryFn: () => funcionariosApi.listar(filtros),
  });

  const alterarStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: StatusRegistro }) =>
      funcionariosApi.alterarStatus(id, status),
    onSuccess: () => {
      toast.success('Status atualizado.');
      void queryClient.invalidateQueries({ queryKey: ['funcionarios'] });
      setAlvo(null);
    },
    onError: (erro) => toast.error(mensagemDeErro(erro)),
  });

  const vendoInativos = filtros.status === 'INATIVO';
  const listaVazia = !isLoading && (data?.dados.length ?? 0) === 0;

  return (
    <>
      <CabecalhoPagina
        titulo="Equipe interna"
        descricao="Administradores e funcionários com acesso ao painel."
        acoes={
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
            <Link to="/equipe/novo" className="btn btn--primario">
              + Novo integrante
            </Link>
          </>
        }
      />

      <div className="entre">
        <CampoBusca
          valor={filtros.busca ?? ''}
          placeholder="Buscar por nome ou e-mail"
          aoMudar={(busca) => setFiltros((atual) => ({ ...atual, busca, pagina: 1 }))}
        />

        <div className="campo" style={{ minWidth: 190 }}>
          <select
            value={filtros.role ?? ''}
            onChange={(evento) =>
              setFiltros((atual) => ({
                ...atual,
                pagina: 1,
                role: (evento.target.value || undefined) as RoleEquipe | undefined,
              }))
            }
            aria-label="Filtrar por papel"
          >
            <option value="">Todos os papéis</option>
            <option value="ADMIN">Administradores</option>
            <option value="FUNCIONARIO">Funcionários</option>
          </select>
        </div>
      </div>

      <section className="vidro">
        {isLoading ? (
          <EsqueletoTabela />
        ) : listaVazia ? (
          <EstadoVazio
            icone="pessoas"
            titulo="Nenhum integrante encontrado"
            acao={
              <Link to="/equipe/novo" className="btn btn--primario">
                Cadastrar integrante
              </Link>
            }
          />
        ) : (
          <>
            <TabelaRolavel rotulo="Equipe interna">
              <table className="tabela" role="table">
                <thead role="rowgroup">
                  <tr role="row">
                    <th role="columnheader" />
                    <th role="columnheader">Nome</th>
                    <th role="columnheader">E-mail</th>
                    <th role="columnheader">Papel</th>
                    <th role="columnheader">Telefone</th>
                    <th role="columnheader">Status</th>
                    <th role="columnheader" className="texto-direita">Ações</th>
                  </tr>
                </thead>
                <tbody role="rowgroup">
                  {data?.dados.map((integrante) => (
                    <tr role="row" key={integrante.id}>
                      <td role="cell" className="tabela__celula-inicial" style={{ width: 56 }}>
                        <img
                          className="avatar"
                          src={urlArquivo(integrante.fotoUrl)}
                          alt=""
                          onError={(evento) => {
                            evento.currentTarget.style.visibility = 'hidden';
                          }}
                        />
                      </td>
                      <td role="cell" data-principal style={{ fontWeight: 600 }}>{integrante.nome}</td>
                      <td role="cell" data-rotulo="E-mail" className="texto-suave">{integrante.email}</td>
                      <td role="cell" data-rotulo="Papel">
                        <span className="badge badge--andamento">
                          {ROTULO_PAPEL[integrante.role]}
                        </span>
                      </td>
                      <td role="cell" data-rotulo="Telefone" className="texto-suave">{integrante.telefone ?? '—'}</td>
                      <td role="cell" data-rotulo="Status">
                        <BadgeStatus status={integrante.status} />
                      </td>
                      <td role="cell" className="tabela__celula-acoes">
                        <div className="tabela__acoes">
                          <Link
                            to={`/equipe/${integrante.id}/editar`}
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
                              integrante.status === 'ATIVO' ? 'Desativar' : 'Reativar'
                            }
                            aria-label={ integrante.status === 'ATIVO' ? 'Desativar' : 'Reativar' }
                            onClick={() => setAlvo(integrante)}
                          >
                            <Icone nome={integrante.status === 'ATIVO' ? 'proibido' : 'reciclar'} />
                          </button>
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
            ? `Desativar o acesso de "${alvo?.nome}"?`
            : `Reativar o acesso de "${alvo?.nome}"?`
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
