# Avisos de terceiros

Complemento obrigatório do [`LICENSE`](LICENSE). A reserva de direitos daquele
arquivo cobre a obra da Single Future e **não** alcança o que está listado aqui:
cada item abaixo é regido pela sua própria licença, que prevalece quanto àquele
material.

Levantamento feito em **04/09/2026**, sobre a árvore de dependências resolvida
nesta data. **Refaça o inventário a cada mudança de dependência** — o método
está na última seção.

---

## 1. Panorama

Contagem de pacotes por licença, separando o que é **distribuído** (produção) do
que só participa da construção (`devDependencies`). A distinção importa: licença
recíproca em ferramenta de build não alcança o produto entregue; em dependência
de produção, alcançaria.

### `backend/` — 343 pacotes de produção, 567 apenas de desenvolvimento

| Licença | Produção | Só desenvolvimento |
|---|---:|---:|
| MIT | 287 | 457 |
| ISC | 20 | 41 |
| Apache-2.0 | 16 | 25 |
| BSD-3-Clause | 5 | 21 |
| BSD-2-Clause | 4 | 13 |
| MIT/X11 | 2 | — |
| BlueOak-1.0.0 | — | 5 |
| `(MIT OR GPL-3.0-or-later)` | 1 | — |
| 0BSD | 1 | — |
| Unlicense | 1 | 2 |
| MIT-0 | 1 | — |
| Python-2.0 | 1 | — |
| `(MIT AND Zlib)` | 1 | — |
| `(MIT OR CC0-1.0)` | — | 2 |
| CC-BY-4.0 | — | 1 |
| **Sem declaração no `package.json`** | **3** | — |

### `frontend/` — 47 pacotes de produção, 314 apenas de desenvolvimento

| Licença | Produção | Só desenvolvimento |
|---|---:|---:|
| MIT | 46 | 243 |
| ISC | — | 23 |
| Apache-2.0 | — | 20 |
| BSD-2-Clause | — | 8 |
| BlueOak-1.0.0 | — | 8 |
| BSD-3-Clause | — | 7 |
| 0BSD | 1 | — |
| MIT-0 | — | 2 |
| Python-2.0 | — | 1 |
| CC-BY-4.0 | — | 1 |
| CC0-1.0 | — | 1 |

**Nenhuma licença copyleft recíproca (GPL, AGPL, LGPL, MPL, EPL, SSPL, BUSL) foi
encontrada em produção nem em desenvolvimento, nos dois pacotes.** Todo o
inventário é permissivo — MIT, ISC, Apache-2.0, BSD e equivalentes —, compatível
com distribuição proprietária mediante preservação dos avisos de copyright, que
é o que este arquivo faz.

---

## 2. Pontos que exigiram verificação individual

### `jszip@3.10.1` — `(MIT OR GPL-3.0-or-later)`

Dupla licença, com escolha do licenciado. **Fica registrada aqui a opção pela
MIT**, que não impõe reciprocidade. Chega por `exceljs` → `unzipper` → `jszip`.

### Três pacotes sem campo `license` no `package.json` publicado

Nenhum é dependência direta; todos entram por transitividade.

| Pacote | Caminho | Situação |
|---|---|---|
| `png-js@1.1.0` | `pdfkit` → `png-js` | **Resolvido.** Sem o campo, mas com `LICENSE` no tarball: MIT, © 2017 Devon Govett. |
| `pause@0.0.1` | `passport` → `pause` | **Resolvido.** Sem o campo e sem arquivo, mas o `Readme.md` publicado traz o texto integral da MIT, © 2012 TJ Holowaychuk. |
| `buffers@0.1.1` | `exceljs` → `unzipper` → `binary` → `buffers` | **Em aberto.** O tarball publicado não declara licença em lugar nenhum: nem campo, nem arquivo, nem README. Ver §4. |

### Fontes

`Inter`, `Poppins`, `Raleway` e `Roboto` são carregadas do Google Fonts em tempo
de execução (`index.html` e `features/aparencia/fontes.ts`). **Não são
redistribuídas** por este repositório — nenhum arquivo de fonte está versionado
—, então não há obrigação de distribuição da SIL OFL / Apache-2.0 a cumprir
aqui. Vendorizar qualquer uma delas muda esse quadro e passa a exigir o aviso
correspondente.

### `bootstrap-icons@1.13.1` — MIT

Único ativo de terceiros **redistribuído** com o produto: a fonte de ícones vai
no bundle do site institucional. MIT, © 2019–2024 The Bootstrap Authors. O aviso
de copyright é preservado por esta seção, que é o que a licença exige.

O painel administrativo não o carrega — usa `components/Icone.tsx`, desenho
próprio.

---

