import { TERMOS_DE_USO } from './conteudo-legal';
import { PaginaLegal } from './PaginaLegal';

export function TermosDeUsoPage() {
  return <PaginaLegal documento={TERMOS_DE_USO} caminho="/termos-de-uso" />;
}
