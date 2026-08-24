import { useId, useRef, useState } from 'react';
import { toast } from 'sonner';

import {
  formatarBytes,
  ImagemInvalidaError,
  PERFIL,
  prepararImagem,
  type OpcoesImagem,
} from '@/lib/imagem';

interface Props {
  rotulo: string;
  dica?: string;
  /** Mesmo formato do atributo `accept` do input. */
  aceita: string;
  aoEscolher: (arquivo: File | null) => void;
  /**
   * Redimensiona e recomprime a imagem antes de entregá-la (padrão: ligado).
   * Passe `false` para arquivos que precisam subir intactos — um PDF de
   * evidência, por exemplo, que este componente não deve tocar.
   */
  otimizar?: boolean | OpcoesImagem;
}

/**
 * Seletor de arquivo com botão próprio.
 *
 * O `<input type="file">` cru desenha o botão e o texto "nenhum arquivo
 * selecionado" com legendas do NAVEGADOR, no idioma dele — num Chrome
 * configurado em pt-PT o painel inteiro em pt-BR exibia *"Escolher ficheiro /
 * Nenhum ficheiro selecionado"* no meio do formulário. Também não há como
 * estilizá-lo: ele ignora os tokens de tema.
 *
 * A saída é a mesma que `features/aparencia/CampoImagem` já usava: o input fica
 * `hidden` e um `<button>` normal dispara o seletor. O nome do arquivo passa a
 * ser texto nosso, e o `aria-describedby` liga o botão a ele — senão o leitor
 * de tela anuncia "Escolher arquivo" sem dizer qual está escolhido.
 */
export function CampoArquivo({
  rotulo,
  dica,
  aceita,
  aoEscolher,
  otimizar = true,
}: Props) {
  const entrada = useRef<HTMLInputElement>(null);
  const [nome, setNome] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const id = useId();
  const idEstado = `${id}-estado`;

  async function selecionar(arquivo: File | null) {
    if (!arquivo) {
      setNome(null);
      aoEscolher(null);
      return;
    }

    const querOtimizar = otimizar !== false && arquivo.type.startsWith('image/');
    if (!querOtimizar) {
      setNome(arquivo.name);
      aoEscolher(arquivo);
      return;
    }

    setOcupado(true);
    try {
      const opcoes = typeof otimizar === 'object' ? otimizar : PERFIL;
      const pronto = await prepararImagem(arquivo, opcoes);
      setNome(pronto.name);
      aoEscolher(pronto);

      // Só avisa quando houve ganho de verdade — um "reduzida de 900 KB para
      // 880 KB" é ruído.
      if (arquivo.size - pronto.size > 256 * 1024) {
        toast.success(
          `Imagem otimizada: ${formatarBytes(arquivo.size)} → ${formatarBytes(pronto.size)}.`,
        );
      }
    } catch (erro) {
      setNome(null);
      aoEscolher(null);
      toast.error(
        erro instanceof ImagemInvalidaError
          ? erro.message
          : 'Não foi possível preparar a imagem.',
      );
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="campo">
      <span className="campo__rotulo">{rotulo}</span>

      <div className="campo-arquivo">
        <input
          ref={entrada}
          type="file"
          accept={aceita}
          hidden
          onChange={(evento) => {
            const arquivo = evento.target.files?.[0] ?? null;
            // Permite reescolher o mesmo arquivo depois de remover. Precisa
            // acontecer antes do await: o input é reaproveitado pelo React e
            // limpá-lo depois apagaria uma escolha já feita.
            evento.target.value = '';
            void selecionar(arquivo);
          }}
        />

        <button
          type="button"
          className="btn btn--pequeno"
          aria-describedby={idEstado}
          disabled={ocupado}
          onClick={() => entrada.current?.click()}
        >
          {nome ? 'Trocar arquivo' : 'Escolher arquivo'}
        </button>

        <span
          className="texto-pequeno texto-suave campo-arquivo__nome"
          id={idEstado}
          role="status"
        >
          {ocupado ? 'Preparando imagem…' : (nome ?? 'Nenhum arquivo escolhido')}
        </span>

        {nome && (
          <button
            type="button"
            className="btn btn--pequeno"
            onClick={() => void selecionar(null)}
          >
            Remover
          </button>
        )}
      </div>

      {dica && <span className="texto-pequeno texto-fraco">{dica}</span>}
    </div>
  );
}
