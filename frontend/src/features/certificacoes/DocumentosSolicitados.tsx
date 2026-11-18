import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { toast } from 'sonner';

import { Campo } from '@/components/Campo';
import { CampoArquivo } from '@/components/CampoArquivo';
import { Icone } from '@/components/Icone';
import { Modal } from '@/components/Modal';
import { mensagemDeErro } from '@/lib/api';
import { formatarTamanho } from '@/lib/formatadores';
import type {
  DocumentoMicroEtapa,
  EtapaTimeline,
  MicroEtapaCertificacao,
} from '@/types';
import { certificacoesApi } from './api';
import {
  aguardandoEnvioDoCliente,
  CLASSE_SITUACAO,
  ROTULO_SITUACAO,
  ultimoEnvio,
} from './pedidos';

interface Props {
  processoId: number;
  etapa: EtapaTimeline;
  /** A equipe aceita ou recusa. O cliente nunca julga o próprio envio. */
  podeAvaliar: boolean;
}

/**
 * Documentos que a equipe PEDIU ao cliente nesta etapa.
 *
 * Mostra apenas os itens de checklist com `exigeDocumento` — **não o checklist
 * inteiro**. A diferença é de escopo, não de layout: a divisão interna do
 * trabalho ("receber amostra", "conferir laudo") é organização da operação, e
 * esta tela é vista também pelo CLIENTE. O que ele precisa é da lista do que
 * foi pedido a ele e do que aconteceu com cada envio.
 *
 * O ciclo que a tela precisa deixar legível:
 *
 *   equipe pede  →  cliente envia  →  PENDENTE  →  ACEITO   (libera marcar o item)
 *                                               ↘  RECUSADO (com parecer; reenvia)
 *
 * **Aceitar não marca o item.** A conclusão continua sendo um ato da equipe no
 * checklist, e o texto diz isso — prometer o contrário faria alguém aceitar o
 * arquivo e ficar esperando.
 */
