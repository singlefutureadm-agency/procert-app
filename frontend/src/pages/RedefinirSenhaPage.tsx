import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';

import { Campo } from '@/components/Campo';
import { CampoSenha } from '@/components/CampoSenha';
import { api, mensagemDeErro } from '@/lib/api';

const esquema = z
  .object({
    novaSenha: z
      .string()
      .min(8, 'A senha deve ter ao menos 8 caracteres.')
      .regex(/\d/, 'Inclua ao menos um número.')
      .regex(/[A-Za-zÀ-ÿ]/, 'Inclua ao menos uma letra.'),
    confirmacao: z.string(),
  })
  .refine((dados) => dados.novaSenha === dados.confirmacao, {
    path: ['confirmacao'],
    message: 'As senhas não coincidem.',
  });

type Formulario = z.infer<typeof esquema>;

export function RedefinirSenhaPage() {
  const [parametros] = useSearchParams();
  const navegar = useNavigate();
  const token = parametros.get('token') ?? '';

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Formulario>({ resolver: zodResolver(esquema) });

  async function aoEnviar(dados: Formulario) {
    try {
      await api.post('/auth/redefinir-senha', {
        token,
        novaSenha: dados.novaSenha,
      });
      toast.success('Senha redefinida com sucesso. Faça login novamente.');
      navegar('/login', { replace: true });
    } catch (erro) {
      toast.error(mensagemDeErro(erro, 'Link inválido ou expirado.'));
    }
  }

  if (!token) {
    return (
      <div className="tela-centralizada">
        <div className="cartao-auth vidro">
          <h1 style={{ fontSize: '1.3rem' }}>Link inválido</h1>
          <p className="texto-suave">
            O endereço acessado não contém um token de redefinição válido.
          </p>
          <Link to="/esqueci-senha" className="btn btn--primario">
            Solicitar novo link
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="tela-centralizada">
      <div className="cartao-auth vidro">
        <h1 style={{ fontSize: '1.4rem' }}>Criar nova senha</h1>

        <form className="formulario" onSubmit={handleSubmit(aoEnviar)} noValidate>
          <Campo
            label="Nova senha"
            erro={errors.novaSenha?.message}
            dica="Mínimo de 8 caracteres, com letras e números."
            obrigatorio
          >
            <CampoSenha autoComplete="new-password" {...register('novaSenha')} />
          </Campo>

          <Campo label="Confirme a nova senha" erro={errors.confirmacao?.message} obrigatorio>
            <CampoSenha autoComplete="new-password" {...register('confirmacao')} />
          </Campo>

          <button type="submit" className="btn btn--primario" disabled={isSubmitting}>
            {isSubmitting ? 'Salvando...' : 'Salvar nova senha'}
          </button>
        </form>
      </div>
    </div>
  );
}
