/**
 * IA Loop — visual fidelity to the approved prototype.
 *
 * Until this existed, nobody in the loop could SEE a screen. The Developer
 * rebuilt an interface from a prose description of the prototype, the reviewer
 * read the diff, and "fidelidade visual" was left to a human check that never
 * happened — so a Goal whose whole point was "this screen as in the prototype"
 * was ACCEPTED with the screen still different (Goal 083, measured afterwards).
 *
 * `scripts/visual-compare.mjs` renders the prototype frame and the app route
 * at the same size and writes the pair, a diff and a side-by-side PNG inside
 * the worktree (`apps/frontend/e2e-results/visual/`, git-ignored). Both roles
 * have Read, and Read shows images: this file is what tells them to look.
 *
 * A Goal opts in with ONE line the planner writes:
 *
 *   Quadros do protótipo: A6, Agenda:A1, CL1
 *
 * Codes are the frame codes of the prototype (`_build/inventory.json`); a
 * code that exists in two pages is written `<Página>:<código>`. The harness
 * reads the line deterministically — no model decides whether a Goal is
 * visual.
 */

import { readFile } from 'node:fs/promises';

const FRAME_LINE = /^[\s>*_-]*Quadros do prot[óo]tipo\s*[:：]\s*(.+)$/imu;
const FRAME_CODE = /^(?:[A-Za-z][A-Za-z0-9-]*:)?[A-Za-z0-9]+(?:\.[A-Za-z0-9]+)*$/u;

/** The frame codes a Goal document declares, in order, without duplicates. */
export function extractPrototypeFrames(markdown) {
  if (typeof markdown !== 'string') return [];
  const match = FRAME_LINE.exec(markdown);
  if (!match) return [];
  const codes = match[1]
    .replace(/[`*_]/g, '')
    .split(/[,;]|\s+e\s+/u)
    .map((part) => part.trim().replace(/[.\s]+$/u, ''))
    .filter((part) => FRAME_CODE.test(part));
  return [...new Set(codes)];
}

export async function readPrototypeFrames(goalPath) {
  if (!goalPath) return [];
  try {
    return extractPrototypeFrames(await readFile(goalPath, 'utf8'));
  } catch {
    return [];
  }
}

function compareCommand(frames) {
  return `npm run visual:compare -- --target ${frames.join(',')}`;
}

const SHARED_RULES = [
  'Leia cada `side-by-side.png` com a ferramenta Read (ela mostra imagens): protótipo à esquerda (ou em cima),',
  'app no meio, diferenças em vermelho. Para detalhe, abra `prototype.png` e `app.png` em resolução cheia.',
  'São quatro devices por quadro: mobile 402×812, tablet-portrait 768×1024, tablet-landscape 1024×768, desktop 1366×768.',
  'O protótipo é a referência APROVADA. "Igual" quer dizer: mesma estrutura e ordem dos blocos, mesmos componentes',
  '(chip é chip, faixa de datas é faixa, botão de fechar é X), mesmas cores, tipografia (família, tamanho, peso),',
  'espaçamentos, raios, bordas, alinhamentos e textos de interface. Dados da conta (nomes, valores, datas) podem',
  'diferir; layout não. O REPORT.md lista em "Diferenças esperadas" o que é estado da conta de teste.',
  'A porcentagem do diff é tendência, não aprovação: uma tela com diff baixo e um componente errado continua errada.',
];

/**
 * The block a Developer prompt carries when the Goal declares frames and the
 * work touches the frontend.
 */
export function developerVisualInstructions(frames) {
  if (!frames?.length) return [];
  return [
    'FIDELIDADE VISUAL — OBRIGATÓRIO NESTE GOAL',
    `Quadros do protótipo deste Goal: ${frames.join(', ')}.`,
    'A referência não é descrição em texto: é o HTML/CSS do quadro em',
    'docs/design-reference/claude-design/prototype/project/<Página>.dc.html (versões -Tablet e -Desktop ao lado),',
    'o elemento com data-screen-label do quadro. PORTE esse markup: mesma hierarquia, mesmos valores de',
    'estilo inline (px, hex, fontes Literata/Hanken Grotesk, raios, sombras) traduzidos para o CSS do app.',
    'Não reinvente o layout a partir do nome do quadro.',
    '',
    `Antes de mexer, rode \`${compareCommand(frames)}\` na raiz da worktree e veja as imagens.`,
    'O comando leva alguns minutos (sobe o next dev): chame o Bash com timeout de 600000 ms. Use --device',
    'mobile (ou outro) para iterar mais rápido e rode os quatro devices antes de terminar.',
    'Depois de cada mudança relevante, rode de novo e compare. Repita até não haver divergência visível',
    'nos quatro devices. O comando sobe o próprio app (next dev) contra o BFF local e restaura os arquivos',
    'versionados que o next dev reescreve; ele grava só em apps/frontend/e2e-results/visual/ (ignorado pelo git).',
    ...SHARED_RULES,
    '',
    'No relatório, para cada quadro × device, diga o diff final e liste qualquer divergência que restou e por quê.',
    'Se o comando falhar por ambiente (BFF fora do ar), diga isso como limitação — não declare fidelidade sem ter visto.',
  ];
}

/** The block a review prompt carries when the Goal declares frames. */
export function reviewerVisualInstructions(frames) {
  if (!frames?.length) return [];
  return [
    'FIDELIDADE VISUAL — CRITÉRIO DE ACEITE DESTE GOAL',
    `Quadros do protótipo deste Goal: ${frames.join(', ')}.`,
    `Rode \`${compareCommand(frames)}\` na raiz da worktree (Bash com timeout de 600000 ms; leva alguns minutos).`,
    'Ele só escreve em apps/frontend/e2e-results/visual/',
    '(ignorado pelo git) e devolve os arquivos versionados que o next dev reescreve, então não altera a revisão.',
    'Abra com Read o side-by-side.png de CADA quadro × device. Não aceite com base no relatório do Developer:',
    'olhe as imagens.',
    ...SHARED_RULES,
    'Qualquer divergência visível de estrutura, componente, cor, tipografia ou espaçamento em relação ao protótipo',
    'é blocker: decisão CHANGES_REQUIRED, um blocker por divergência, dizendo quadro, device, o que o protótipo',
    'mostra e o que o app mostra. Fidelidade visual NÃO é mais conferência humana adiada: é verificada aqui.',
    'Se o comando não puder rodar (BFF local fora do ar), isso é blocker de ambiente — não aceite sem ver.',
  ];
}

/** Whether a unit's declared files put it on the frontend. */
export function touchesFrontend(unit) {
  const files = [...(unit?.expectedFiles ?? []), ...(unit?.relevantFiles ?? [])];
  return files.some((file) => String(file).replace(/\\/g, '/').startsWith('apps/frontend/'))
    || String(unit?.scope ?? '').replace(/\\/g, '/') === 'apps/frontend';
}
