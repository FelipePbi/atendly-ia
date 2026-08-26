import type { ApiWhatsAppInstance } from "@/types/domain";

export const PAIRING_CODE_TTL_MS = 160_000;
export const PAIRING_POLL_INTERVAL_MS = 2_500;

const BRAZILIAN_DDDS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19,
  21, 22, 24, 27, 28,
  31, 32, 33, 34, 35, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48, 49,
  51, 53, 54, 55,
  61, 62, 63, 64, 65, 66, 67, 68, 69,
  71, 73, 74, 75, 77, 79,
  81, 82, 83, 84, 85, 86, 87, 88, 89,
  91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

export type PairingFlowStatus =
  | "idle"
  | "validatingPhone"
  | "generatingCode"
  | "codeReady"
  | "waitingConnection"
  | "checkingConnection"
  | "connected"
  | "expired"
  | "error";

export type PairingFlowState = {
  status: PairingFlowStatus;
  code: string;
  expiresAt: number | null;
  error: string;
};

export type PairingFlowAction =
  | { type: "VALIDATE" }
  | { type: "GENERATE" }
  | { type: "CODE_READY"; code: string; expiresAt: number }
  | { type: "WAIT" }
  | { type: "CHECK" }
  | { type: "CONNECTED" }
  | { type: "EXPIRED" }
  | { type: "ERROR"; message: string; preserveCode?: boolean }
  | { type: "RESET" };

export const initialPairingFlowState: PairingFlowState = {
  status: "idle",
  code: "",
  expiresAt: null,
  error: "",
};

export function pairingFlowReducer(state: PairingFlowState, action: PairingFlowAction): PairingFlowState {
  switch (action.type) {
    case "VALIDATE":
      return { ...state, status: "validatingPhone", error: "" };
    case "GENERATE":
      return { status: "generatingCode", code: "", expiresAt: null, error: "" };
    case "CODE_READY":
      return { status: "codeReady", code: action.code, expiresAt: action.expiresAt, error: "" };
    case "WAIT":
      return { ...state, status: "waitingConnection", error: "" };
    case "CHECK":
      return { ...state, status: "checkingConnection", error: "" };
    case "CONNECTED":
      return { status: "connected", code: "", expiresAt: null, error: "" };
    case "EXPIRED":
      return { status: "expired", code: "", expiresAt: null, error: "" };
    case "ERROR":
      return {
        status: "error",
        code: action.preserveCode ? state.code : "",
        expiresAt: action.preserveCode ? state.expiresAt : null,
        error: action.message,
      };
    case "RESET":
      return initialPairingFlowState;
  }
}

export function normalizeBrazilianPairingPhone(value: string): string {
  let digits = value.replace(/\D/g, "");

  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length >= 12 && digits.startsWith("55")) digits = digits.slice(2);
  if (digits.startsWith("0") && (digits.length === 11 || digits.length === 12)) digits = digits.slice(1);

  if (digits.length !== 10 && digits.length !== 11) return "";

  const ddd = Number(digits.slice(0, 2));
  if (!BRAZILIAN_DDDS.has(ddd)) return "";
  if (digits.length === 11 && digits[2] !== "9") return "";

  return `55${digits}`;
}

export function formatBrazilianPairingPhone(value: string): string {
  let digits = value.replace(/\D/g, "");
  if (digits.length > 11 && digits.startsWith("55")) digits = digits.slice(2);
  digits = digits.slice(0, 11);

  if (digits.length <= 2) return digits ? `(${digits}` : "";

  const ddd = digits.slice(0, 2);
  const subscriber = digits.slice(2);
  const splitAt = subscriber.length > 8 ? 5 : 4;
  const first = subscriber.slice(0, splitAt);
  const second = subscriber.slice(splitAt);

  return `(${ddd}) ${first}${second ? `-${second}` : ""}`;
}

export function formatPairingCode(value: string): string {
  const code = pairingCodeValue(value);
  if (!code) return "";
  if (/[\s-]/.test(code)) return code;

  return code.match(/.{1,4}/g)?.join(" ") ?? code;
}

export function pairingCodeValue(value: string): string {
  return value.trim();
}

export function beginOnce(flag: { current: boolean }): boolean {
  if (flag.current) return false;
  flag.current = true;
  return true;
}

export function shouldCheckPairingOnVisibility(
  visibilityState: DocumentVisibilityState,
  status: PairingFlowStatus
): boolean {
  return visibilityState === "visible" && ["codeReady", "waitingConnection", "checkingConnection"].includes(status);
}

type PairingApiResponse = {
  ok: boolean;
  error?: string;
  pairingCode?: string | null;
  expiresAt?: string | null;
  connected?: boolean;
  whatsappInstance?: ApiWhatsAppInstance | null;
};

export async function requestWhatsAppPairingCode(
  phone: string,
  options: { signal?: AbortSignal; fetcher?: typeof fetch } = {}
): Promise<{
  pairingCode: string | null;
  expiresAt: number | null;
  connected: boolean;
  whatsappInstance: ApiWhatsAppInstance | null;
}> {
  const fetcher = options.fetcher ?? fetch;
  const request = async (path: string, init: RequestInit): Promise<PairingApiResponse> => {
    const response = await fetcher(path, { ...init, signal: options.signal });
    const data = (await response.json().catch(() => null)) as PairingApiResponse | null;
    if (!response.ok || !data?.ok) {
      throw new Error(data?.error ?? "Não foi possível gerar o código de conexão.");
    }
    return data;
  };

  const instanceData = await request("/api/whatsapp/instance", { method: "POST" });
  if (instanceData.whatsappInstance?.status === "CONNECTED") {
    return {
      pairingCode: null,
      expiresAt: null,
      connected: true,
      whatsappInstance: instanceData.whatsappInstance,
    };
  }

  const pairingData = await request("/api/whatsapp/pair", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ phone }),
  });

  const pairingCode = pairingData.pairingCode ? pairingCodeValue(pairingData.pairingCode) : null;
  if (!pairingData.connected && !pairingCode) {
    throw new Error("Não foi possível gerar o código de conexão.");
  }

  const parsedExpiresAt = pairingData.expiresAt ? Date.parse(pairingData.expiresAt) : Number.NaN;
  return {
    pairingCode,
    expiresAt: Number.isFinite(parsedExpiresAt) ? parsedExpiresAt : Date.now() + PAIRING_CODE_TTL_MS,
    connected: Boolean(pairingData.connected),
    whatsappInstance: pairingData.whatsappInstance ?? instanceData.whatsappInstance ?? null,
  };
}

export async function copyPairingCode(
  value: string,
  options: {
    writeText?: (text: string) => Promise<void>;
    fallback?: (text: string) => boolean;
  } = {}
): Promise<boolean> {
  const compact = pairingCodeValue(value);
  if (!compact) return false;

  const writeText = options.writeText ?? globalThis.navigator?.clipboard?.writeText?.bind(globalThis.navigator.clipboard);
  if (writeText) {
    try {
      await writeText(compact);
      return true;
    } catch {
      // Continue with legacy copy for browsers that deny Clipboard API access.
    }
  }

  const fallback = options.fallback ?? legacyCopy;
  return fallback(compact);
}

function legacyCopy(value: string): boolean {
  if (typeof document === "undefined") return false;

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();

  try {
    return document.execCommand("copy");
  } finally {
    textarea.remove();
  }
}
