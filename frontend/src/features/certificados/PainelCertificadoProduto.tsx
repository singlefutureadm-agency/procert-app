import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';

import { useAuth } from '@/auth/useAuth';
import { Icone } from '@/components/Icone';
import { Campo } from '@/components/Campo';
import { mensagemDeErro } from '@/lib/api';
import { chaves } from '@/lib/queryClient';
import { certificadosApi } from './api';
import { CartaoCertificado } from './CartaoCertificado';

interface Props {
  produtoId: number;
  produtoNome: string;
  /** Vem do resumo da timeline: opcionais pendentes não bloqueiam a emissão. */
  obrigatoriasAprovadas: boolean;
}

/**
 * Bloco de certificado dentro da tela de certificação do produto.
 *
 * Fica aqui, e não numa tela separada, porque a emissão é o desfecho da
 * trilha: quem acabou de aprovar a última etapa emite no mesmo lugar.
 */
export function PainelCertificadoProduto({
  produtoId,
  produtoNome,
  obrigatoriasAprovadas,
}: Props) {
  const { temPapel } = useAuth();
  const podeEmitir = temPapel('ADMIN');
  const queryClient = useQueryClient();

  const [emitindo, setEmitindo] = useState(false);
  const [escopo, setEscopo] = useState('');
  const [dataValidade, setDataValidade] = useState('');

  const { data: certificados, isLoading } = useQuery({
    queryKey: chaves.certificadosDoProduto(produtoId),
    queryFn: () => certificadosApi.listarPorProduto(produtoId),
  });

  const emitir = useMutation({
    mutationFn: () =>
      certificadosApi.emitir(produtoId, {
        escopo,
        dataValidade: dataValidade || undefined,
      }),
    onSuccess: (certificado) => {
      toast.success(`Certificado ${certificado.numero} emitido.`);
      void queryClient.invalidateQueries({ queryKey: ['certificados'] });
      setEmitindo(false);
      setEscopo('');
      setDataValidade('');
    },
    onError: (erro) => toast.error(mensagemDeErro(erro)),
  });

  const temVigente = certificados?.some(
    (certificado) =>
      certificado.status === 'EMITIDO' || certificado.status === 'SUSPENSO',
  );

  if (isLoading) return null;
  if (!podeEmitir && (certificados?.length ?? 0) === 0) return null;

  return (
    <section className="card vidro">
      <div className="entre">
        <div>
          <h2 style={{ fontSize: '1.05rem', margin: 0 }}>Certificado</h2>
          <p className="texto-pequeno texto-fraco" style={{ margin: '4px 0 0' }}>
            {temVigente
              ? 'Documento formal emitido para este produto.'
              : obrigatoriasAprovadas
                ? 'Todas as etapas obrigatórias estão aprovadas — o produto pode ser certificado.'
                : 'A emissão libera quando todas as etapas obrigatórias estiverem aprovadas.'}
          </p>
        </div>

        {podeEmitir && !temVigente && !emitindo && (
          <button
            type="button"
            className="btn btn--primario"
            disabled={!obrigatoriasAprovadas}
            title={
              obrigatoriasAprovadas
                ? 'Emitir o certificado de conformidade'
                : 'Aprove todas as etapas obrigatórias primeiro'
            }
            onClick={() => {
              setEscopo(produtoNome);
              setEmitindo(true);
            }}
          >
            <Icone nome="certificado" tamanho={16} />
            Emitir certificado
          </button>
        )}
      </div>

      {emitindo && (
        <div style={{ marginTop: 12 }}>
          <Campo
            label="Escopo da certificação"
            obrigatorio
            dica="O que exatamente está certificado: modelos, variantes, faixa de aplicação."
          >
            <textarea
              rows={3}
              value={escopo}
              autoFocus
              onChange={(evento) => setEscopo(evento.target.value)}
            />
          </Campo>

          <Campo
            label="Validade"
            dica="Em branco, usa a validade padrão da categoria do produto."
          >
            <input
              type="date"
              value={dataValidade}
              onChange={(evento) => setDataValidade(evento.target.value)}
            />
          </Campo>

          <div className="form-acoes">
            <button type="button" className="btn" onClick={() => setEmitindo(false)}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn--primario"
              disabled={escopo.trim().length < 10 || emitir.isPending}
              onClick={() => emitir.mutate()}
            >
              {emitir.isPending ? 'Emitindo...' : 'Emitir'}
            </button>
          </div>
        </div>
      )}

      {(certificados?.length ?? 0) > 0 && (
        <div className="nc-lista" style={{ marginTop: 12 }}>
          {certificados?.map((certificado) => (
            <CartaoCertificado
              key={certificado.id}
              certificado={certificado}
              acoes={
                <button
                  type="button"
                  className="btn"
                  onClick={() =>
                    certificadosApi
                      .abrirPdf(certificado.id, certificado.numero)
                      .catch((erro) => toast.error(mensagemDeErro(erro)))
                  }
                >
                  <Icone nome="download" tamanho={16} />
                  Baixar PDF
                </button>
              }
            />
          ))}
        </div>
      )}
    </section>
  );
}
