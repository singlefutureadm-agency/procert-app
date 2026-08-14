import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Campo } from '@/components/Campo';
import type { EtapaModeloEntrada, ModeloEtapa, TipoEtapa } from '@/types';

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
  prazoSlaDias: z
    .union([z.coerce.number().int().min(1).max(3650), z.literal('')])
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
    formState: { errors },
  } = useForm<Formulario>({ resolver: zodResolver(esquema) });

  useEffect(() => {
    reset({
      nome: etapa?.nome ?? '',
      descricao: etapa?.descricao ?? '',
      tipo: etapa?.tipo ?? 'OUTRO',
      obrigatoria: etapa?.obrigatoria ?? true,
      exigeDocumento: etapa?.exigeDocumento ?? false,
      prazoSlaDias: etapa?.prazoSlaDias ?? '',
    });
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
            // Campo vazio significa "sem prazo", não zero.
            prazoSlaDias:
              dados.prazoSlaDias === '' || dados.prazoSlaDias === undefined
                ? undefined
                : Number(dados.prazoSlaDias),
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

        <Campo label="Descrição" erro={errors.descricao?.message}>
          <textarea rows={3} {...register('descricao')} />
        </Campo>

        <Campo
          label="Prazo alvo (dias)"
          erro={errors.prazoSlaDias?.message}
          dica="Deixe em branco quando a etapa não tiver prazo definido."
        >
          <input type="number" min={1} {...register('prazoSlaDias')} />
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
