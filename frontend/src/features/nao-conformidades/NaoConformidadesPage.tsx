import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { useAuth } from '@/auth/useAuth';
import { CabecalhoPagina } from '@/components/CabecalhoPagina';
import { Campo } from '@/components/Campo';
import { Carregando } from '@/components/Carregando';
import { EstadoVazio } from '@/components/EstadoVazio';
import { Paginacao } from '@/components/Paginacao';
import { mensagemDeErro } from '@/lib/api';
import { chaves } from '@/lib/queryClient';
import type { NaoConformidadeDetalhada, StatusNaoConformidade } from '@/types';
import { naoConformidadesApi, type FiltrosNaoConformidades } from './api';
import { CartaoNaoConformidade } from './CartaoNaoConformidade';

const FILTROS_STATUS: Array<{ valor?: StatusNaoConformidade; rotulo: string }> = [
  { valor: undefined, rotulo: 'Todas' },
  { valor: 'ABERTA', rotulo: 'Abertas' },
  { valor: 'EM_TRATATIVA', rotulo: 'Em tratativa' },
  { valor: 'RESOLVIDA', rotulo: 'Resolvidas' },
  { valor: 'REPROVADA', rotulo: 'Reprovadas' },
];

/** Formulário de resposta do cliente, aberto por NC. */
function FormularioResposta({
  nc,
  aoFechar,
}: {
  nc: NaoConformidadeDetalhada;
  aoFechar: () => void;
}) {
  const queryClient = useQueryClient();
  const [texto, setTexto] = useState(nc.respostaCliente ?? '');

  const responder = useMutation({
    mutationFn: () => naoConformidadesApi.responder(nc.id, texto),
    onSuccess: () => {
      toast.success('Resposta registrada. A equipe técnica vai avaliar.');
      void queryClient.invalidateQueries({ queryKey: ['nao-conformidades'] });
      void queryClient.invalidateQueries({ queryKey: ['certificacoes'] });
      aoFechar();
    },
    onError: (erro) => toast.error(mensagemDeErro(erro)),
  });

  return (
    <div style={{ marginTop: 12 }}>
      <Campo
        label="Descreva a correção aplicada"
        dica="Mínimo de 10 caracteres. A equipe avalia e reabre a etapa se estiver conforme."
      >
        <textarea
          rows={4}
          value={texto}
          autoFocus
          onChange={(evento) => setTexto(evento.target.value)}
        />
      </Campo>
      <div className="form-acoes">
        <button type="button" className="btn" onClick={aoFechar}>
          Cancelar
        </button>
        <button
          type="button"
          className="btn btn--primario"
          disabled={texto.trim().length < 10 || responder.isPending}
          onClick={() => responder.mutate()}
        >
          {responder.isPending ? 'Enviando...' : 'Enviar resposta'}
        </button>
      </div>
    </div>
  );
}

export function NaoConformidadesPage() {
  const { temPapel } = useAuth();
  const ehCliente = temPapel('CLIENTE');

  const [filtros, setFiltros] = useState<FiltrosNaoConformidades>({
    pagina: 1,
    limite: 20,
    // O cliente entra na aba para resolver pendências; a equipe, para revisar.
    pendentes: ehCliente || undefined,
  });
  const [respondendo, setRespondendo] = useState<number | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: chaves.naoConformidades(filtros),
    queryFn: () => naoConformidadesApi.listar(filtros),
  });

  const listaVazia = !isLoading && (data?.dados.length ?? 0) === 0;

  return (
    <>
      <CabecalhoPagina
        titulo="Não conformidades"
        descricao={
          ehCliente
            ? 'Pendências levantadas na avaliação dos seus produtos, ordenadas por prazo.'
            : 'Não conformidades abertas nas etapas reprovadas, ordenadas por prazo.'
        }
      />

      <div className="filtros-linha">
        {FILTROS_STATUS.map((opcao) => (
          <button
            key={opcao.rotulo}
            type="button"
            className={`btn ${filtros.status === opcao.valor && !filtros.pendentes ? 'btn--primario' : ''}`}
            onClick={() =>
              setFiltros((atual) => ({
                ...atual,
                pagina: 1,
                status: opcao.valor,
                pendentes: undefined,
              }))
            }
          >
            {opcao.rotulo}
          </button>
        ))}
        <button
          type="button"
          className={`btn ${filtros.pendentes ? 'btn--primario' : ''}`}
          onClick={() =>
            setFiltros((atual) => ({
              ...atual,
              pagina: 1,
              status: undefined,
              pendentes: true,
            }))
          }
        >
          Aguardando ação
        </button>
      </div>

      <section className="vidro">
        {isLoading ? (
          <Carregando />
        ) : listaVazia ? (
          <EstadoVazio
            icone="verificado"
            titulo="Nenhuma não conformidade"
            descricao={
              ehCliente
                ? 'Não há pendências aguardando sua resposta.'
                : 'Nenhuma não conformidade no filtro selecionado.'
            }
          />
        ) : (
          <div className="nc-lista">
            {data?.dados.map((nc) => {
              const podeResponder =
                ehCliente && (nc.status === 'ABERTA' || nc.status === 'EM_TRATATIVA');

              return (
                <div key={nc.id}>
                  <CartaoNaoConformidade
                    nc={nc}
                    contexto={
                      <>
                        <Link to={`/certificacoes/produto/${nc.certificacao.produto.id}`}>
                          {nc.certificacao.produto.nome}
                        </Link>
                        {' · etapa '}
                        {nc.certificacao.ordem}. {nc.certificacao.etapa.nome}
                        {!ehCliente && ` · ${nc.certificacao.produto.cliente.nome}`}
                      </>
                    }
                    acoes={
                      podeResponder && respondendo !== nc.id ? (
                        <button
                          type="button"
                          className="btn btn--primario"
                          onClick={() => setRespondendo(nc.id)}
                        >
                          {nc.respostaCliente ? 'Revisar resposta' : 'Responder'}
                        </button>
                      ) : undefined
                    }
                  />

                  {respondendo === nc.id && (
                    <FormularioResposta nc={nc} aoFechar={() => setRespondendo(null)} />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {data && (
          <Paginacao
            pagina={data.pagina}
            totalPaginas={data.totalPaginas}
            total={data.total}
            aoMudar={(pagina) => setFiltros((atual) => ({ ...atual, pagina }))}
          />
        )}
      </section>
    </>
  );
}
