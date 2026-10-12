"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";

export type BrandSignature = "entry" | "check";

const SIGNATURE_STORAGE_KEY: Record<BrandSignature, string> = {
  entry: "avenly:brand-signature-entry",
  check: "avenly:brand-signature-check",
};

// Chaves anteriores à troca de marca (Goal109): quem já viu a assinatura sob
// elas não a vê de novo.
const LEGACY_SIGNATURE_STORAGE_KEY: Record<BrandSignature, string> = {
  entry: "atendly:brand-signature-entry",
  check: "atendly:brand-signature-check",
};

function prefersReducedMotion(): boolean {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function readSessionStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

// Consome a sessão na primeira leitura: quem chamar de novo (segunda
// montagem na mesma sessão) já encontra a chave marcada e não anima.
function resolveShouldAnimate(signature?: BrandSignature): boolean {
  if (!signature || prefersReducedMotion()) {
    return false;
  }
  const storage = readSessionStorage();
  if (!storage) {
    return false;
  }
  const key = SIGNATURE_STORAGE_KEY[signature];
  if (
    storage.getItem(key) === "1" ||
    storage.getItem(LEGACY_SIGNATURE_STORAGE_KEY[signature]) === "1"
  ) {
    return false;
  }
  storage.setItem(key, "1");
  return true;
}

function subscribeNever() {
  return () => {};
}

function getServerAnimateSnapshot() {
  return false;
}

export function BrandMark({ signature }: { signature?: BrandSignature }) {
  // useSyncExternalStore, não useEffect+setState: a decisão vem de
  // sessionStorage/matchMedia (fora do React), o servidor sempre vê o
  // símbolo parado, e o valor do cliente é lido e travado uma única vez.
  const [getSnapshot] = useState(() => {
    let cached: boolean | null = null;
    return () => {
      if (cached === null) {
        cached = resolveShouldAnimate(signature);
      }
      return cached;
    };
  });

  const animate = useSyncExternalStore(
    subscribeNever,
    getSnapshot,
    getServerAnimateSnapshot,
  );
  const animateLeg = animate && signature === "entry";
  const animateCheck = animate;

  return (
    <svg
      className={animate ? `brand-mark brand-mark--${signature}` : "brand-mark"}
      viewBox="0 0 64 64"
      fill="none"
      stroke="currentColor"
      strokeWidth={6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path
        className={animateLeg ? "brand-mark-leg" : undefined}
        pathLength={animateLeg ? 100 : undefined}
        d="M6 56L28 9L40.85 36.5"
      />
      <path
        className={animateLeg ? "brand-mark-leg-rest" : undefined}
        pathLength={animateLeg ? 100 : undefined}
        d="M44.7 44.8L50 56"
      />
      <path
        className={animateCheck ? "brand-mark-check" : undefined}
        pathLength={animateCheck ? 100 : undefined}
        d="M25.5 38L32 44.5L58 21"
      />
    </svg>
  );
}

export function Brand({
  href = "/inicio",
  compact = false,
  signature,
}: {
  href?: string;
  compact?: boolean;
  signature?: BrandSignature;
}) {
  return (
    <Link className="brand" href={href} aria-label="Avenly, Início">
      <BrandMark signature={signature} />
      {!compact && <span>Avenly</span>}
    </Link>
  );
}

/**
 * Carregamento de tela inteira: o "A" da Avenly cresce e diminui no centro
 * da viewport, com ondas por baixo. O texto fica só para leitor de tela.
 *
 * É uma camada fixa sobre a página (não um `<main>`): no primeiro
 * carregamento a tela monta por baixo dele e ele sai (`leaving`, 160 ms)
 * quando a primeira leitura dela terminou (D-168, revisão de 2026-10-12).
 * O mesmo elemento fica no DOM da verificação da sessão até a saída, para a
 * respiração do símbolo não recomeçar no meio.
 */
export function BrandLoader({
  label,
  leaving = false,
}: {
  label: string;
  leaving?: boolean;
}) {
  return (
    <div
      className={
        leaving ? "brand-loader-screen is-leaving" : "brand-loader-screen"
      }
      aria-busy={leaving ? undefined : "true"}
      aria-hidden={leaving ? "true" : undefined}
      data-splash={leaving ? "leaving" : "covering"}
    >
      <div role="status" aria-live="polite">
        <span className="brand-loader-mark">
          <svg
            className="brand-loader"
            viewBox="0 0 64 64"
            fill="none"
            stroke="currentColor"
            strokeWidth={6}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M6 56L28 9L40.85 36.5" />
            <path d="M44.7 44.8L50 56" />
            <path d="M25.5 38L32 44.5L58 21" />
          </svg>
        </span>
        <span className="sr-only">{label}</span>
      </div>
    </div>
  );
}
