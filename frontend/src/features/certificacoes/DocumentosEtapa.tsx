import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import { toast } from 'sonner';

import { mensagemDeErro } from '@/lib/api';
import { Icone } from '@/components/Icone';
import { formatarTamanho } from '@/lib/formatadores';
import type { EtapaTimeline } from '@/types';
import { certificacoesApi } from './api';

interface Props {
  produtoId: number;
  etapa: EtapaTimeline;
  podeAnexar: boolean;
}

/**
 * Evidências da etapa.
 *
 * Os documentos ficam pendurados nos registros de histórico; aqui eles são
 * achatados numa lista só, porque para quem lê a etapa o que importa é o
 * conjunto de anexos — a procedência de cada um aparece no histórico abaixo.
 */
export function DocumentosEtapa({ produtoId, etapa, podeAnexar }: Props) {
  const queryClient = useQueryClient();
  const entrada = useRef<HTMLInputElement>(null);

  const documentos = etapa.historico.flatMap((registro) => registro.documentos);

  const anexar = useMutation({
    mutationFn: (arquivo: File) =>
      certificacoesApi.anexarDocumento(produtoId, etapa.id, arquivo),
    onSuccess: () => {
      toast.success('Documento anexado.');
      void queryClient.invalidateQueries({ queryKey: ['certificacoes'] });
    },
    onError: (erro) => toast.error(mensagemDeErro(erro)),
  });

  const exigido = etapa.etapa.exigeDocumento;
  const faltando = exigido && documentos.length === 0;

  if (!podeAnexar && documentos.length === 0) return null;

  return (
    <div className="documentos">
      <span className="texto-pequeno texto-fraco">
        Evidências
        {exigido && (
          <span className={faltando ? 'documentos__exigido' : ''}>
            {faltando ? ' · obrigatória para aprovar' : ' · obrigatória'}
          </span>
        )}
      </span>

      {documentos.map((documento) => (
        <button
          key={documento.id}
          type="button"
          className="documentos__item"
          title={`${documento.nomeArquivo} · enviado por ${documento.enviadoPorNome}`}
          onClick={() =>
            certificacoesApi
              .baixarDocumento(documento.id, documento.nomeArquivo)
              .catch((erro) => toast.error(mensagemDeErro(erro)))
          }
        >
          <Icone nome="clipe" tamanho={16} />
          <span className="documentos__nome">{documento.nomeArquivo}</span>
          <span className="texto-fraco">{formatarTamanho(documento.tamanhoBytes)}</span>
        </button>
      ))}

      {podeAnexar && (
        <>
          <input
            ref={entrada}
            type="file"
            hidden
            accept=".pdf,.doc,.docx,.xls,.xlsx,image/jpeg,image/png,image/webp"
            onChange={(evento) => {
              const arquivo = evento.target.files?.[0];
              if (arquivo) anexar.mutate(arquivo);
              // Permite reenviar o mesmo arquivo depois de um erro.
              evento.target.value = '';
            }}
          />
          <button
            type="button"
            className="btn btn--pequeno"
            disabled={anexar.isPending}
            onClick={() => entrada.current?.click()}
          >
            {anexar.isPending ? 'Enviando...' : '+ Anexar'}
          </button>
        </>
      )}
    </div>
  );
}
