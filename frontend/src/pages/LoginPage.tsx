import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';

import { useAuth } from '@/auth/useAuth';
import { Campo } from '@/components/Campo';
import { Icone } from '@/components/Icone';
import { mensagemDeErro } from '@/lib/api';

const esquema = z.object({
  email: z.string().email('Informe um e-mail válido.'),
  senha: z.string().min(1, 'Informe a senha.'),
});

type FormularioLogin = z.infer<typeof esquema>;

export function LoginPage() {
  const { entrar, autenticado } = useAuth();
  const navegar = useNavigate();
  const [parametros] = useSearchParams();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormularioLogin>({ resolver: zodResolver(esquema) });

  useEffect(() => {
    if (autenticado) navegar('/dashboard', { replace: true });
  }, [autenticado, navegar]);

  useEffect(() => {
    if (parametros.get('sessao') === 'expirada') {
      toast.info('Sua sessão expirou. Entre novamente.');
    }
  }, [parametros]);

  async function aoEnviar(dados: FormularioLogin) {
    try {
      const usuario = await entrar(dados.email, dados.senha);
      toast.success(`Bem-vindo(a), ${usuario.nome.split(' ')[0]}!`);
      navegar('/dashboard', { replace: true });
    } catch (erro) {
      toast.error(mensagemDeErro(erro, 'E-mail ou senha incorretos.'));
    }
  }

  return (
    <div className="tela-centralizada">
      <div className="cartao-auth vidro">
        <div style={{ textAlign: 'center' }}>
          <Icone nome="escudo" tamanho={36} className="icone tela-icone" />
          <h1 style={{ fontSize: '1.5rem' }}>ProCert</h1>
          <p className="texto-suave texto-pequeno">
            Plataforma de certificação de produtos
          </p>
        </div>

        <form className="formulario" onSubmit={handleSubmit(aoEnviar)} noValidate>
          <Campo label="E-mail" erro={errors.email?.message} obrigatorio>
            <input
              type="email"
              autoComplete="email"
              placeholder="seu@email.com.br"
              {...register('email')}
            />
          </Campo>

          <Campo label="Senha" erro={errors.senha?.message} obrigatorio>
            <input
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              {...register('senha')}
            />
          </Campo>

          <button type="submit" className="btn btn--primario" disabled={isSubmitting}>
            {isSubmitting ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <Link
          to="/esqueci-senha"
          className="texto-pequeno texto-suave"
          style={{ textAlign: 'center' }}
        >
          Esqueceu sua senha?
        </Link>

        <Link to="/" className="link-voltar texto-pequeno texto-fraco">
          <Icone nome="seta-esquerda" tamanho={16} />
          Voltar ao site
        </Link>
      </div>
    </div>
  );
}
