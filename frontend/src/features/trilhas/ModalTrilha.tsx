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
  nome: z.string().trim().min(3, 'Informe o nome da trilha.').max(120),
  descricao: z.string().trim().max(2000).optional(),
});

type Formulario = z.infer<typeof esquema>;

interface Props {
  aberto: boolean;
  trilha: Trilha | null;
  aoFechar: () => void;
  /** Recebe a trilha recém-criada — a tela de lista navega para o detalhe. */
  aoCriar?: (trilha: Trilha) => void;
}

export function ModalTrilha({ aberto, trilha, aoFechar, aoCriar }: Props) {
  const queryClient = useQueryClient();
  const editando = Boolean(trilha);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<Formulario>({ resolver: zodResolver(esquema) });

  useEffect(() => {
    reset({ nome: trilha?.nome ?? '', descricao: trilha?.descricao ?? '' });
  }, [trilha, aberto, reset]);

  const salvar = useMutation({
    mutationFn: (dados: Formulario) =>
      editando
        ? trilhasApi.atualizar(trilha!.id, dados)
        : trilhasApi.criar(dados),
    onSuccess: (salva) => {
      toast.success(editando ? 'Trilha atualizada.' : 'Trilha criada.');
      void queryClient.invalidateQueries({ queryKey: ['trilhas'] });
      // Renomear a trilha muda o rótulo exibido nas categorias que a seguem.
      void queryClient.invalidateQueries({ queryKey: ['categorias'] });
      aoFechar();
      if (!editando) aoCriar?.(salva);
    },
    onError: (erro) => toast.error(mensagemDeErro(erro)),
  });

  return (
    <Modal
      aberto={aberto}
      titulo={editando ? 'Editar trilha' : 'Nova trilha'}
      aoFechar={aoFechar}
      comBotaoFechar
    >
      <form
        onSubmit={handleSubmit((dados) => salvar.mutate(dados))}
        noValidate
      >
        <Campo label="Nome" erro={errors.nome?.message} obrigatorio>
          <input
            type="text"
            placeholder="Ensaio laboratorial + auditoria de fábrica"
            {...register('nome')}
          />
        </Campo>

        <Campo
          label="Descrição"
          erro={errors.descricao?.message}
          dica="Para que serve esta trilha e a que famílias de produto ela atende."
        >
          <textarea rows={3} {...register('descricao')} />
        </Campo>

        {!editando && (
          <p className="texto-pequeno texto-fraco">
            A trilha nasce sem versão. No passo seguinte você monta as etapas da
            versão 1 — e só então ela pode ser vinculada a uma categoria.
          </p>
        )}

        <div className="form-acoes">
          <button type="button" className="btn" onClick={aoFechar}>
            Cancelar
          </button>
          <button
            type="submit"
            className="btn btn--primario"
            disabled={salvar.isPending}
          >
            {salvar.isPending ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
