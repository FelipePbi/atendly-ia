import { describe, expect, it, vi } from "vitest";
import {
  beginOnce,
  copyPairingCode,
  formatBrazilianPairingPhone,
  formatPairingCode,
  initialPairingFlowState,
  normalizeBrazilianPairingPhone,
  pairingFlowReducer,
  requestWhatsAppPairingCode,
  shouldCheckPairingOnVisibility,
} from "@/lib/whatsapp-pairing";

const pendingInstance = {
  id: "wa-1",
  phoneNumber: null,
  status: "CONNECTING" as const,
  qrcode: null,
  connectedAt: null,
};

describe("WhatsApp pairing helpers", () => {
  it("validates, normalizes and formats Brazilian phone numbers", () => {
    expect(normalizeBrazilianPairingPhone("(11) 99999-9999")).toBe("5511999999999");
    expect(normalizeBrazilianPairingPhone("+55 11 99999-9999")).toBe("5511999999999");
    expect(formatBrazilianPairingPhone("5511999999999")).toBe("(11) 99999-9999");
    expect(normalizeBrazilianPairingPhone("(10) 99999-9999")).toBe("");
    expect(normalizeBrazilianPairingPhone("(11) 89999-9999")).toBe("");
  });

  it("formats pairing codes without changing the copied value", () => {
    expect(formatPairingCode("ABCD-1234")).toBe("ABCD-1234");
    expect(formatPairingCode("123456789")).toBe("1234 5678 9");
  });

  it("models ready, waiting, checking, expiration and generation error states", () => {
    const generating = pairingFlowReducer(initialPairingFlowState, { type: "GENERATE" });
    const ready = pairingFlowReducer(generating, { type: "CODE_READY", code: "ABCD1234", expiresAt: 123 });
    const waiting = pairingFlowReducer(ready, { type: "WAIT" });
    const checking = pairingFlowReducer(waiting, { type: "CHECK" });
    const expired = pairingFlowReducer(checking, { type: "EXPIRED" });
    const failed = pairingFlowReducer(generating, { type: "ERROR", message: "Falhou" });

    expect(ready.status).toBe("codeReady");
    expect(waiting.status).toBe("waitingConnection");
    expect(checking.status).toBe("checkingConnection");
    expect(expired).toEqual({ status: "expired", code: "", expiresAt: null, error: "" });
    expect(failed).toEqual({ status: "error", code: "", expiresAt: null, error: "Falhou" });
  });

  it("copies the compact code with Clipboard API and falls back when it fails", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    expect(await copyPairingCode("ABCD-1234", { writeText })).toBe(true);
    expect(writeText).toHaveBeenCalledWith("ABCD-1234");

    const fallback = vi.fn().mockReturnValue(true);
    expect(await copyPairingCode("ABCD-1234", { writeText: vi.fn().mockRejectedValue(new Error("denied")), fallback })).toBe(true);
    expect(fallback).toHaveBeenCalledWith("ABCD-1234");
  });

  it("checks immediately after returning from the background only while waiting", () => {
    expect(shouldCheckPairingOnVisibility("visible", "waitingConnection")).toBe(true);
    expect(shouldCheckPairingOnVisibility("hidden", "waitingConnection")).toBe(false);
    expect(shouldCheckPairingOnVisibility("visible", "idle")).toBe(false);
  });

  it("prevents duplicate completion starts", () => {
    const flag = { current: false };
    expect(beginOnce(flag)).toBe(true);
    expect(beginOnce(flag)).toBe(false);
  });
});

describe("WhatsApp pairing API flow", () => {
  it("reuses an existing pending instance and requests one pairing code", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ ok: true, whatsappInstance: pendingInstance }, { status: 200 }))
      .mockResolvedValueOnce(
        Response.json(
          {
            ok: true,
            pairingCode: "ABCD-1234",
            expiresAt: "2026-08-14T12:00:00.000Z",
            connected: false,
            whatsappInstance: pendingInstance,
          },
          { status: 200 }
        )
      );

    const result = await requestWhatsAppPairingCode("5511999999999", { fetcher });

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual(["/api/whatsapp/instance", "/api/whatsapp/pair"]);
    expect(JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body))).toEqual({ phone: "5511999999999" });
    expect(result.pairingCode).toBe("ABCD-1234");
  });

  it("finishes without requesting a code when the existing instance is connected", async () => {
    const connectedInstance = { ...pendingInstance, status: "CONNECTED" as const };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({ ok: true, whatsappInstance: connectedInstance }, { status: 200 })
    );

    const result = await requestWhatsAppPairingCode("5511999999999", { fetcher });

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result.connected).toBe(true);
    expect(result.pairingCode).toBeNull();
  });

  it("surfaces a safe message when Evolution rejects code generation", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ ok: true, whatsappInstance: pendingInstance }, { status: 200 }))
      .mockResolvedValueOnce(
        Response.json({ ok: false, error: "Não foi possível gerar o código de conexão." }, { status: 502 })
      );

    await expect(requestWhatsAppPairingCode("5511999999999", { fetcher })).rejects.toThrow(
      "Não foi possível gerar o código de conexão."
    );
  });
});
