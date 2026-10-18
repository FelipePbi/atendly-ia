// @vitest-environment jsdom
/**
 * D-204: todo modal do app é um cartão flutuante centrado sobre o véu, em
 * qualquer largura — no celular também. O `Dialog` não tem mais as variantes
 * "sheet" (folha presa embaixo, com alça) e "drawer" (gaveta na lateral), e a
 * casca das folhas (`ChatSheetShell`) e o "Cancelar este agendamento?" deixam
 * de ser folha no celular. Layout real se confere no navegador; aqui ficam o
 * markup, o teclado, o axe e as regras de CSS que decidem a posição.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, test } from "vitest";

import { AgendaVisibleDaysSheet } from "@/features/agenda/AgendaVisibleDaysSheet";
import { Dialog } from "@/shared/ui/Dialog";

import { expectNoA11yViolations } from "./support/a11y";

const stylesDir = path.join(__dirname, "../src/shared/styles");
const styles = (file: string) =>
  readFileSync(path.join(stylesDir, file), "utf8");

function rule(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return css.match(new RegExp(`\\n${escaped} \\{([^}]*)\\}`))?.[1] ?? "";
}

function NameDialog() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} type="button">
        Editar nome
      </button>
      <Dialog
        eyebrow="Sua conta"
        onClose={() => setOpen(false)}
        open={open}
        title="Alterar nome"
      >
        <form>
          <label>
            Nome
            <input defaultValue="Ana" name="name" />
          </label>
          <div className="modal-actions">
            <button type="submit">Salvar</button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

describe("Dialog: sempre o modal centrado (D-204)", () => {
  test("abre como cartão .modal no véu .overlay, no body e sem alça de folha", async () => {
    const user = userEvent.setup();
    render(<NameDialog />);
    await user.click(screen.getByRole("button", { name: "Editar nome" }));

    const dialog = screen.getByRole("dialog", { name: "Alterar nome" });
    expect(dialog).toHaveClass("modal");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    const overlay = dialog.parentElement;
    expect(overlay).toHaveClass("overlay");
    expect(overlay?.parentElement).toBe(document.body);
    expect(overlay).not.toHaveClass("bottom-sheet-wrap");
    expect(overlay).not.toHaveClass("drawer-wrap");
    expect(document.querySelector(".sheet-handle")).toBeNull();
    await expectNoA11yViolations(document.body);
  });

  test("prende o foco, fecha com Esc e devolve o foco a quem abriu", async () => {
    const user = userEvent.setup();
    render(<NameDialog />);
    const trigger = screen.getByRole("button", { name: "Editar nome" });
    await user.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "Alterar nome" });
    expect(screen.getByRole("button", { name: "Fechar" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("textbox", { name: "Nome" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Salvar" })).toHaveFocus();
    await user.tab();
    // Volta ao primeiro: o foco não sai do cartão.
    expect(screen.getByRole("button", { name: "Fechar" })).toHaveFocus();
    expect(dialog.contains(document.activeElement)).toBe(true);

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  test("Tab não escapa por um grupo de rádios nem por um link no fim (bug visto no Ordenar clientes)", async () => {
    const user = userEvent.setup();
    render(
      <>
        <button type="button">Fora</button>
        <Dialog onClose={() => undefined} open title="Ordenar">
          <div aria-label="Ordenar por" role="radiogroup">
            <label>
              <input defaultChecked name="sort" type="radio" value="name" />
              Nome
            </label>
            <label>
              <input name="sort" type="radio" value="recent" />
              Recentes
            </label>
          </div>
          <a href="/clientes">Ver todos</a>
        </Dialog>
      </>,
    );
    const close = screen.getByRole("button", { name: "Fechar" });
    expect(close).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("radio", { name: "Nome" })).toHaveFocus();
    await user.tab();
    // Uma parada só para o grupo: o próximo é o link, não "Recentes".
    expect(screen.getByRole("link", { name: "Ver todos" })).toHaveFocus();
    await user.tab();
    expect(close).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole("link", { name: "Ver todos" })).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole("radio", { name: "Nome" })).toHaveFocus();
    expect(screen.getByRole("button", { name: "Fora" })).not.toHaveFocus();
  });

  test("um toque no véu fecha; dentro do cartão, não", async () => {
    const user = userEvent.setup();
    render(<NameDialog />);
    await user.click(screen.getByRole("button", { name: "Editar nome" }));

    const dialog = screen.getByRole("dialog", { name: "Alterar nome" });
    fireEvent.mouseDown(dialog);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.mouseDown(dialog.parentElement as HTMLElement);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("o CSS centra o cartão com margem, limita a altura pela tela visível e rola por dentro", () => {
    const base = styles("avenly.css");
    const overlay = rule(base, ".overlay");
    expect(overlay).toMatch(/position: fixed;/);
    expect(overlay).toMatch(/place-items: center;/);
    expect(overlay).toMatch(/padding: var\(--s5\);/);
    const modal = rule(base, ".modal");
    expect(modal).toMatch(/width: min\(100%, 480px\);/);
    expect(modal).toMatch(/max-height: min\(720px, calc\(100dvh - 40px\)\);/);
    expect(modal).toMatch(/overflow: auto;/);
    // Entrada com opacidade e transformação só (keyframe `rise`).
    expect(modal).toMatch(/animation: rise /);
  });

  test("nenhuma folha de baixo ou gaveta lateral sobra nas folhas de estilo", () => {
    for (const file of [
      "avenly.css",
      "avenly-agenda.css",
      "avenly-conversations.css",
      "avenly-imports.css",
      "avenly-motion.css",
      "avenly-notifications.css",
      "avenly-settings.css",
    ]) {
      const css = styles(file);
      expect(css, file).not.toMatch(
        /\.bottom-sheet|\.sheet-handle|\.drawer-wrap|\.drawer[\s:{,]|chat-sheet-handle|agenda-cancel-handle|@keyframes (sheet|drawer-in|at-sheet|motion-sheet-out) /,
      );
    }
    // A confirmação da importação e a central de notificações passaram a
    // escopar o `.modal`.
    expect(styles("avenly-imports.css")).toMatch(
      /\n\.modal:has\(\.imports-confirm\) \{/,
    );
    expect(styles("avenly-notifications.css")).toMatch(
      /\n\.modal:has\(\.notifications-drawer-body\) \{/,
    );
  });

  test("o 'Cancelar este agendamento?' também é cartão centrado no celular", () => {
    const agenda = styles("avenly-agenda.css");
    expect(rule(agenda, ".agenda-cancel-layer")).toMatch(
      /align-items: center;/,
    );
    const sheet = rule(agenda, ".agenda-cancel-sheet");
    expect(sheet).toMatch(/max-width: calc\(100% - 32px\);/);
    expect(sheet).toMatch(/border-radius: 20px;/);
    expect(sheet).not.toMatch(/24px 24px 0 0/);
  });
});

describe("ChatSheetShell: as folhas do app viram o mesmo cartão", () => {
  test("'Dias visíveis' abre centrado, sem alça, e passa no axe", async () => {
    render(
      <AgendaVisibleDaysSheet
        availableWeekdays={null}
        hiddenWeekdays={[0]}
        onClose={() => undefined}
        onSaved={() => undefined}
      />,
    );
    const dialog = screen.getByRole("dialog", { name: "Dias visíveis" });
    expect(dialog).toHaveClass("chat-sheet", "is-agenda-days");
    expect(dialog.parentElement).toHaveClass("chat-sheet-wrap");
    expect(dialog.querySelector(".chat-sheet-handle")).toBeNull();
    expect(dialog.contains(document.activeElement)).toBe(true);
    await expectNoA11yViolations(document.body);
  });
});
