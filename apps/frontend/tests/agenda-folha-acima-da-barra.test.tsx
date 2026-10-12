// @vitest-environment jsdom
/**
 * Bug de 2026-10-12, no celular: a folha "O que você quer adicionar?" (+ Novo)
 * aparecia cortada, com "Bloquear horário" pela metade, coberta pela barra
 * inferior do app (Início / Conversas / Agenda / Clientes / Mais).
 *
 * Causa comum: a folha era renderizada dentro da página, e o invólucro de
 * transição da página (`.motion-page`, com `view-transition-name`) cria um
 * contexto de empilhamento no nível 0. O z-index de diálogo da folha (500)
 * valia só dentro dele, e a barra inferior (z-index 50, irmã do `main`)
 * pintava por cima. A folha de ações de bloqueio (D-166) e o mini calendário
 * usam a mesma casca (`ChatSheetShell`) e tinham o mesmo problema.
 *
 * Correção: `ChatSheetShell` vai para o `body` por portal; a folha fica acima
 * da barra e o escurecido a cobre. A medida real foi feita no navegador
 * (390x844 e 360x740, com a barra inferior): o último item das três folhas
 * fica inteiro e visível, e o ponto no centro da barra cai no escurecido.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { ChatSheetShell } from "@/features/conversations/ConversationActionsSheet";

import { expectNoA11yViolations } from "./support/a11y";

const styles = (file: string) =>
  readFileSync(path.join(__dirname, "../src/shared/styles", file), "utf8");

const tokens = styles("tokens.css");
const base = styles("avenly.css");
const conversations = styles("avenly-conversations.css");

function zToken(name: string): number {
  const match = tokens.match(new RegExp(`--${name}:\\s*(\\d+);`));
  if (!match) throw new Error(`token ${name} não encontrado`);
  return Number(match[1]);
}

describe("a folha fica acima da barra inferior (bug de 2026-10-12)", () => {
  test("o z-index da folha é o de diálogo, acima do da barra inferior", () => {
    const wrap = conversations.match(/\.chat-sheet-wrap \{([^}]*)\}/)?.[1] ?? "";
    expect(wrap).toMatch(/position: fixed;/);
    expect(wrap).toMatch(/z-index: var\(--at-z-dialog\);/);

    const nav = base.match(
      /@media \(max-width: 1099px\) \{[\s\S]*?:where\(\.app-frame > nav\) \{([^}]*)\}/,
    )?.[1];
    const navZ = Number(nav?.match(/z-index: (\d+);/)?.[1]);
    expect(navZ).toBeGreaterThan(0);
    expect(zToken("at-z-dialog")).toBeGreaterThan(navZ);
  });

  test("o pé da folha no celular respeita a área segura", () => {
    const sheet = conversations.match(/\n\.chat-sheet \{([^}]*)\}/)?.[1] ?? "";
    expect(sheet).toMatch(/bottom: 0;/);
    expect(sheet).toMatch(
      /padding: [^;]*max\(46px, calc\(12px \+ env\(safe-area-inset-bottom, 0px\)\)\);/,
    );
  });

  test("a folha é montada no body, fora de qualquer contexto de empilhamento da página", async () => {
    const { container } = render(
      <div className="motion-page" style={{ viewTransitionName: "page-content" }}>
        <ChatSheetShell onClose={() => undefined} title="O que você quer adicionar?">
          <a href="/agenda/bloquear">Bloquear horário</a>
        </ChatSheetShell>
      </div>,
    );

    const dialog = screen.getByRole("dialog", {
      name: "O que você quer adicionar?",
    });
    const wrap = dialog.parentElement;
    expect(wrap).toHaveClass("chat-sheet-wrap");
    expect(wrap?.parentElement).toBe(document.body);
    expect(container.querySelector(".chat-sheet-wrap")).toBeNull();
    expect(screen.getByRole("link", { name: "Bloquear horário" })).toHaveFocus();
    await expectNoA11yViolations(document.body);
  });

  test("os campos sem classe dentro da folha mantêm a aparência de campo fora da casca", () => {
    expect(base).toMatch(/:where\(\s*:is\(\.app-frame, \.chat-sheet\)\s*:is\(/);
    expect(base).toMatch(
      /:where\(:is\(\.app-frame, \.chat-sheet\) textarea:not\(\[class\]\)\)/,
    );
  });
});
