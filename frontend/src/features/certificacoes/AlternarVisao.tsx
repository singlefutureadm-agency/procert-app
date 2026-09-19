import { NavLink } from 'react-router-dom';

import { Icone } from '@/components/Icone';

/**
 * Alternador Lista | Quadro, no topo das duas telas de certificação.
 *
 * `NavLink` e não botão com `navigate`: são duas ROTAS, e cada uma precisa ser
 * compartilhável, abrível em nova aba e alcançável pelo histórico. Um botão que
 * troca estado interno perderia as três coisas.
 *
 * Renderizado só para a equipe — o quadro é visão interna e o cliente recebe
 * 403 na rota. Quem decide isso é quem monta o cabeçalho, não este componente.
 */
export function AlternarVisaoCertificacoes({
  atual,
}: {
  atual: 'lista' | 'quadro';
}) {
  return (
    <div
      className="alternar-visao"
      role="group"
      aria-label="Forma de visualizar as certificações"
    >
      <NavLink
        to="/certificacoes"
        end
        className="alternar-visao__opcao"
        // `aria-current` diz qual está ativa para o leitor de tela; a classe
        // sozinha só comunica a quem enxerga a cor.
        aria-current={atual === 'lista' ? 'page' : undefined}
      >
        <Icone nome="lista" />
        Lista
      </NavLink>

      <NavLink
        to="/processos/quadro"
        className="alternar-visao__opcao"
        aria-current={atual === 'quadro' ? 'page' : undefined}
      >
        <Icone nome="quadro" />
        Quadro
      </NavLink>
    </div>
  );
}