## 3. Materiais que NÃO pertencem à Single Future

Estão neste repositório e ficam expressamente fora da reserva de direitos do
`LICENSE`.

### 3.1 Template visual do site institucional

`frontend/src/features/home/home.css` é, conforme o cabeçalho do próprio
arquivo, uma reprodução do tema **"Gp", da BootstrapMade**, herdado do sistema
PHP legado. As classes de grid e os utilitários do Bootstrap foram substituídos
por implementação própria, mas a estrutura visual e o layout derivam do
template.

A licença aplicável é a do fornecedor, e ela distingue duas situações: a versão
gratuita exige a manutenção do link de atribuição no rodapé; remover esse link
depende de adquirir a licença que o autoriza.

**O rodapé atual não traz atribuição à BootstrapMade** — o espaço é ocupado por
"Desenvolvido por Single Future" (`features/home/secoes/RodapeSite.tsx`). Ver §4.

### 3.2 Marca, conteúdo e documentos do organismo certificador

Titularidade do cliente, não da Single Future:

- `frontend/public/documentos/*.pdf` — sete documentos públicos do OCP (manual da
  qualidade, política de imparcialidade, concessão e manutenção, entre outros);
- `frontend/public/img/logo.png`, `logo-branco.png`, `favicon.png`,
  `apple-touch-icon.png` — marca;
- os textos institucionais de `features/home/conteudo.ts` e
  `conteudo-paginas.ts`, mantidos do legado palavra por palavra.

O rodapé do site já declara `© Copyright ProCert Todos os Direitos Reservados`
sobre esse conteúdo, o que é coerente com esta seção.

### 3.3 Imagens de demonstração

`frontend/public/img/` — `hero-bg.jpg`, `about.jpg`, `services.jpg`,
`cta-bg.jpg`, `stats-img.jpg`, `depoimentos-bg.png` e `depoimentos/*.jpg`.

Vieram do legado sem reprocessamento e **sem registro de procedência**. As cinco
fotos de depoimento retratam pessoas e trazem metadados XMP da Adobe, padrão de
banco de imagens. Não há nota fiscal, licença ou termo de cessão no repositório
que ampare a redistribuição de nenhuma delas. Ver §4.

---

## 4. Pendências de conformidade

Itens que a auditoria encontrou em aberto. Nenhum impede a adoção do `LICENSE`;
todos são anteriores a ele e apenas ficam visíveis agora que existe uma
declaração formal de titularidade.

| # | Item | Risco | Encaminhamento |
|---|---|---|---|
| 1 | Fotos de depoimento e imagens de fundo sem procedência (§3.3) | **Alto.** Foto de banco de imagens sem licença é o vetor mais comum de notificação extrajudicial em site institucional. Aqui elas ilustram depoimentos com nomes fictícios, o que agrava. | Localizar a licença do template ou do banco; não havendo, substituir por imagem própria ou de licença rastreável. |
| 2 | Atribuição da BootstrapMade removida do rodapé (§3.1) | **Médio.** Depende de qual licença do template foi adquirida. | Confirmar a aquisição; não havendo, restaurar o link ou comprar a licença de remoção. |
| 3 | `buffers@0.1.1` sem licença declarada (§2) | **Baixo.** O repositório de origem indica MIT, mas o pacote publicado não declara nada — e é o publicado que se distribui. | Acompanhar; sai da árvore quando `exceljs` atualizar a cadeia `unzipper` → `binary`. |
| 4 | Repositório **público** sob licença proprietária | **Médio.** O `LICENSE` afasta a leitura de "sem licença = pode usar", mas não retira o código de vista. Soma-se a isto o `DEPLOY.md`, que descreve a infraestrutura de produção. | Avaliar tornar o repositório privado. |
| 5 | Contribuições sem cessão registrada | **Médio.** O histórico tem duas autorias (`git shortlog -sne`). A titularidade da Seção 1 do `LICENSE` pressupõe vínculo empregatício ou cessão escrita de cada uma. | Confirmar vínculo ou formalizar cessão. |

---

## 5. Como refazer este inventário

```bash
# em cada pacote (backend/ e frontend/), as duas listas:
npm ls --all --parseable --omit=dev   # árvore distribuída
npm ls --all --parseable              # árvore completa
```

A diferença entre as duas listas é o conjunto `devDependencies`, e é ela que
separa as duas colunas da §1. A licença de cada pacote sai do campo `license` do
`package.json` dele dentro de `node_modules`, **com recurso ao arquivo `LICENSE`
e ao README quando o campo falta** — foi assim que dois dos três casos da §2 se
resolveram. Um inventário que lê apenas o campo declara "sem licença" onde há
licença, e por isso perde de vista justamente o caso que merece atenção.
