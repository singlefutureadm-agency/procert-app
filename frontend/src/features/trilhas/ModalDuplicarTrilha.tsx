import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { Campo } from '@/components/Campo';
import { Modal } from '@/components/Modal';
import { mensagemDeErro } from '@/lib/api';
import type { Trilha } from '@/types';
import { trilhasApi } from './api';

const esquema = z.object({
  nome: z.string().trim().min(3, 'Informe o nome da nova trilha.').max(120),
  descricao: z.string().trim().max(2000).optional(),
});

type Formulario = z.infer<typeof esquema>;

interface Props {
  aberto: boolean;
  origem: Trilha | null;
  aoFechar: () => void;
  aoDuplicar?: (trilha: Trilha) => void;
}

/**
 * Copia uma trilha como v1 de outra, independente.
 *
 * É o caminho para "quero este processo com um ajuste" sem redigitar as etapas
 * — e sem vincular duas categorias à mesma trilha quando o que se queria era
 * um processo parecido, não o mesmo.
 */
export function ModalDuplicarTrilha({
  aberto,
  origem,
  aoFechar,
  aoDuplicar,
}: Props) {
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<Formulario>({ resolver: zodResolver(esquema) });

  useEffect(() => {
    reset({
      nome: origem ? `${origem.nome} (cópia)` : '',
      descricao: origem?.descricao ?? '',
    });
  }, [origem, aberto, reset]);

  const duplicar = useMutation({
    mutationFn: (dados: Formulario) => trilhasApi.duplicar(origem!.id, dados),
    onSuccess: (nova) => {
      toast.success(`Trilha "${nova.nome}" criada a partir de "${origem?.nome}".`);
      void queryClient.invalidateQueries({ queryKey: ['trilhas'] });
      aoFechar();
      aoDuplicar?.(nova);
    },
    onError: (erro) => toast.error(mensagemDeErro(erro)),
  });

  return (
    <Modal
      aberto={aberto}
      titulo="Duplicar trilha"
      aoFechar={aoFechar}
      comBotaoFechar
    >
      <form onSubmit={handleSubmit((dados) => duplicar.mutate(dados))} noValidate>
        <p className="texto-pequeno texto-fraco" style={{ marginTop: 0 }}>
          As etapas da versão vigente de <strong>{origem?.nome}</strong> viram a
          versão 1 da trilha nova. As duas ficam independentes: editar uma não
          mexe na outra.
        </p>

        <Campo label="Nome da nova trilha" erro={errors.nome?.message} obrigatorio>
          <input type="text" {...register('nome')} />
        </Campo>

        <Campo label="Descrição" erro={errors.descricao?.message}>
          <textarea rows={3} {...register('descricao')} />
        </Campo>

        <div className="form-acoes">
          <button type="button" className="btn" onClick={aoFechar}>
            Cancelar
          </button>
          <button
            type="submit"
            className="btn btn--primario"
            disabled={duplicar.isPending}
          >
            {duplicar.isPending ? 'Duplicando...' : 'Duplicar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
