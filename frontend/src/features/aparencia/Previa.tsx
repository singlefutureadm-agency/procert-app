import type { CSSProperties, ReactNode } from 'react';

import { propriedadesDoTema } from '@/lib/tema';
import type { TokensTema } from '@/types';

/**
 * Prévias por grupo de tokens.
 *
 * O painel inteiro já se repinta ao vivo, mas isso só mostra o que está na
 * tela — e a tela de Aparência não tem badge, timeline nem modal. Cada prévia
 * traz para perto do controle os elementos que aquele grupo afeta.
 *
 * As prévias montam as custom properties num container próprio em vez de ler
 * do `:root`. Custa um pouco mais, e paga: dá para mostrar o modo claro ao lado
 * do escuro, e a prévia continua correta mesmo antes do preview global rodar.
 */

interface PropsCaixa {
  tokens: TokensTema;
  fonteId?: string;
  /** Pinta o fundo do container com o gradiente do tema. */
  comFundo?: boolean;
  titulo?: string;
  children: ReactNode;
}

export function CaixaPrevia({
  tokens,
  fonteId,
  comFundo = true,
  titulo,
  children,
}: PropsCaixa) {
  const estilo = {
    ...propriedadesDoTema(tokens, fonteId),
    ...(comFundo
      ? { background: tokens.fundo, backgroundImage: 'var(--fundo-gradiente)' }
      : {}),
    color: tokens.texto,
    fontFamily: 'var(--fonte)',
    borderRadius: 'var(--raio)',
  } as CSSProperties;

  return (
    <div className="previa" style={estilo}>
      {titulo && <span className="previa__titulo">{titulo}</span>}
      <div className="previa__conteudo">{children}</div>
    </div>
  );
}

/** Botões e badges — o que a cor primária e as semânticas realmente pintam. */
export function PreviaCores({ tokens, fonteId }: { tokens: TokensTema; fonteId: string }) {
  return (
    <CaixaPrevia tokens={tokens} fonteId={fonteId}>
      <div className="previa__linha">
        <button type="button" className="btn btn--primario" disabled>
          Salvar
        </button>
        <button type="button" className="btn" disabled>
          Cancelar
        </button>
        <button type="button" className="btn btn--perigo" disabled>
          Excluir
        </button>
      </div>

      <div className="previa__linha">
        <span className="badge badge--pendente">Pendente</span>
        <span className="badge badge--andamento">Em andamento</span>
        <span className="badge badge--aprovado">Aprovado</span>
        <span className="badge badge--reprovado">Reprovado</span>
      </div>

      <div className="previa__linha">
        <div className="progresso" style={{ flex: 1 }}>
          <div className="progresso__barra" style={{ width: '62%' }} />
        </div>
        <span className="texto-pequeno texto-suave">62%</span>
      </div>
    </CaixaPrevia>
  );
}

/** O gradiente da página, sem nada por cima que atrapalhe a leitura. */
export function PreviaFundo({ tokens, fonteId }: { tokens: TokensTema; fonteId: string }) {
  return (
    <CaixaPrevia tokens={tokens} fonteId={fonteId}>
      <div className="previa__linha">
        <span className="texto-suave texto-pequeno">
          Base, tom do meio e os dois brilhos radiais, como aparecem na página.
        </span>
      </div>
    </CaixaPrevia>
  );
}

/** Os três níveis de texto na hierarquia em que aparecem no painel. */
export function PreviaTexto({ tokens, fonteId }: { tokens: TokensTema; fonteId: string }) {
  return (
    <CaixaPrevia tokens={tokens} fonteId={fonteId}>
      <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Capacete de segurança classe B</h3>
      <p className="texto-suave" style={{ margin: '4px 0 0', fontSize: '0.92rem' }}>
        Trilha de certificação em andamento — 4 de 7 etapas aprovadas.
      </p>
      <p className="texto-fraco texto-pequeno" style={{ margin: '4px 0 0' }}>
        Atualizado há 3 dias por Ana Ribeiro
      </p>
      <div className="previa__linha" style={{ marginTop: 4 }}>
        <button type="button" className="btn btn--primario btn--pequeno" disabled>
          Botão primário
        </button>
        <span className="texto-pequeno texto-fraco">
          texto sobre a cor primária
        </span>
      </div>
    </CaixaPrevia>
  );
}

