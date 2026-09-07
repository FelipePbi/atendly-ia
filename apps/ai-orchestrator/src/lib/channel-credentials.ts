import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { env } from "../config/env.js";
import { AppError } from "./errors.js";

/**
 * Cifra da projeção da credencial de instância guardada pela IA.
 *
 * A IA não é dona do segredo: ela recebe a projeção do BFF pelo canal interno
 * autenticado com a credencial de provisionamento e a guarda cifrada, ligada ao
 * vínculo (`tenantId` + instância externa) pelo dado associado do AES-GCM. Um
 * envelope copiado para o vínculo de outro negócio não abre.
 *
 * Não há chave global de fallback: falha de chave, de versão ou de vínculo
 * impede o envio.
 */
export const CHANNEL_CREDENTIAL_VERSION = 1;

const ENVELOPE_PREFIX = `v${CHANNEL_CREDENTIAL_VERSION}.`;

export interface ChannelCredentialBinding {
  tenantId: string;
  externalInstanceId: string;
}

export interface SealedChannelCredential {
  envelope: string;
  keyId: string;
  version: number;
}

export function sealChannelCredential(
  plaintext: string,
  binding: ChannelCredentialBinding,
): SealedChannelCredential {
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
    version: CHANNEL_CREDENTIAL_VERSION,
  };
}

export function openChannelCredential(
  envelope: string,
  binding: ChannelCredentialBinding,
): string {
  const parts = envelope.split(".");
  if (parts.length !== 4 || parts[0] !== `v${CHANNEL_CREDENTIAL_VERSION}`) {
    throw credentialError("Channel credential envelope is malformed.");
  }

  const [, keyId, ivPart, payloadPart] = parts;
  const key = keyById(keyId);
  const payload = Buffer.from(payloadPart, "base64url");
  if (payload.length <= 16) {
    throw credentialError("Channel credential envelope is malformed.");
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
    throw credentialError("Channel credential could not be decrypted.");
  }
}

export function channelCredentialKeysConfigured(): boolean {
  return parseKeys(env.CHANNEL_CREDENTIAL_KEYS).size > 0;
}

export function activeChannelKeyId(): string {
  return activeKey().keyId;
}

function activeKey(): { keyId: string; key: Buffer } {
  const keys = parseKeys(env.CHANNEL_CREDENTIAL_KEYS);
  if (keys.size === 0) {
    throw credentialError(
      "CHANNEL_CREDENTIAL_KEYS is not configured: the channel credential cannot be sealed or opened.",
    );
  }

  const configured = env.CHANNEL_CREDENTIAL_ACTIVE_KEY_ID.trim();
  const keyId = configured || [...keys.keys()][0];
  const key = keys.get(keyId);
  if (!key) {
    throw credentialError(
      "CHANNEL_CREDENTIAL_ACTIVE_KEY_ID does not name a configured key.",
    );
  }
  return { keyId, key };
}

function keyById(keyId: string): Buffer {
  const key = parseKeys(env.CHANNEL_CREDENTIAL_KEYS).get(keyId);
  if (!key) {
    throw credentialError(
      "Channel credential was sealed with a key that is no longer configured.",
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

function associatedData(
  keyId: string,
  binding: ChannelCredentialBinding,
): Buffer {
  return Buffer.from(
    `${ENVELOPE_PREFIX}${keyId}|${binding.tenantId}|${binding.externalInstanceId}`,
    "utf8",
  );
}

function credentialError(message: string): AppError {
  return new AppError(message, {
    statusCode: 503,
    code: "CHANNEL_CREDENTIAL_UNAVAILABLE",
  });
}
