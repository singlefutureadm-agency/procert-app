import { POLITICA_PRIVACIDADE } from './conteudo-legal';
import { PaginaLegal } from './PaginaLegal';

export function PoliticaPrivacidadePage() {
  return <PaginaLegal documento={POLITICA_PRIVACIDADE} caminho="/politica-de-privacidade" />;
}
