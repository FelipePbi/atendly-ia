/**
 * Goal131/WU-03 — o alvo de toque de "Mostrar senha" (critério 7): o gate
 * autenticado não alcança as credenciais, então o tamanho vem da regra de CSS
 * que o botão recebe. O ícone tem 20 px e a área tocável, 32 px; WCAG 2.5.8 AA
 * pede 24 px no mínimo.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

const css = readFileSync(
  resolve(__dirname, "../src/shared/styles/avenly-imports.css"),
  "utf8",
);

function rule(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`regra ${selector} ausente`);
  return css.slice(start, css.indexOf("}", start));
}

describe("alvo de toque de Mostrar senha", () => {
  test("a área tocável do botão tem 24 px no mínimo nos dois eixos", () => {
    const block = rule(".imports-credentials .field-action");
    const width = Number(/width:\s*(\d+)px/.exec(block)?.[1]);
    const height = Number(/height:\s*(\d+)px/.exec(block)?.[1]);
    expect(width).toBeGreaterThanOrEqual(24);
    expect(height).toBeGreaterThanOrEqual(24);
  });

  test("o ícone de 20 px cabe dentro da área tocável", () => {
    const block = rule(".imports-credentials .field-action .icon");
    const size = Number(/width:\s*(\d+)px/.exec(block)?.[1]);
    expect(size).toBe(20);
    expect(size).toBeLessThanOrEqual(
      Number(/width:\s*(\d+)px/.exec(rule(".imports-credentials .field-action"))?.[1]),
    );
  });
});

/**
 * Rodada 5: o campo do quadro 2.I2 é `height:52px` sem `box-sizing`, ou seja,
 * content-box: 52 px de conteúdo mais a borda de 1 px, 54 px por fora. O app
 * é border-box, então a altura declarada é 54 px (a convenção de
 * `.onboarding-form .field .input`). A máscara do quadro é
 * `letter-spacing:.2em` no `<span>` dos oito pontos; no app só o campo
 * mascarado leva o espaçamento, para o texto de "Mostrar senha" não mudar.
 */
describe("campo das credenciais igual ao quadro 2.I2", () => {
  test("o campo mede 54 px por fora, como o content-box de 52 px do quadro", () => {
    const block = rule(".imports-credentials .input");
    expect(/(?<![-\w])height:\s*54px/.exec(block)).not.toBeNull();
    expect(/min-height:\s*0\b/.exec(block)).not.toBeNull();
  });

  test("a máscara da senha tem letter-spacing de 0.2em só no campo mascarado", () => {
    const masked = rule('.imports-credentials .input[type="password"]');
    expect(/letter-spacing:\s*0?\.2em/.exec(masked)).not.toBeNull();
    expect(/letter-spacing/.exec(rule(".imports-credentials .input"))).toBeNull();
  });
});
