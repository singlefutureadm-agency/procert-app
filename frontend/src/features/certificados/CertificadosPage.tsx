import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { useAuth } from '@/auth/useAuth';
import { CabecalhoPagina } from '@/components/CabecalhoPagina';
import { Campo } from '@/components/Campo';
import { CampoBusca } from '@/components/CampoBusca';
import { Carregando } from '@/components/Carregando';
import { EstadoVazio } from '@/components/EstadoVazio';
import { Paginacao } from '@/components/Paginacao';
import { mensagemDeErro } from '@/lib/api';
import { chaves } from '@/lib/queryClient';
import type { Certificado, StatusCertificado } from '@/types';
import { certificadosApi, type FiltrosCertificados } from './api';
import { CartaoCertificado } from './CartaoCertificado';

const FILTROS: Array<{ valor?: StatusCertificado; rotulo: string }> = [
  { valor: undefined, rotulo: 'Todos' },
  { valor: 'EMITIDO', rotulo: 'Vigentes' },
  { valor: 'SUSPENSO', rotulo: 'Suspensos' },
  { valor: 'VENCIDO', rotulo: 'Vencidos' },
  { valor: 'CANCELADO', rotulo: 'Cancelados' },
];

/** Suspensão e cancelamento exigem justificativa — o backend recusa sem ela. */
function FormularioEncerramento({
  certificado,
  acao,
  aoFechar,
}: {
  certificado: Certificado;
  acao: 'SUSPENSO' | 'CANCELADO';
  aoFechar: () => void;
}) {
  const queryClient = useQueryClient();
  const [motivo, setMotivo] = useState('');

  const alterar = useMutation({
    mutationFn: () => certificadosApi.alterarStatus(certificado.id, acao, motivo),
    onSuccess: () => {
      toast.success(
        acao === 'SUSPENSO' ? 'Certificado suspenso.' : 'Certificado cancelado.',
      );
      void queryClient.invalidateQueries({ queryKey: ['certificados'] });
      aoFechar();
    },
    onError: (erro) => toast.error(mensagemDeErro(erro)),
  });

  return (
    <div style={{ marginTop: 12 }}>
      <Campo
        label={acao === 'SUSPENSO' ? 'Motivo da suspensão' : 'Motivo do cancelamento'}
        dica="Mínimo de 10 caracteres. Fica registrado no certificado."
      >
        <textarea
          rows={3}
          value={motivo}
          autoFocus
          onChange={(evento) => setMotivo(evento.target.value)}
        />
      </Campo>
      <div className="form-acoes">
        <button type="button" className="btn" onClick={aoFechar}>
          Cancelar
        </button>
        <button
          type="button"
          className="btn btn--perigo"
          disabled={motivo.trim().length < 10 || alterar.isPending}
          onClick={() => alterar.mutate()}
        >
          {alterar.isPending ? 'Aplicando...' : 'Confirmar'}
        </button>
      </div>
    </div>
  );
}

export function CertificadosPage() {
  const { temPapel } = useAuth();
  const ehAdmin = temPapel('ADMIN');
  const ehCliente = temPapel('CLIENTE');
  const queryClient = useQueryClient();

  const [filtros, setFiltros] = useState<FiltrosCertificados>({
    pagina: 1,
    limite: 20,
    busca: '',
  });
  const [encerrando, setEncerrando] = useState<{
    id: number;
    acao: 'SUSPENSO' | 'CANCELADO';
  } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: chaves.certificados(filtros),
    queryFn: () => certificadosApi.listar(filtros),
  });

  const reativar = useMutation({
    mutationFn: (id: number) => certificadosApi.alterarStatus(id, 'EMITIDO'),
    onSuccess: () => {
      toast.success('Certificado reativado.');
      void queryClient.invalidateQueries({ queryKey: ['certificados'] });
    },
    onError: (erro) => toast.error(mensagemDeErro(erro)),
  });

  const listaVazia = !isLoading && (data?.dados.length ?? 0) === 0;

  return (
    <>
      <CabecalhoPagina
        titulo="Certificados"
        descricao={
          ehCliente
            ? 'Certificados emitidos para os seus produtos.'
            : 'Certificados de conformidade emitidos pela ProCert.'
        }
      />

      <div className="filtros-linha">
        {FILTROS.map((opcao) => (
          <button
            key={opcao.rotulo}
            type="button"
            className={`btn ${filtros.status === opcao.valor ? 'btn--primario' : ''}`}
            onClick={() =>
              setFiltros((atual) => ({ ...atual, pagina: 1, status: opcao.valor }))
            }
          >
            {opcao.rotulo}
          </button>
        ))}
      </div>

      <div className="entre">
        <CampoBusca
          valor={filtros.busca ?? ''}
          placeholder="Buscar por número ou produto"
          aoMudar={(busca) => setFiltros((atual) => ({ ...atual, busca, pagina: 1 }))}
        />
      </div>

      <section className="vidro">
        {isLoading ? (
          <Carregando />
        ) : listaVazia ? (
          <EstadoVazio
            icone="📜"
            titulo="Nenhum certificado"
            descricao={
              ehCliente
                ? 'Nenhum produto seu foi certificado ainda.'
                : 'Os certificados aparecem aqui após a emissão pelo administrador.'
            }
          />
        ) : (
          <div className="nc-lista">
            {data?.dados.map((certificado) => (
              <div key={certificado.id}>
                <CartaoCertificado
                  certificado={certificado}
                  contexto={
                    <>
                      <Link to={`/certificacoes/produto/${certificado.produto.id}`}>
                        {certificado.produto.nome}
                      </Link>
                      {!ehCliente && ` · ${certificado.produto.cliente.nome}`}
                    </>
                  }
                  acoes={
                    <>
                      <button
                        type="button"
                        className="btn"
                        onClick={() =>
                          certificadosApi
                            .abrirPdf(certificado.id, certificado.numero)
                            .catch((erro) => toast.error(mensagemDeErro(erro)))
                        }
                      >
                        ⬇ Baixar PDF
                      </button>

                      {ehAdmin && certificado.status === 'EMITIDO' && (
                        <>
                          <button
                            type="button"
                            className="btn"
                            onClick={() =>
                              setEncerrando({ id: certificado.id, acao: 'SUSPENSO' })
                            }
                          >
                            Suspender
                          </button>
                          <button
                            type="button"
                            className="btn"
                            onClick={() =>
                              setEncerrando({ id: certificado.id, acao: 'CANCELADO' })
                            }
                          >
                            Cancelar
                          </button>
                        </>
                      )}

                      {ehAdmin && certificado.status === 'SUSPENSO' && (
                        <>
                          <button
                            type="button"
                            className="btn"
                            disabled={reativar.isPending}
                            onClick={() => reativar.mutate(certificado.id)}
                          >
                            Reativar
                          </button>
                          <button
                            type="button"
                            className="btn"
                            onClick={() =>
                              setEncerrando({ id: certificado.id, acao: 'CANCELADO' })
                            }
                          >
                            Cancelar
                          </button>
                        </>
                      )}
                    </>
                  }
                />

                {encerrando?.id === certificado.id && (
                  <FormularioEncerramento
                    certificado={certificado}
                    acao={encerrando.acao}
                    aoFechar={() => setEncerrando(null)}
                  />
                )}
              </div>
            ))}
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
