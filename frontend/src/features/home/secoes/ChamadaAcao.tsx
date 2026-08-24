import { CHAMADA_ACAO } from '../conteudo';
import { Revelar } from '../Revelar';

export function ChamadaAcao() {
  return (
    <section id="chamada" className="home__cta">
      {/* O legado usava position:fixed nesta imagem, criando um efeito parallax
          que vazava sobre as outras seções em telas curtas. Aqui ela fica
          contida na própria seção. */}
      <img
        src={CHAMADA_ACAO.imagem.src}
        alt={CHAMADA_ACAO.imagem.alt}
        className="home__cta-fundo"
        loading="lazy"
      />

      <Revelar className="home__container">
        <h2>{CHAMADA_ACAO.titulo}</h2>
        <p>{CHAMADA_ACAO.texto}</p>
        <a className="home__cta-botao" href="#contato">
          {CHAMADA_ACAO.botao}
        </a>
      </Revelar>
    </section>
  );
}
