// @vitest-environment jsdom
/**
 * Goal068/WU-01 — marca em SVG de três traços (sem caixa, sem pseudo-elemento,
 * sem segunda cor) e favicon novo em SVG, com os assets mortos removidos.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { Brand } from "@/shared/ui/Brand";

const appDir = path.join(__dirname, "..");

describe("Brand — marca v4", () => {
  test("renderiza svg aria-hidden com os três traços do Marca.dc.html e stroke=currentColor", () => {
    render(<Brand />);

    const link = screen.getByRole("link", { name: "Avenly, Início" });
    const svg = link.querySelector("svg.brand-mark");

    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveAttribute("viewBox", "0 0 64 64");
    expect(svg).toHaveAttribute("stroke", "currentColor");
    expect(svg).toHaveAttribute("fill", "none");

    const paths = svg!.querySelectorAll("path");
    expect(paths).toHaveLength(3);
    expect(paths[0]).toHaveAttribute("d", "M6 56L28 9L40.85 36.5");
    expect(paths[1]).toHaveAttribute("d", "M44.7 44.8L50 56");
    expect(paths[2]).toHaveAttribute("d", "M25.5 38L32 44.5L58 21");

    for (const p of Array.from(paths)) {
      expect(p).not.toHaveAttribute("stroke");
      expect(p).not.toHaveAttribute("fill");
    }
  });

  test("link mantém apenas um elemento .brand-mark, sem span de caixa", () => {
    render(<Brand />);

    const link = screen.getByRole("link", { name: "Avenly, Início" });
    const marks = link.querySelectorAll(".brand-mark");

    expect(marks).toHaveLength(1);
    expect(marks[0].tagName).toBe("svg");
  });

  test("avenly.css não tem regra .brand-mark com pseudo-elemento, caixa ou pontos", () => {
    const css = readFileSync(
      path.join(appDir, "src/shared/styles/avenly.css"),
      "utf8",
    );

    expect(css).not.toMatch(/\.brand-mark::before/);
    expect(css).not.toMatch(/\.brand-mark::after/);
    expect(css).not.toMatch(/\.brand-mark\s*\{[^}]*background/);
    expect(css).not.toMatch(/\.brand-mark\s*\{[^}]*border-radius/);
    expect(css).not.toMatch(/\.brand-mark\s*\{[^}]*box-shadow/);
  });
});

describe("Favicon v4", () => {
  test("layout.tsx declara /brand/avenly-icon.svg e o arquivo existe", () => {
    const layoutSource = readFileSync(
      path.join(appDir, "src/app/layout.tsx"),
      "utf8",
    );

    expect(layoutSource).toContain("/brand/avenly-icon.svg");
    expect(layoutSource).not.toContain("atendly-favicon-32x32.png");

    const iconPath = path.join(appDir, "public/brand/avenly-icon.svg");
    expect(existsSync(iconPath)).toBe(true);
  });

  test("os quatro PNGs antigos de public/brand não existem mais", () => {
    const oldAssets = [
      "public/brand/atendly-favicon-32x32.png",
      "public/brand/atendly-favicon-512x512.png",
      "public/brand/atendly-logo-horizontal.png",
      "public/brand/atendly-logo-icon.png",
    ];

    for (const relative of oldAssets) {
      expect(existsSync(path.join(appDir, relative))).toBe(false);
    }
  });

  test("os cinco SVGs de exemplo do Next saíram de public/", () => {
    const sampleAssets = [
      "public/file.svg",
      "public/globe.svg",
      "public/next.svg",
      "public/vercel.svg",
      "public/window.svg",
    ];

    for (const relative of sampleAssets) {
      expect(existsSync(path.join(appDir, relative))).toBe(false);
    }
  });
});