export function DocumentosSolicitados({ processoId, etapa, podeAvaliar }: Props) {
  const queryClient = useQueryClient();
  const [recusando, setRecusando] = useState<DocumentoMicroEtapa | null>(null);
  const [parecer, setParecer] = useState('');
  const cancelar = useRef<HTMLButtonElement>(null);

  const pedidos = etapa.microEtapas.filter((item) => item.exigeDocumento);

  const enviar = useMutation({
    mutationFn: ({ microEtapaId, arquivo }: { microEtapaId: number; arquivo: File }) =>
      certificacoesApi.anexarDocumento(processoId, etapa.id, arquivo, microEtapaId),
    onSuccess: () => {
      toast.success('Documento enviado. A equipe vai analisá-lo.');
      void queryClient.invalidateQueries({ queryKey: ['certificacoes'] });
    },
    onError: (erro) => toast.error(mensagemDeErro(erro)),
  });

  const avaliar = useMutation({
    mutationFn: ({
      id,
      situacao,
      parecer: motivo,
    }: {
      id: number;
      situacao: 'ACEITO' | 'RECUSADO';
      parecer?: string;
    }) => certificacoesApi.avaliarDocumento(id, { situacao, parecer: motivo }),
    onSuccess: (_dados, variaveis) => {
      toast.success(
        variaveis.situacao === 'ACEITO'
          ? 'Documento aceito. Marque o item no checklist para concluí-lo.'
          : 'Documento recusado. O cliente vê o parecer e pode reenviar.',
      );
      void queryClient.invalidateQueries({ queryKey: ['certificacoes'] });
      setRecusando(null);
      setParecer('');
    },
    onError: (erro) => toast.error(mensagemDeErro(erro)),
  });

  if (pedidos.length === 0) return null;

  return (
    <div className="pedidos">
      <span className="texto-pequeno texto-fraco">Documentos solicitados</span>

      {pedidos.map((item) => (
        <ItemPedido
          key={item.id}
          item={item}
          podeAvaliar={podeAvaliar}
          enviando={enviar.isPending}
          avaliando={avaliar.isPending}
          aoEnviar={(arquivo) => enviar.mutate({ microEtapaId: item.id, arquivo })}
          aoAceitar={(id) => avaliar.mutate({ id, situacao: 'ACEITO' })}
          aoRecusar={setRecusando}
        />
      ))}

      <Modal
        aberto={Boolean(recusando)}
        titulo="Recusar documento"
        focoInicial={cancelar}
        aoFechar={() => {
          setRecusando(null);
          setParecer('');
        }}
      >
        <p className="texto-pequeno texto-suave">
          O parecer é obrigatório e é o que o cliente lê para saber o que
          reenviar — &ldquo;documento inválido&rdquo; devolve o arquivo sem
          dizer nada.
        </p>

        <Campo label="Parecer" obrigatorio>
          <textarea
            rows={4}
            value={parecer}
            placeholder="Ex.: certificado de calibração vencido em 03/2026."
            onChange={(evento) => setParecer(evento.target.value)}
          />
        </Campo>

        <div className="form-acoes">
          <button
            ref={cancelar}
            type="button"
            className="btn"
            onClick={() => {
              setRecusando(null);
              setParecer('');
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn--perigo"
            // O backend exige 5 caracteres; travar aqui evita um 400 que
            // chegaria como toast genérico, longe do campo.
            disabled={parecer.trim().length < 5 || avaliar.isPending}
            onClick={() =>
              recusando &&
              avaliar.mutate({
                id: recusando.id,
                situacao: 'RECUSADO',
                parecer: parecer.trim(),
              })
            }
          >
            {avaliar.isPending ? 'Recusando...' : 'Recusar documento'}
          </button>
        </div>
      </Modal>
    </div>
  );
}

interface PropsItem {
  item: MicroEtapaCertificacao;
  podeAvaliar: boolean;
  enviando: boolean;
  avaliando: boolean;
  aoEnviar: (arquivo: File) => void;
  aoAceitar: (id: number) => void;
  aoRecusar: (documento: DocumentoMicroEtapa) => void;
}

function ItemPedido({
  item,
  podeAvaliar,
  enviando,
  avaliando,
  aoEnviar,
  aoAceitar,
  aoRecusar,
}: PropsItem) {
  // A lista vem do mais recente para o mais antigo: o primeiro é o envio que
  // vale, e os anteriores ficam como histórico da recusa.
  const atual = ultimoEnvio(item);
  const anteriores = item.documentos.slice(1);

  const aguardandoEnvio = aguardandoEnvioDoCliente(item);

  return (
    <div className="pedido">
      <div className="pedido__topo">
        <span className="pedido__nome">
          <Icone nome="clipe" tamanho={14} />
          {item.nome}
        </span>

        {atual?.situacao ? (
          <span className={CLASSE_SITUACAO[atual.situacao]}>
            {ROTULO_SITUACAO[atual.situacao]}
          </span>
        ) : (
          <span className="badge badge--pendente">Não enviado</span>
        )}
      </div>

      {atual && <Envio documento={atual} />}

      {atual?.situacao === 'RECUSADO' && atual.parecer && (
        <p className="pedido__parecer texto-pequeno">
          <strong>Motivo da recusa:</strong> {atual.parecer}
        </p>
      )}

      {item.concluida && (
        <p className="texto-pequeno texto-fraco">
          Item concluído
          {item.concluidaPorNome ? ` por ${item.concluidaPorNome}` : ''}.
        </p>
      )}

      {podeAvaliar && atual?.situacao === 'PENDENTE' && (
        <div className="pedido__acoes">
          <button
            type="button"
            className="btn btn--pequeno btn--primario"
            disabled={avaliando}
            onClick={() => aoAceitar(atual.id)}
          >
            Aceitar
          </button>
          <button
            type="button"
            className="btn btn--pequeno"
            disabled={avaliando}
            onClick={() => aoRecusar(atual)}
          >
            Recusar
          </button>
        </div>
      )}

      {podeAvaliar && atual?.situacao === 'ACEITO' && !item.concluida && (
        <p className="texto-pequeno texto-fraco">
          Documento aceito. Marque este item no checklist para concluí-lo —
          aceitar não o marca sozinho.
        </p>
      )}

      {aguardandoEnvio && (
        <CampoArquivo
          rotulo={atual ? 'Reenviar documento' : 'Enviar documento'}
          dica="PDF, planilha, documento ou imagem."
          aceita=".pdf,.doc,.docx,.xls,.xlsx,image/jpeg,image/png,image/webp"
          // Um PDF de evidência sobe INTACTO: o otimizador é para imagem, e
          // recomprimir um documento assinado o descaracterizaria.
          otimizar={false}
          aoEscolher={(arquivo) => {
            if (arquivo && !enviando) aoEnviar(arquivo);
          }}
        />
      )}

      {anteriores.length > 0 && (
        <details className="pedido__anteriores">
          <summary className="texto-pequeno texto-fraco">
            {anteriores.length} envio{anteriores.length > 1 ? 's' : ''} anterior
            {anteriores.length > 1 ? 'es' : ''}
          </summary>
          {anteriores.map((documento) => (
            <div key={documento.id}>
              <Envio documento={documento} />
              {documento.parecer && (
                <p className="pedido__parecer texto-pequeno">{documento.parecer}</p>
              )}
            </div>
          ))}
        </details>
      )}
    </div>
  );
}

/** Uma linha de envio, clicável para baixar. */
function Envio({ documento }: { documento: DocumentoMicroEtapa }) {
  return (
    <button
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
  );
}
