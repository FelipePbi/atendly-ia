"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";

export type BrandSignature = "entry" | "check";

const SIGNATURE_STORAGE_KEY: Record<BrandSignature, string> = {
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
  if (storage.getItem(key) === "1") {
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
    <Link className="brand" href={href} aria-label="Atendly — Início">
      <BrandMark signature={signature} />
      {!compact && <span>Atendly</span>}
    </Link>
  );
}
