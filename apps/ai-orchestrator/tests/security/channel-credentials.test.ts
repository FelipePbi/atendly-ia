import { randomBytes } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

const KEY_V1 = randomBytes(32).toString("base64");
const KEY_V2 = randomBytes(32).toString("base64");
const SYNTHETIC_CREDENTIAL = "wa_synthetic_instance_credential_0001";

const bindingA = { tenantId: "tenant-a", externalInstanceId: "instance-a" };
const bindingB = { tenantId: "tenant-b", externalInstanceId: "instance-b" };

// `config/env.js` congela process.env na avaliação do módulo, então cada
// configuração de chave exige recarregar a cadeia. Chaves e credencial são
// sintéticas: nenhum segredo real entra na fixture.
async function loadCipher(keys: string, activeKeyId = "") {
  vi.resetModules();
  vi.stubEnv("CHANNEL_CREDENTIAL_KEYS", keys);
  vi.stubEnv("CHANNEL_CREDENTIAL_ACTIVE_KEY_ID", activeKeyId);
  return import("../../src/lib/channel-credentials.js");
}

const bothKeys = () => `v1:${KEY_V1},v2:${KEY_V2}`;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("channel credential envelope", () => {
  it("round-trips under the same binding", async () => {
    const cipher = await loadCipher(bothKeys(), "v1");
    const sealed = cipher.sealChannelCredential(SYNTHETIC_CREDENTIAL, bindingA);

    expect(sealed.version).toBe(1);
    expect(sealed.keyId).toBe("v1");
    expect(sealed.envelope).not.toContain(SYNTHETIC_CREDENTIAL);
    expect(cipher.openChannelCredential(sealed.envelope, bindingA)).toBe(
      SYNTHETIC_CREDENTIAL,
    );
  });

  it("does not open the envelope of A under the binding of B", async () => {
    const cipher = await loadCipher(bothKeys(), "v1");
    const sealed = cipher.sealChannelCredential(SYNTHETIC_CREDENTIAL, bindingA);

    expect(() =>
      cipher.openChannelCredential(sealed.envelope, bindingB),
    ).toThrowError(/could not be decrypted/u);
    expect(() =>
      cipher.openChannelCredential(sealed.envelope, {
        tenantId: "tenant-a",
        externalInstanceId: "instance-b",
      }),
    ).toThrowError(/could not be decrypted/u);
  });

  it("rejects a tampered or malformed envelope", async () => {
    const cipher = await loadCipher(bothKeys(), "v1");
    const sealed = cipher.sealChannelCredential(SYNTHETIC_CREDENTIAL, bindingA);
    const parts = sealed.envelope.split(".");
    const payload = parts[3] ?? "";
    const tampered = [
      parts[0],
      parts[1],
      parts[2],
      `${payload.slice(0, -2)}${payload.endsWith("AA") ? "BB" : "AA"}`,
    ].join(".");

    expect(() => cipher.openChannelCredential(tampered, bindingA)).toThrowError(
      /could not be decrypted/u,
    );
    expect(() =>
      cipher.openChannelCredential("not-an-envelope", bindingA),
    ).toThrowError(/malformed/u);
  });

  it("rotates to the active key while the previous key still opens old envelopes", async () => {
    const withV1Cipher = await loadCipher(bothKeys(), "v1");
    const withV1 = withV1Cipher.sealChannelCredential(
      SYNTHETIC_CREDENTIAL,
      bindingA,
    );

    const rotated = await loadCipher(bothKeys(), "v2");
    const withV2 = rotated.sealChannelCredential(SYNTHETIC_CREDENTIAL, bindingA);

    expect(withV2.keyId).toBe("v2");
    expect(withV2.envelope).not.toEqual(withV1.envelope);
    expect(rotated.openChannelCredential(withV1.envelope, bindingA)).toBe(
      SYNTHETIC_CREDENTIAL,
    );
    expect(rotated.openChannelCredential(withV2.envelope, bindingA)).toBe(
      SYNTHETIC_CREDENTIAL,
    );
  });

  it("fails without falling back when the sealing key is withdrawn", async () => {
    const before = await loadCipher(bothKeys(), "v1");
    const sealed = before.sealChannelCredential(SYNTHETIC_CREDENTIAL, bindingA);

    const after = await loadCipher(`v2:${KEY_V2}`, "v2");
    expect(() =>
      after.openChannelCredential(sealed.envelope, bindingA),
    ).toThrowError(/no longer configured/u);
  });

  it("fails when no key is configured, instead of storing plain text", async () => {
    const cipher = await loadCipher("", "");

    expect(() =>
      cipher.sealChannelCredential(SYNTHETIC_CREDENTIAL, bindingA),
    ).toThrowError(/not configured/u);
    expect(cipher.channelCredentialKeysConfigured()).toBe(false);
  });
});
