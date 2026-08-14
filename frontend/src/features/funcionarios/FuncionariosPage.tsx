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
              {vendoInativos ? '← Ver ativos' : '🗑️ Ver inativos'}
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
          <Carregando />
        ) : listaVazia ? (
          <EstadoVazio
            icone="👥"
            titulo="Nenhum integrante encontrado"
            acao={
              <Link to="/equipe/novo" className="btn btn--primario">
                Cadastrar integrante
              </Link>
            }
          />
        ) : (
          <>
            <div className="tabela-wrapper">
              <table className="tabela">
                <thead>
                  <tr>
                    <th />
                    <th>Nome</th>
                    <th>E-mail</th>
                    <th>Papel</th>
                    <th>Telefone</th>
                    <th>Status</th>
                    <th className="texto-direita">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.dados.map((integrante) => (
                    <tr key={integrante.id}>
                      <td style={{ width: 56 }}>
                        <img
                          className="avatar"
                          src={urlArquivo(integrante.fotoUrl)}
                          alt=""
                          onError={(evento) => {
                            evento.currentTarget.style.visibility = 'hidden';
                          }}
                        />
                      </td>
                      <td style={{ fontWeight: 600 }}>{integrante.nome}</td>
                      <td className="texto-suave">{integrante.email}</td>
                      <td>
                        <span className="badge badge--andamento">
                          {ROTULO_PAPEL[integrante.role]}
                        </span>
                      </td>
                      <td className="texto-suave">{integrante.telefone ?? '—'}</td>
                      <td>
                        <BadgeStatus status={integrante.status} />
                      </td>
                      <td>
                        <div className="tabela__acoes">
                          <Link
                            to={`/equipe/${integrante.id}/editar`}
                            className="btn btn--icone"
                            title="Editar"
                          >
                            ✏️
                          </Link>
                          <button
                            type="button"
                            className="btn btn--icone"
                            title={
                              integrante.status === 'ATIVO' ? 'Desativar' : 'Reativar'
                            }
                            onClick={() => setAlvo(integrante)}
                          >
                            {integrante.status === 'ATIVO' ? '🚫' : '♻️'}
                          </button>
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
