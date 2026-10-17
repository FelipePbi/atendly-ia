import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, test } from "vitest";

/**
 * D-181: o tema escuro e as cores de destaque só funcionam se toda cor passar
 * por um token. Uma cor literal nova num `avenly-*.css` ou num componente
 * fica igual em todos os temas — e some ou fica ilegível no escuro.
 */

const root = path.join(__dirname, "..");
const stylesDir = path.join(root, "src/shared/styles");

/** Onde a cor literal é a própria definição do token. */
const TOKEN_FILES = new Set(["tokens.css", "themes.css"]);

/**
 * Exceções com motivo. Cada uma precisa continuar existindo: a que some
 * falha, para levar a exceção junto.
 */
const ALLOWED: ReadonlyArray<{ file: string; literal: string; why: string }> = [
  {
    file: "src/shared/styles/avenly-pickers.css",
    literal: "#000",
    why: "máscara de opacidade do tambor de horas: só o alfa conta",
  },
  {
    file: "src/shared/styles/avenly-agenda.css",
    literal: "rgba(0, 0, 0, 0.35)",
    why: "sombra do nome branco sobre a cor do serviço, igual em todo tema",
  },
  {
    file: "src/features/imports/ImportOriginScreen.tsx",
    literal: "#6b3fe6",
    why: "logo da Minha Agenda, marca de terceiro",
  },
  {
    file: "src/features/imports/ImportOriginScreen.tsx",
    literal: "#fff",
    why: "logo da Minha Agenda, marca de terceiro",
  },
  {
    file: "src/app/layout.tsx",
    literal: "#f7f4ef",
    why: "cor da barra do navegador; vira por tema junto com o tema escuro",
  },
];

const LITERAL =
  /#[0-9a-fA-F]{3,8}\b|\brgba?\(\s*\d[^)]*\)|\bhsla?\(\s*\d[^)]*\)|(?<![-\w])(?:white|black)(?![-\w])/g;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

function literalsIn(file: string): string[] {
  const relative = path.relative(root, file).replaceAll("\\", "/");
  const source = readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
  return [...source.matchAll(LITERAL)]
    .map((match) => match[0])
    .filter((literal) => {
      // `white-space`, `black` em texto de interface e afins não são cor.
      if (/^(white|black)$/.test(literal) && file.endsWith(".tsx"))
        return false;
      return !ALLOWED.some(
        (allowed) => allowed.file === relative && allowed.literal === literal,
      );
    })
    .map((literal) => `${relative}: ${literal}`);
}

describe("D-181: cor só por token", () => {
  test("nenhuma folha de estilo além dos tokens declara cor literal", () => {
    const sheets = readdirSync(stylesDir)
      .filter((name) => name.endsWith(".css") && !TOKEN_FILES.has(name))
      .map((name) => path.join(stylesDir, name));
    expect(sheets.length).toBeGreaterThan(10);
    expect(sheets.flatMap(literalsIn)).toEqual([]);
  });

  test("nenhum componente declara cor literal", () => {
    const components = walk(path.join(root, "src")).filter(
      (file) =>
        file.endsWith(".tsx") &&
        // Espelho dos tokens para calcular contraste, comparado por teste.
        !file.endsWith("weekBarLabel.ts"),
    );
    expect(components.flatMap(literalsIn)).toEqual([]);
  });

  test("cada exceção ainda existe", () => {
    for (const allowed of ALLOWED) {
      expect(
        readFileSync(path.join(root, allowed.file), "utf8"),
        `${allowed.file}: ${allowed.why}`,
      ).toContain(allowed.literal);
    }
  });
});
