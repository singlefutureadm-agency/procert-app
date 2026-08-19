import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';

import { Campo } from '@/components/Campo';
import { Icone } from '@/components/Icone';
import { api, mensagemDeErro } from '@/lib/api';

const esquema = z.object({
  email: z.string().email('Informe um e-mail válido.'),
});

type Formulario = z.infer<typeof esquema>;

export function EsqueciSenhaPage() {
  const [enviado, setEnviado] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Formulario>({ resolver: zodResolver(esquema) });

  async function aoEnviar(dados: Formulario) {
    try {
      await api.post('/auth/esqueci-senha', dados);
      setEnviado(true);
    } catch (erro) {
      toast.error(mensagemDeErro(erro));
    }
  }

  return (
    <div className="tela-centralizada">
      <div className="cartao-auth vidro">
        <h1 style={{ fontSize: '1.4rem' }}>Recuperar acesso</h1>

        {enviado ? (
          <>
            <p className="texto-suave">
              Se este e-mail estiver cadastrado, você receberá as instruções em
              instantes. O link expira em 1 hora.
            </p>
            <Link to="/login" className="btn btn--primario">
              Voltar ao login
            </Link>
          </>
        ) : (
          <>
            <p className="texto-suave texto-pequeno">
              Informe o e-mail cadastrado e enviaremos um link para você criar
              uma nova senha.
            </p>

            <form className="formulario" onSubmit={handleSubmit(aoEnviar)} noValidate>
              <Campo label="E-mail" erro={errors.email?.message} obrigatorio>
                <input type="email" autoComplete="email" {...register('email')} />
              </Campo>

              <button type="submit" className="btn btn--primario" disabled={isSubmitting}>
                {isSubmitting ? 'Enviando...' : 'Enviar link'}
              </button>
            </form>

            <Link to="/login" className="link-voltar texto-pequeno texto-suave">
              <Icone nome="seta-esquerda" tamanho={16} />
              Voltar ao login
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
