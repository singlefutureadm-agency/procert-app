/**
 * Seletor de cor com alfa, montado sobre `<input type="color">`.
 *
 * O controle nativo não tem canal alfa, e metade dos tokens do tema é
 * translúcida (`--vidro-fundo`, `--texto-suave`, `--overlay-modal`) — sem alfa
 * o efeito de vidro não é configurável. Daí o par: nativo para o matiz, range
 * para a opacidade, compondo `rgba()` na saída.
 *
 * Nenhuma biblioteca: o projeto é CSS puro, e trazer um color picker para
 * resolver um slider seria desproporcional.
 */

interface Props {
  rotulo: string;
  valor: string;
  /** Quando false, emite hex puro (para tokens que nunca são translúcidos). */
  comAlfa?: boolean;
  aoAlterar: (valor: string) => void;
}

interface CorDecomposta {
  hex: string;
  alfa: number;
}

function decompor(valor: string): CorDecomposta {
  const texto = valor.trim();

  if (texto.startsWith('#')) {
    const hex = texto.slice(1);
    if (hex.length === 3) {
      const expandido = hex
        .split('')
        .map((c) => c + c)
        .join('');
      return { hex: `#${expandido}`, alfa: 1 };
    }
    if (hex.length === 8) {
      return { hex: `#${hex.slice(0, 6)}`, alfa: parseInt(hex.slice(6, 8), 16) / 255 };
    }
    return { hex: `#${hex.slice(0, 6)}`, alfa: 1 };
  }

  const partes = texto.match(/[\d.]+/g);
  if (!partes || partes.length < 3) return { hex: '#000000', alfa: 1 };

  const paraHex = (n: string) =>
    Math.max(0, Math.min(255, Math.round(Number(n))))
      .toString(16)
      .padStart(2, '0');

  return {
    hex: `#${paraHex(partes[0])}${paraHex(partes[1])}${paraHex(partes[2])}`,
    alfa: partes[3] === undefined ? 1 : Number(partes[3]),
  };
}

function compor(hex: string, alfa: number, comAlfa: boolean): string {
  if (!comAlfa || alfa >= 1) return hex;

  const n = hex.replace('#', '');
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);

  // Duas casas bastam e mantêm o valor dentro do regex aceito pelo servidor.
  return `rgba(${r}, ${g}, ${b}, ${Number(alfa.toFixed(2))})`;
}

export function CampoCor({ rotulo, valor, comAlfa = false, aoAlterar }: Props) {
  const { hex, alfa } = decompor(valor);

  return (
    <div className="campo-cor">
      <label className="campo-cor__rotulo" htmlFor={`cor-${rotulo}`}>
        {rotulo}
      </label>

      <div className="campo-cor__controles">
        <input
          id={`cor-${rotulo}`}
          type="color"
          className="campo-cor__seletor"
          value={hex}
          onChange={(e) => aoAlterar(compor(e.target.value, alfa, comAlfa))}
        />

        {comAlfa && (
          <input
            type="range"
            className="campo-cor__alfa"
            min={0}
            max={100}
            value={Math.round(alfa * 100)}
            aria-label={`Opacidade de ${rotulo}`}
            onChange={(e) => aoAlterar(compor(hex, Number(e.target.value) / 100, true))}
          />
        )}

        <code className="campo-cor__valor" title={valor}>
          {valor}
        </code>
      </div>
    </div>
  );
}
