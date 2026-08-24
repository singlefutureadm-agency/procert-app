import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { mensagemDeErro } from '@/lib/api';
import { contatoApi } from '../api';
import { CONTATO, EMPRESA } from '../conteudo';
import { Revelar } from '../Revelar';

/** Espelha o CriarMensagemContatoDto do backend, inclusive nos tamanhos. */
const esquema = z.object({
  nome: z.string().trim().min(3, 'Informe seu nome completo.').max(150),
  email: z.string().trim().email('Informe um e-mail válido.').max(150),
  telefone: z.string().trim().max(20, 'Telefone muito longo.').optional(),
  assunto: z.string().trim().min(3, 'Descreva o assunto.').max(200),
  mensagem: z
    .string()
    .trim()
    .min(10, 'A mensagem deve ter ao menos 10 caracteres.')
    .max(5000),
});

type FormularioContato = z.infer<typeof esquema>;

export function Contato() {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormularioContato>({ resolver: zodResolver(esquema) });

  const enviar = useMutation({
    mutationFn: contatoApi.enviar,
    onSuccess: (resposta) => {
      toast.success(resposta.mensagem);
      reset();
    },
    onError: (erro) =>
      toast.error(mensagemDeErro(erro, 'Não foi possível enviar sua mensagem.')),
  });

  function aoEnviar(dados: FormularioContato) {
    // `forbidNonWhitelisted` no servidor recusa campos vazios sem propósito:
    // telefone só vai quando preenchido.
    const { telefone, ...resto } = dados;
    enviar.mutate(telefone ? { ...resto, telefone } : resto);
  }

  return (
    <section id="contato" className="home__secao home__secao--suave">
      <Revelar className="home__container home__titulo-secao">
        <p className="home__titulo-secao-rotulo">{CONTATO.rotulo}</p>
        <h2>{CONTATO.titulo}</h2>
      </Revelar>

      <div className="home__container">
        <Revelar>
          <iframe
            className="home__mapa"
            src={EMPRESA.mapaUrl}
            title={`Localização da ${EMPRESA.nome}`}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            allowFullScreen
          />
        </Revelar>

        <div className="home__contato-grade">
          <div>
            {CONTATO.informacoes.map((info, indice) => (
              <Revelar
                key={info.titulo}
                className="home__contato-info"
                atraso={100 * (indice + 1)}
              >
                <i className={`bi ${info.icone}`} aria-hidden />
                <div>
                  <h3>{info.titulo}</h3>
                  <p>{info.texto}</p>
                </div>
              </Revelar>
            ))}
          </div>

          <Revelar atraso={200}>
            <form className="home__formulario" onSubmit={handleSubmit(aoEnviar)} noValidate>
              <div>
                <label htmlFor="contato-nome">Nome</label>
                <input id="contato-nome" autoComplete="name" {...register('nome')} />
                {errors.nome && (
                  <span className="home__formulario-erro">{errors.nome.message}</span>
                )}
              </div>

              <div>
                <label htmlFor="contato-email">E-mail</label>
                <input
                  id="contato-email"
                  type="email"
                  autoComplete="email"
                  {...register('email')}
                />
                {errors.email && (
                  <span className="home__formulario-erro">{errors.email.message}</span>
                )}
              </div>

              <div>
                <label htmlFor="contato-telefone">Telefone (opcional)</label>
                <input
                  id="contato-telefone"
                  autoComplete="tel"
                  placeholder="(11) 91234-5678"
                  {...register('telefone')}
                />
                {errors.telefone && (
                  <span className="home__formulario-erro">{errors.telefone.message}</span>
                )}
              </div>

              <div>
                <label htmlFor="contato-assunto">Assunto</label>
                <input id="contato-assunto" {...register('assunto')} />
                {errors.assunto && (
                  <span className="home__formulario-erro">{errors.assunto.message}</span>
                )}
              </div>

              <div className="home__formulario-campo--largo">
                <label htmlFor="contato-mensagem">Mensagem</label>
                <textarea id="contato-mensagem" rows={6} {...register('mensagem')} />
                {errors.mensagem && (
                  <span className="home__formulario-erro">{errors.mensagem.message}</span>
                )}
              </div>

              <div className="home__formulario-acoes">
                <button type="submit" disabled={enviar.isPending}>
                  {enviar.isPending ? 'Enviando...' : 'Enviar mensagem'}
                </button>
              </div>
            </form>
          </Revelar>
        </div>
      </div>
    </section>
  );
}
