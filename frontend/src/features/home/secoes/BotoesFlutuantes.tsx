import { EMPRESA } from '../conteudo';
import { useRolagem } from '../hooks';

export function BotoesFlutuantes() {
  const rolou = useRolagem(120);

  const linkWhatsapp = `https://wa.me/${EMPRESA.whatsapp}?text=${encodeURIComponent(
    EMPRESA.whatsappMensagem,
  )}`;

  return (
    <>
      <a
        href={linkWhatsapp}
        className="home__whatsapp"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Fale conosco pelo WhatsApp"
        title="Fale conosco pelo WhatsApp"
      >
        <i className="bi bi-whatsapp" aria-hidden />
      </a>

      <button
        type="button"
        className={`home__topo ${rolou ? 'home__topo--visivel' : ''}`}
        aria-label="Voltar ao topo"
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      >
        <i className="bi bi-arrow-up-short" aria-hidden />
      </button>
    </>
  );
}
