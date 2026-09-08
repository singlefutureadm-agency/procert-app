import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Campo } from '@/components/Campo';
import { formatarPrazoSla } from '@/lib/formatadores';
import { EditorMicroEtapas } from './EditorMicroEtapas';
import { ROTULO_FASE, ROTULO_PAPEL_FUNCIONAL } from './rotulos';
import type {
  EtapaModeloEntrada,
  FaseProcesso,
  MicroEtapaEntrada,
  ModeloEtapa,
  PapelFuncional,
  TipoEtapa,
} from '@/types';

const TIPOS: Array<{ valor: TipoEtapa; rotulo: string }> = [
  { valor: 'DOCUMENTAL', rotulo: 'Documental' },
  { valor: 'ENSAIO', rotulo: 'Ensaio' },
  { valor: 'AUDITORIA_FABRICA', rotulo: 'Auditoria de fábrica' },
  { valor: 'ANALISE_CRITICA', rotulo: 'Análise crítica' },
  { valor: 'DECISAO', rotulo: 'Decisão' },
  { valor: 'OUTRO', rotulo: 'Outro' },
];

const esquema = z.object({
  nome: z.string().trim().min(3, 'Informe o nome da etapa.').max(120),
  descricao: z.string().trim().max(2000).optional(),
  tipo: z.enum([
    'DOCUMENTAL',
    'ENSAIO',
    'AUDITORIA_FABRICA',
    'ANALISE_CRITICA',
    'DECISAO',
    'OUTRO',
  ]),
  obrigatoria: z.boolean(),
  exigeDocumento: z.boolean(),
  fase: z.enum([
    'ABERTURA',
    'AMOSTRAGEM_AUDITORIA',
    'ENSAIOS_LABORATORIO',
    'ANALISE_PROCESSO',
    'EMISSAO',
  ]),
  // String vazia = "sem responsável definido". O backend aceita a ausência do
  // campo, não uma string vazia — a conversão acontece no submit.
  papelResponsavel: z
    .enum(['', 'CLIENTE', 'TECNICO', 'QUALIDADE', 'AUDITOR', 'DIRETORIA'])
    .optional(),
  // Espelha o DTO do backend: 1 a 8760 horas (um ano). O limite antigo, 3650,
  // era em DIAS — mantê-lo aqui aceitaria 3650h e recusaria um prazo anual.
  prazoSlaHoras: z
    .union([
      z.coerce
        .number()
        .int('Informe um número inteiro de horas.')
        .min(1, 'O prazo deve ser de ao menos 1 hora.')
        .max(8760, 'O prazo não pode passar de 8760 horas (um ano).'),
      z.literal(''),
    ])
    .optional(),
});

type Formulario = z.infer<typeof esquema>;

interface Props {
  aberto: boolean;
  etapa: ModeloEtapa | null;
  salvando: boolean;
  aoFechar: () => void;
  aoSalvar: (dados: EtapaModeloEntrada) => void;
}

