import { useRef, useState } from 'react';
import { toast } from 'sonner';

import type { Estado } from '@/types';
import { apenasDigitos, buscarCep, CepIndisponivelError, cepCompleto } from './cep';

/**
 * Preenche logradouro, bairro, cidade e UF a partir do CEP.
 *
 * Dispara sozinho quando o campo chega a oito dígitos, em vez de esperar o
 * `blur`: quem digita CEP costuma seguir direto para o número da casa, e o
 * preenchimento chegaria depois de a pessoa já ter digitado o endereço à mão.
 *
 * **Não sobrescreve campo já preenchido.** Trocar o CEP de um cadastro antigo
 * não pode apagar um complemento ou uma correção de bairro feita à mão — e
 * alguns CEPs de logradouro único voltam sem rua, o que zeraria o campo.
 *
 * O `setValue` genérico evita acoplar o hook aos dois formulários que o usam:
 * cliente e funcionário têm esquemas diferentes, mas os mesmos cinco campos de
 * endereço.
 */

export interface CamposEndereco {
  endereco?: string;
  bairro?: string;
  cidade?: string;
  estadoId?: string;
}

interface Opcoes {
  /** `setValue` do react-hook-form, estreitado para os campos de endereço. */
  definir: (campo: keyof CamposEndereco, valor: string) => void;
  /** Valor atual de cada campo, para não sobrescrever o que já foi digitado. */
  valorAtual: (campo: keyof CamposEndereco) => string | undefined;
  /** Lista de UFs, para converter a sigla do ViaCEP no id da tabela. */
  estados: Estado[] | undefined;
}

export function usePreencherPorCep({ definir, valorAtual, estados }: Opcoes) {
  const [consultando, setConsultando] = useState(false);
  // Evita repetir a consulta enquanto a pessoa continua editando um CEP que já
  // foi buscado — apagar e redigitar o último dígito, por exemplo. Guarda só os
  // dígitos: com a máscara, "01310100" e "01310-100" são o mesmo CEP.
  const ultimoConsultado = useRef<string | null>(null);

  // Sem `useCallback` de propósito: `definir` e `valorAtual` chegam como
  // funções inline dos formulários e mudam a cada render, então a memoização
  // seria recalculada sempre — daria a impressão de identidade estável sem
  // entregá-la. Nada aqui depende dessa identidade.
  const consultar =
    async (cep: string) => {
      const digitos = apenasDigitos(cep);
      if (!cepCompleto(cep) || digitos === ultimoConsultado.current) return;
      ultimoConsultado.current = digitos;

      setConsultando(true);
      try {
        const achado = await buscarCep(cep);

        const preencher = (campo: keyof CamposEndereco, valor: string) => {
          if (valor && !valorAtual(campo)?.trim()) definir(campo, valor);
        };

        preencher('endereco', achado.endereco);
        preencher('bairro', achado.bairro);
        preencher('cidade', achado.cidade);

        const uf = estados?.find((estado) => estado.sigla === achado.uf);
        if (uf) preencher('estadoId', String(uf.id));
      } catch (erro) {
        // Serviço fora do ar não vira erro na cara do usuário: o formulário
        // continua preenchível à mão, e um toast vermelho sugeriria que algo
        // que ele fez deu errado.
        if (erro instanceof CepIndisponivelError) {
          ultimoConsultado.current = null; // permite tentar de novo
          return;
        }
        toast.error(erro instanceof Error ? erro.message : 'CEP não encontrado.');
      } finally {
        setConsultando(false);
      }
    };

  return { consultar, consultando };
}
