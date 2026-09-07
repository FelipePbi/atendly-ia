import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import { env } from "../config/env.js";
import { AppError } from "./errors.js";

/**
 * Cifra da credencial da instância WhatsApp mantida pelo BFF.
 *
 * O envelope `v1.<keyId>.<iv>.<ciphertext>` é AES-256-GCM com dado associado
 * derivado do vínculo (`tenantId` + nome da instância): um envelope de outro
 * negócio não decifra no contexto errado, mesmo com a chave correta.
 *
 * Não existe chave global de fallback. Chave ausente, keyId desconhecido ou
 * envelope adulterado interrompem a operação — nunca degradam para texto puro.
 */
export const CREDENTIAL_ENVELOPE_VERSION = 1;

const ENVELOPE_PREFIX = `v${CREDENTIAL_ENVELOPE_VERSION}.`;

export interface CredentialBinding {
  tenantId: string;
  evolutionInstanceName: string;
}

export interface SealedCredential {
  envelope: string;
  keyId: string;
  version: number;
}

export function isSealedCredential(value: string): boolean {
  return value.startsWith(ENVELOPE_PREFIX) && value.split(".").length === 4;
}

export function credentialKeysConfigured(): boolean {
  return parseKeys(env.WHATSAPP_CREDENTIAL_KEYS).size > 0;
}

export function sealInstanceCredential(
  plaintext: string,
  binding: CredentialBinding,
): SealedCredential {
  const { keyId, key } = activeKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(associatedData(keyId, binding));
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const payload = Buffer.concat([ciphertext, cipher.getAuthTag()]);

  return {
    envelope: `${ENVELOPE_PREFIX}${keyId}.${iv.toString("base64url")}.${payload.toString("base64url")}`,
    keyId,
    version: CREDENTIAL_ENVELOPE_VERSION,
  };
}

export function openInstanceCredential(
  envelope: string,
  binding: CredentialBinding,
): string {
  const parts = envelope.split(".");
  if (parts.length !== 4 || parts[0] !== `v${CREDENTIAL_ENVELOPE_VERSION}`) {
    throw credentialError("Instance credential envelope is malformed.");
  }

  const [, keyId, ivPart, payloadPart] = parts;
  const key = keyById(keyId);
  const payload = Buffer.from(payloadPart, "base64url");
  if (payload.length <= 16) {
    throw credentialError("Instance credential envelope is malformed.");
  }

  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(ivPart, "base64url"),
    );
    decipher.setAAD(associatedData(keyId, binding));
    decipher.setAuthTag(payload.subarray(payload.length - 16));
    return Buffer.concat([
      decipher.update(payload.subarray(0, payload.length - 16)),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    // Mensagem única: adulteração, chave errada e vínculo errado não podem ser
    // distinguidos por quem chama.
    throw credentialError("Instance credential could not be decrypted.");
  }
}

/** Envelope cuja chave já não é a ativa precisa ser regravado na rotação. */
export function needsRotation(record: {
  credentialKeyId: string | null;
  credentialVersion: number;
}): boolean {
  if (record.credentialVersion < CREDENTIAL_ENVELOPE_VERSION) return true;
  if (!record.credentialKeyId) return true;
  return !constantTimeEquals(record.credentialKeyId, activeKey().keyId);
}

function activeKey(): { keyId: string; key: Buffer } {
  const keys = parseKeys(env.WHATSAPP_CREDENTIAL_KEYS);
  if (keys.size === 0) {
    throw credentialError(
      "WHATSAPP_CREDENTIAL_KEYS is not configured: the WhatsApp instance credential cannot be sealed or opened.",
    );
  }

  const configured = env.WHATSAPP_CREDENTIAL_ACTIVE_KEY_ID.trim();
  const keyId = configured || [...keys.keys()][0];
  const key = keys.get(keyId);
  if (!key) {
    throw credentialError(
      "WHATSAPP_CREDENTIAL_ACTIVE_KEY_ID does not name a configured key.",
    );
  }
  return { keyId, key };
}

function keyById(keyId: string): Buffer {
  const key = parseKeys(env.WHATSAPP_CREDENTIAL_KEYS).get(keyId);
  if (!key) {
    // Chave retirada antes de reencriptar o estoque: falha explícita, sem
    // tentar outra chave e sem cair na chave global.
    throw credentialError(
      "Instance credential was sealed with a key that is no longer configured.",
    );
  }
  return key;
}

function parseKeys(raw: string): Map<string, Buffer> {
  const keys = new Map<string, Buffer>();
  for (const entry of raw.split(",")) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const separator = trimmed.indexOf(":");
    if (separator <= 0) continue;
    const keyId = trimmed.slice(0, separator).trim();
    const material = Buffer.from(trimmed.slice(separator + 1).trim(), "base64");
    if (!keyId || material.length !== 32) continue;
    keys.set(keyId, material);
  }
  return keys;
}

function associatedData(keyId: string, binding: CredentialBinding): Buffer {
  return Buffer.from(
    `${ENVELOPE_PREFIX}${keyId}|${binding.tenantId}|${binding.evolutionInstanceName}`,
    "utf8",
  );
}

function constantTimeEquals(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function credentialError(message: string): AppError {
  return new AppError("CREDENTIAL_UNAVAILABLE", message, 503);
}
