"use client";

import { useState } from "react";

/**
 * Foto de perfil do WhatsApp da cliente, por cima das iniciais do avatar
 * (decisão de 2026-10-15). O BFF busca a foto sob demanda e responde `204`
 * quando não há foto; a imagem que não carrega some e as iniciais, que ficam
 * por baixo, aparecem. O navegador guarda a resposta pelo `cache-control` do
 * BFF, então a tela não volta a pedir a mesma foto a cada render.
 */
export function ContactPhoto({ src }: { src: string | null }) {
  const [failed, setFailed] = useState<string | null>(null);
  // A foto aparece com fade sobre as iniciais quando termina de carregar, em
  // vez de surgir de uma vez (2026-10-16).
  const [loaded, setLoaded] = useState<string | null>(null);
  if (!src || failed === src) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- bytes do proxy do BFF, com cookie de sessão; sem otimização remota aplicável.
    <img
      alt=""
      className={loaded === src ? "contact-photo is-loaded" : "contact-photo"}
      decoding="async"
      loading="lazy"
      onError={() => setFailed(src)}
      onLoad={() => setLoaded(src)}
      src={src}
    />
  );
}

/** Rota da foto pela pessoa do Scheduling; sem id, sem foto. */
export function customerPhotoUrl(customerId: string | null | undefined) {
  return bffUrl(
    customerId && `/v1/customers/${encodeURIComponent(customerId)}/avatar`,
  );
}

/**
 * Rota da foto pela conversa: a do cliente quando a conversa já tem pessoa
 * vinculada (mesma URL, mesmo cache do navegador), senão a do contato.
 */
export function conversationPhotoUrl(conversation: {
  id: string;
  customerId?: string | null;
}) {
  return conversation.customerId
    ? customerPhotoUrl(conversation.customerId)
    : bffUrl(`/v1/conversations/${encodeURIComponent(conversation.id)}/avatar`);
}

function bffUrl(path: string | null | undefined): string | null {
  const base = process.env.NEXT_PUBLIC_BFF_URL?.trim().replace(/\/+$/u, "");
  return base && path ? `${base}${path}` : null;
}
