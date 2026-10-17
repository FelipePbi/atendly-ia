import type { FastifyReply, FastifyRequest } from "fastify";

import { EvolutionClient } from "../../clients/evolution/index.js";
import { env } from "../../config/env.js";
import { normalizeWhatsappPhone } from "../../lib/phone.js";
import { currentTenantContext } from "../../lib/tenant-context.js";
import {
  findLinkedInstance,
  resolveInstanceCredential,
} from "./instance-link.js";

/**
 * Foto de perfil do WhatsApp de uma cliente, buscada sob demanda e nunca
 * gravada (decisão de 2026-10-15). O BFF pede o link à Evolution, baixa a
 * miniatura e devolve os bytes: o navegador nunca fala com a CDN do WhatsApp e
 * o link assinado, que expira, não sai daqui.
 *
 * Só em memória e por pouco tempo, para não repetir a consulta ao WhatsApp a
 * cada tela: foto achada por algumas horas, "sem foto" por alguns minutos — a
 * foto escondida pode aparecer depois da primeira conversa. Poucas consultas
 * ao mesmo tempo, porque uma lista inteira de clientes não pode virar uma
 * rajada de consultas de perfil no número da profissional.
 */
export interface ContactPhoto {
  body: Buffer;
  contentType: string;
}

export const PHOTO_TTL_MS = 6 * 60 * 60 * 1000;
export const MISSING_TTL_MS = 10 * 60 * 1000;
const MAX_ENTRIES = 1_000;
const MAX_CONCURRENT_LOOKUPS = 3;
const MAX_PHOTO_BYTES = 512 * 1024;

/** Tempo que o navegador guarda a resposta, com e sem foto. */
const BROWSER_PHOTO_MAX_AGE_S = 24 * 60 * 60;
const BROWSER_MISSING_MAX_AGE_S = MISSING_TTL_MS / 1000;

interface Entry {
  photo: ContactPhoto | null;
  expiresAt: number;
}

export class ContactPhotoCache {
  private readonly entries = new Map<string, Entry>();
  private readonly inflight = new Map<string, Promise<ContactPhoto | null>>();
  private active = 0;
  private readonly waiting: (() => void)[] = [];

  constructor(
    private readonly now: () => number = Date.now,
    private readonly onError: (error: unknown) => void = () => {},
  ) {}

  async get(
    key: string,
    load: () => Promise<ContactPhoto | null>,
  ): Promise<ContactPhoto | null> {
    const cached = this.entries.get(key);
    if (cached && cached.expiresAt > this.now()) return cached.photo;

    const running = this.inflight.get(key);
    if (running) return running;

    const pending = this.limited(load)
      .catch((error: unknown) => {
        this.onError(error);
        return null;
      })
      .then((photo) => {
        this.store(key, photo);
        return photo;
      })
      .finally(() => this.inflight.delete(key));
    this.inflight.set(key, pending);
    return pending;
  }

  private store(key: string, photo: ContactPhoto | null) {
    this.entries.delete(key);
    if (this.entries.size >= MAX_ENTRIES) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    this.entries.set(key, {
      photo,
      expiresAt: this.now() + (photo ? PHOTO_TTL_MS : MISSING_TTL_MS),
    });
  }

  private async limited<T>(task: () => Promise<T>): Promise<T> {
    if (this.active >= MAX_CONCURRENT_LOOKUPS) {
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    }
    this.active += 1;
    try {
      return await task();
    } finally {
      this.active -= 1;
      this.waiting.shift()?.();
    }
  }
}

/**
 * Baixa a imagem do link devolvido pela Evolution. O destino é a origem da CDN
 * de fotos de perfil do WhatsApp, fixada em configuração: do link só servem o
 * caminho e a assinatura, e link de outra origem é recusado sem requisição.
 * Sem redirecionamento, e só imagem pequena.
 */
export async function downloadContactPhoto(
  url: string,
): Promise<ContactPhoto | null> {
  let link: URL;
  try {
    link = new URL(url);
  } catch {
    return null;
  }
  if (link.origin !== new URL(env.WHATSAPP_PROFILE_PHOTO_ORIGIN).origin)
    return null;

  const response = await fetch(
    new URL(`${link.pathname}${link.search}`, env.WHATSAPP_PROFILE_PHOTO_ORIGIN),
    {
      redirect: "error",
      signal: AbortSignal.timeout(env.INTERNAL_HTTP_TIMEOUT_MS),
    },
  );
  const contentType = response.headers.get("content-type") ?? "";
  if (!response.ok || !contentType.startsWith("image/")) return null;

  const body = Buffer.from(await response.arrayBuffer());
  if (body.length === 0 || body.length > MAX_PHOTO_BYTES) return null;
  return { body, contentType };
}

const evolution = new EvolutionClient();
let sharedCache: ContactPhotoCache | undefined;

function cache(request: FastifyRequest): ContactPhotoCache {
  sharedCache ??= new ContactPhotoCache(Date.now, (error) =>
    request.log.warn({ err: error }, "contact photo lookup failed"),
  );
  return sharedCache;
}

/**
 * Responde a rota de foto de uma cliente pelo telefone ou JID do contato.
 * Sem foto — telefone ausente, número sem WhatsApp conectado, foto escondida
 * ou erro na consulta — é `204`, e a tela fica com as iniciais.
 */
export async function replyContactPhoto(
  request: FastifyRequest,
  reply: FastifyReply,
  contact: string | null | undefined,
) {
  const phone = contact ? normalizeWhatsappPhone(contact) : "";
  const tenant = currentTenantContext(request);
  const photo = phone
    ? await cache(request).get(`${tenant.tenantId}:${phone}`, async () => {
        const instance = await findLinkedInstance(tenant);
        if (!instance || instance.status !== "CONNECTED") return null;
        const credential = await resolveInstanceCredential(instance);
        const url = await evolution.getAvatarUrl(credential, phone, request.id);
        return url ? downloadContactPhoto(url) : null;
      })
    : null;

  if (!photo) {
    return reply
      .code(204)
      .header("cache-control", `private, max-age=${BROWSER_MISSING_MAX_AGE_S}`)
      .send();
  }
  return reply
    .header("content-type", photo.contentType)
    .header("cache-control", `private, max-age=${BROWSER_PHOTO_MAX_AGE_S}`)
    .send(photo.body);
}