export function ModalEtapaModelo({
  aberto,
  etapa,
  salvando,
  aoFechar,
  aoSalvar,
}: Props) {
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<Formulario>({ resolver: zodResolver(esquema) });

  /**
   * O checklist fica FORA do react-hook-form.
   *
   * É uma lista de objetos com adicionar/remover/reordenar, e um `useFieldArray`
   * traria registro e validação por índice para algo que é salvo junto com a
   * etapa e nunca sozinho. O `reset` do formulário e este estado são
   * sincronizados no mesmo efeito, para os dois abrirem com o mesmo dado.
   */
  const [microEtapas, setMicroEtapas] = useState<MicroEtapaEntrada[]>([]);

  // Prazo grande digitado em horas não se lê: quem escreve 720 precisa ver
  // "30 dias" para saber que não errou uma ordem de grandeza.
  const prazoDigitado = watch('prazoSlaHoras');
  const previaPrazo =
    prazoDigitado === '' || prazoDigitado == null
      ? null
      : formatarPrazoSla(Number(prazoDigitado));

  useEffect(() => {
    reset({
      nome: etapa?.nome ?? '',
      descricao: etapa?.descricao ?? '',
      tipo: etapa?.tipo ?? 'OUTRO',
      obrigatoria: etapa?.obrigatoria ?? true,
      exigeDocumento: etapa?.exigeDocumento ?? false,
      fase: etapa?.fase ?? 'ABERTURA',
      papelResponsavel: etapa?.papelResponsavel ?? '',
      prazoSlaHoras: etapa?.prazoSlaHoras ?? '',
    });

    setMicroEtapas(
      (etapa?.microEtapas ?? []).map((micro) => ({
        nome: micro.nome,
        papelResponsavel: micro.papelResponsavel ?? undefined,
        prazoSlaHoras: micro.prazoSlaHoras ?? undefined,
      })),
    );
  }, [etapa, aberto, reset]);

  if (!aberto) return null;

  return (
    <div
      className="modal-fundo"
      role="dialog"
      aria-modal="true"
      onClick={(evento) => {
        if (evento.target === evento.currentTarget) aoFechar();
      }}
    >
      <form
        className="modal vidro"
        noValidate
        onSubmit={handleSubmit((dados) =>
          aoSalvar({
            nome: dados.nome,
            descricao: dados.descricao || undefined,
            tipo: dados.tipo,
            obrigatoria: dados.obrigatoria,
            exigeDocumento: dados.exigeDocumento,
            fase: dados.fase,
            // Vazio = sem responsável definido. Vai como ausência do campo,
            // não como string vazia: o DTO valida contra o enum e recusaria ''.
            papelResponsavel: dados.papelResponsavel || undefined,
            // Item sem nome não vira microetapa: quem clica em "+ Microetapa" e
            // desiste deixa uma linha vazia, e um checklist com item sem texto
            // nunca fecha — ninguém saberia o que marcar.
            microEtapas: microEtapas
              .map((item) => ({ ...item, nome: item.nome.trim() }))
              .filter((item) => item.nome.length > 0),
            // Campo vazio significa "sem prazo", não zero.
            prazoSlaHoras:
              dados.prazoSlaHoras === '' || dados.prazoSlaHoras === undefined
                ? undefined
                : Number(dados.prazoSlaHoras),
          }),
        )}
      >
        <h3>{etapa ? 'Editar etapa' : 'Nova etapa'}</h3>

        <Campo label="Nome da etapa" erro={errors.nome?.message} obrigatorio>
          <input type="text" autoFocus {...register('nome')} />
        </Campo>

        <Campo label="Tipo" erro={errors.tipo?.message}>
          <select {...register('tipo')}>
            {TIPOS.map((tipo) => (
              <option key={tipo.valor} value={tipo.valor}>
                {tipo.rotulo}
              </option>
            ))}
          </select>
        </Campo>

        <Campo
          label="Fase do processo"
          erro={errors.fase?.message}
          dica="Define em qual coluna do quadro o processo aparece enquanto esta etapa for a atual."
        >
          <select {...register('fase')}>
            {(Object.keys(ROTULO_FASE) as FaseProcesso[]).map((fase) => (
              <option key={fase} value={fase}>
                {ROTULO_FASE[fase]}
              </option>
            ))}
          </select>
        </Campo>

        <Campo
          label="Responsável pela etapa"
          erro={errors.papelResponsavel?.message}
          dica="Papel funcional: diz de quem é a etapa no fluxo. Não concede nem restringe acesso ao sistema."
        >
          <select {...register('papelResponsavel')}>
            <option value="">Sem responsável definido</option>
            {(Object.keys(ROTULO_PAPEL_FUNCIONAL) as PapelFuncional[]).map(
              (papel) => (
                <option key={papel} value={papel}>
                  {ROTULO_PAPEL_FUNCIONAL[papel]}
                </option>
              ),
            )}
          </select>
        </Campo>

        <Campo label="Descrição" erro={errors.descricao?.message}>
          <textarea rows={3} {...register('descricao')} />
        </Campo>

        <EditorMicroEtapas itens={microEtapas} aoMudar={setMicroEtapas} />

        <Campo
          label="Prazo alvo (horas)"
          erro={errors.prazoSlaHoras?.message}
          dica={
            previaPrazo
              ? `Equivale a ${previaPrazo}. Deixe em branco quando a etapa não tiver prazo definido.`
              : 'Em horas — a operação trabalha em 8h, 12h, 24h, 72h. Deixe em branco quando a etapa não tiver prazo definido.'
          }
        >
          <input type="number" min={1} max={8760} {...register('prazoSlaHoras')} />
        </Campo>

        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', margin: '4px 0 8px' }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="checkbox" {...register('obrigatoria')} />
            <span className="texto-pequeno">Obrigatória para concluir a trilha</span>
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="checkbox" {...register('exigeDocumento')} />
            <span className="texto-pequeno">Exige documento anexado</span>
          </label>
        </div>

        <div className="form-acoes">
          <button type="button" className="btn" onClick={aoFechar}>
            Cancelar
          </button>
          <button type="submit" className="btn btn--primario" disabled={salvando}>
            {salvando ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </form>
    </div>
  );
}
