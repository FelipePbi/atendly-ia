import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, test } from "vitest";

/**
 * Validacao de 2026-10-12 no celular, tela da conversa:
 * - o cabecalho colava na borda de cima: `padding-top:
 *   env(safe-area-inset-top, 0px)` vale 0 sem notch e zerava o respiro;
 * - "Ao enviar uma mensagem, voce assume a conversa e a IA pausa aqui."
 *   quebrava em duas linhas.
 * jsdom nao faz layout; a medida real (360 e 390 px, uma linha, sem corte)
 * foi feita no navegador. Aqui fica a regra que garante isso.
 */
const css = readFileSync(
  path.join(__dirname, "../src/shared/styles/avenly-conversations.css"),
  "utf8",
);

function mobileBlocks(): string {
  return [...css.matchAll(/@media \(max-width: 767px\) \{([\s\S]*?)\n\}/g)]
    .map((match) => match[1])
    .join("\n");
}

describe("conversa no celular", () => {
  test("o cabecalho tem respiro proprio no topo, somado a area segura", () => {
    const mobile = mobileBlocks();
    expect(mobile).toMatch(
      /\.chat-header \{[^}]*padding: calc\(10px \+ env\(safe-area-inset-top, 0px\)\)/,
    );
    expect(mobile).not.toMatch(/\.chat-header \{[^}]*padding-top: env\(safe-area-inset-top/);
  });

  test("o aviso do composer fica em uma linha, com a fonte acompanhando a largura", () => {
    const mobile = mobileBlocks();
    expect(mobile).toMatch(/\.chat-composer-notice \{[^}]*white-space: nowrap/);
    expect(mobile).toMatch(/\.chat-composer-notice \{[^}]*font-size: clamp\(10px, 2\.85vw, 12px\)/);
  });
});

describe("menu de acoes da conversa", () => {
  // Validacao de 2026-10-12: "Marcar como pessoal" nao ocupava a largura toda
  // como "Ver contato" e "Voltar a usar na IA" (o hover parava no texto).
  test("o bloco de Marcar como pessoal estica a linha mesmo fechado", () => {
    expect(css).toMatch(/\.chat-sheet-personal \{\s*display: flex;\s*flex-direction: column;/);
  });
});
