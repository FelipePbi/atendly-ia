import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { z } from "zod";

import { env } from "../../config/env.js";
import { AppError } from "../../shared/errors/app-error.js";

const encryptedEnvelopeSchema = z.object({
  version: z.literal(1),
  iv: z.string().min(1),
  authTag: z.string().min(1),
  ciphertext: z.string().min(1),
});

function encryptionKey(): Buffer {
  const key = Buffer.from(env.INTEGRATION_CREDENTIALS_KEY, "base64");
  if (key.length !== 32) {
    throw new AppError(
      "CONFIGURATION_ERROR",
      "INTEGRATION_CREDENTIALS_KEY must be a base64-encoded 32-byte key.",
      500,
    );
  }
  return key;
}

export function encryptIntegrationCredentials(
  tenantId: string,
  value: unknown,
): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(tenantId, "utf8"));
  const plaintext = Buffer.from(JSON.stringify(value), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const envelope = {
    version: 1 as const,
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
  return Buffer.from(JSON.stringify(envelope), "utf8");
}

export function decryptIntegrationCredentials(
  tenantId: string,
  value: Uint8Array,
): unknown {
  try {
    const envelope = encryptedEnvelopeSchema.parse(
      JSON.parse(Buffer.from(value).toString("utf8")),
    );
    const decipher = createDecipheriv(
      "aes-256-gcm",
      encryptionKey(),
      Buffer.from(envelope.iv, "base64"),
    );
    decipher.setAAD(Buffer.from(tenantId, "utf8"));
    decipher.setAuthTag(Buffer.from(envelope.authTag, "base64"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, "base64")),
      decipher.final(),
    ]);
    return JSON.parse(plaintext.toString("utf8"));
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      "INTEGRATION_CREDENTIALS_INVALID",
      "Stored integration credentials could not be decrypted.",
      500,
    );
  }
}