/** Card de vidro sobre o fundo: é aqui que blur, borda e sombra aparecem. */
export function PreviaVidro({ tokens, fonteId }: { tokens: TokensTema; fonteId: string }) {
  return (
    <CaixaPrevia tokens={tokens} fonteId={fonteId}>
      <div className="vidro" style={{ padding: 16 }}>
        <div className="card-metrica__valor">128</div>
        <div className="card-metrica__rotulo">Produtos em certificação</div>
      </div>

      <div className="vidro" style={{ padding: '10px 14px' }}>
        <div className="campo">
          <label>Campo de formulário</label>
          <input readOnly value="Texto de exemplo" />
        </div>
      </div>
    </CaixaPrevia>
  );
}

/** Raio e desfoque, nos elementos onde a diferença é visível. */
export function PreviaMedidas({
  tokens,
  fonteId,
}: {
  tokens: TokensTema;
  fonteId: string;
}) {
  return (
    <CaixaPrevia tokens={tokens} fonteId={fonteId}>
      <div className="vidro" style={{ padding: 14 }}>
        <div className="previa__linha">
          <button type="button" className="btn btn--primario btn--pequeno" disabled>
            Botão
          </button>
          <span className="badge badge--aprovado">Badge</span>
          <span className="texto-pequeno texto-fraco">
            raio {tokens.raio}px · pequeno {tokens.raioSm}px · blur {tokens.vidroBlur}px
          </span>
        </div>
      </div>
    </CaixaPrevia>
  );
}

/** Pangrama para julgar a fonte, com os pesos que o painel usa. */
export function PreviaFonte({ tokens, fonteId }: { tokens: TokensTema; fonteId: string }) {
  return (
    <CaixaPrevia tokens={tokens} fonteId={fonteId}>
      <div style={{ fontSize: '1.3rem', fontWeight: 700 }}>
        Certificação de conformidade
      </div>
      <div style={{ fontSize: '0.95rem', fontWeight: 550 }}>
        Zebras caolhas de Java querem passar fixo pelo whisky.
      </div>
      <div className="texto-suave" style={{ fontSize: '0.85rem' }}>
        0123456789 — ABNT NBR 15836 · R$ 1.240,00 · 12/08/2026
      </div>
    </CaixaPrevia>
  );
}

/** Os dois modos lado a lado, para conferir a paridade entre eles. */
export function PreviaModos({
  temaClaro,
  temaEscuro,
  fonteId,
}: {
  temaClaro: TokensTema;
  temaEscuro: TokensTema;
  fonteId: string;
}) {
  return (
    <div className="previa__lado-a-lado">
      <CaixaPrevia tokens={temaEscuro} fonteId={fonteId} titulo="Escuro">
        <ConteudoResumo />
      </CaixaPrevia>
      <CaixaPrevia tokens={temaClaro} fonteId={fonteId} titulo="Claro">
        <ConteudoResumo />
      </CaixaPrevia>
    </div>
  );
}

function ConteudoResumo() {
  return (
    <div className="vidro" style={{ padding: 14, display: 'grid', gap: 10 }}>
      <strong style={{ fontSize: '0.95rem' }}>Painel ProCert</strong>
      <div className="previa__linha">
        <span className="badge badge--aprovado">Aprovado</span>
        <span className="badge badge--reprovado">Reprovado</span>
      </div>
      <div className="previa__linha">
        <button type="button" className="btn btn--primario btn--pequeno" disabled>
          Emitir
        </button>
        <button type="button" className="btn btn--pequeno" disabled>
          Voltar
        </button>
      </div>
      <span className="texto-fraco texto-pequeno">Metadado secundário</span>
    </div>
  );
}
