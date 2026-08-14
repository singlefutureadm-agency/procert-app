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
import { mascararDocumento } from '@/lib/formatadores';
import { chaves } from '@/lib/queryClient';
import type { Cliente, StatusRegistro } from '@/types';
import { clientesApi, type FiltrosClientes } from './api';

export function ClientesPage() {
  const queryClient = useQueryClient();
  const [filtros, setFiltros] = useState<FiltrosClientes>({
    pagina: 1,
    limite: 20,
    status: 'ATIVO',
    busca: '',
  });
  const [alvo, setAlvo] = useState<Cliente | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: chaves.clientes(filtros),
    queryFn: () => clientesApi.listar(filtros),
  });

  const alterarStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: StatusRegistro }) =>
      clientesApi.alterarStatus(id, status),
    onSuccess: (_, variaveis) => {
      toast.success(
        variaveis.status === 'ATIVO' ? 'Cliente reativado.' : 'Cliente desativado.',
      );
      void queryClient.invalidateQueries({ queryKey: ['clientes'] });
      setAlvo(null);
    },
    onError: (erro) => toast.error(mensagemDeErro(erro)),
  });

  const listaVazia = !isLoading && (data?.dados.length ?? 0) === 0;
  const vendoInativos = filtros.status === 'INATIVO';

  return (
    <>
      <CabecalhoPagina
        titulo={vendoInativos ? 'Clientes inativos' : 'Clientes'}
        descricao="Empresas e pessoas que contratam a certificação."
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
            <Link to="/clientes/novo" className="btn btn--primario">
              + Novo cliente
            </Link>
          </>
        }
      />

      <div className="entre">
        <CampoBusca
          valor={filtros.busca ?? ''}
          placeholder="Buscar por nome, e-mail ou documento"
          aoMudar={(busca) => setFiltros((atual) => ({ ...atual, busca, pagina: 1 }))}
        />
      </div>

      <section className="vidro">
        {isLoading ? (
          <Carregando />
        ) : listaVazia ? (
          <EstadoVazio
            icone="🏢"
            titulo="Nenhum cliente encontrado"
            descricao={
              filtros.busca
                ? 'Tente ajustar os termos da busca.'
                : 'Cadastre o primeiro cliente para começar.'
            }
            acao={
              <Link to="/clientes/novo" className="btn btn--primario">
                Cadastrar cliente
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
                    <th>Documento</th>
                    <th>Telefone</th>
                    <th>UF</th>
                    <th>Status</th>
                    <th className="texto-direita">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.dados.map((cliente) => (
                    <tr key={cliente.id}>
                      <td style={{ width: 56 }}>
                        <img
                          className="avatar"
                          src={urlArquivo(cliente.fotoUrl)}
                          alt=""
                          onError={(evento) => {
                            evento.currentTarget.style.visibility = 'hidden';
                          }}
                        />
                      </td>
                      <td style={{ fontWeight: 600 }}>{cliente.nome}</td>
                      <td className="texto-suave">{cliente.email}</td>
                      <td className="texto-suave">
                        {mascararDocumento(cliente.cpf, cliente.cnpj)}
                      </td>
                      <td className="texto-suave">{cliente.telefone ?? '—'}</td>
                      <td>{cliente.estado?.sigla ?? '—'}</td>
                      <td>
                        <BadgeStatus status={cliente.status} />
                      </td>
                      <td>
                        <div className="tabela__acoes">
                          <Link
                            to={`/clientes/${cliente.id}/editar`}
                            className="btn btn--icone"
                            title="Editar"
                          >
                            ✏️
                          </Link>
                          <button
                            type="button"
                            className="btn btn--icone"
                            title={
                              cliente.status === 'ATIVO' ? 'Desativar' : 'Reativar'
                            }
                            onClick={() => setAlvo(cliente)}
                          >
                            {cliente.status === 'ATIVO' ? '🚫' : '♻️'}
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
            ? `Desativar "${alvo?.nome}"? O cadastro deixa de aparecer nas listagens e o acesso é bloqueado.`
            : `Reativar "${alvo?.nome}"?`
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
