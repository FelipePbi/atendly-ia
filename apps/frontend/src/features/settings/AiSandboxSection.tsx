"use client";

import { type FormEvent, useEffect, useId, useState } from "react";

import {
  AI_SANDBOX_MAX_EXCEPTION_PHONES,
  type AiSandboxSettings,
  type AiSandboxSettingsInput,
} from "@/data";
import {
  formatBrazilianPhone,
  maskPhoneInput,
  normalizeBrazilianPhoneDigits,
  phoneInputDigits,
} from "@/shared/phone";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { useOptionalSystemStatus } from "@/shared/runtime/systemStatus";
import { Skeleton } from "@/shared/ui/States";
import { showToast } from "@/shared/ui/toastBus";

type Read =
  | { phase: "loading" }
  | { phase: "error" }
  | { phase: "loaded"; state: AiSandboxSettings };

/** `55` + DDD + assinante, com o 9º dígito do celular, para comparar números. */
function canonicalPhone(value: string): string | null {
  const phone = normalizeBrazilianPhoneDigits(value);
  return phone ? `55${phone.ddd}${phone.subscriber}` : null;
}

function phoneLabel(value: string): string {
  return formatBrazilianPhone(value, "parens") ?? value;
}

/**
 * Modo sandbox (D-199), em Configurações › IA: para testar sem afetar
 * clientes. Ligado, as mensagens aparecem como enviadas no app, mas não saem
 * para o WhatsApp de ninguém além dos números da lista. Quem bloqueia o envio
 * é o servidor; esta seção só lê e grava a escolha, e a casca mostra o aviso
 * enquanto ele estiver ligado.
 */
export function AiSandboxSection() {
  const headingId = useId();
  const descriptionId = useId();
  const inputId = useId();
  const errorId = useId();
  const status = useOptionalSystemStatus();
  const [read, setRead] = useState<Read>({ phase: "loading" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [phoneInput, setPhoneInput] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  // Runtime sem o serviço (dublês antigos): a seção não aparece, em vez de
  // mostrar um erro que não é do negócio.
  const available =
    typeof getProductServices().settings.getAiSandbox === "function";

  // Leitura: na montagem e no "Tentar novamente" (`attempt` muda).
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!available) return;
    const controller = new AbortController();
    getProductServices()
      .settings.getAiSandbox(controller.signal)
      .then((state) => {
        if (!controller.signal.aborted) setRead({ phase: "loaded", state });
      })
      .catch(() => {
        if (!controller.signal.aborted) setRead({ phase: "error" });
      });
    return () => controller.abort();
  }, [available, attempt]);

  if (!available) return null;

  async function save(
    input: AiSandboxSettingsInput,
    success: string,
    failure: string,
  ): Promise<boolean> {
    setBusy(true);
    setMessage(null);
    try {
      const state = await getProductServices().settings.updateAiSandbox(input);
      setRead({ phase: "loaded", state });
      showToast(success);
      // O aviso da casca vem de `GET /v1/status`: relê agora, sem esperar.
      status?.refresh();
      return true;
    } catch {
      setMessage(failure);
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (read.phase === "loading") {
    return (
      <div aria-busy="true" className="ai-sandbox-skeleton">
        <Skeleton style={{ width: "50%", height: 20 }} />
        <Skeleton style={{ width: "100%", height: 16 }} />
      </div>
    );
  }

  if (read.phase === "error") {
    return (
      <section aria-labelledby={headingId} className="ai-sandbox">
        <h2 className="ai-sandbox-title" id={headingId}>
          Modo sandbox
        </h2>
        <p className="ai-sandbox-help">
          Não foi possível ler o modo sandbox.
        </p>
        <button
          className="btn btn-secondary ai-sandbox-retry"
          type="button"
          onClick={() => {
            setRead({ phase: "loading" });
            setAttempt((value) => value + 1);
          }}
        >
          Tentar novamente
        </button>
      </section>
    );
  }

  const { enabled, exceptionPhones } = read.state;

  async function toggle() {
    await save(
      { enabled: !enabled },
      enabled ? "Modo sandbox desligado." : "Modo sandbox ligado.",
      "Não foi possível salvar o modo sandbox.",
    );
  }

  async function addPhone(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const typed = phoneInputDigits(phoneInput);
    const phone = canonicalPhone(typed);
    if (!phone) {
      setPhoneError("Digite um número com DDD, como (11) 91234-5678.");
      return;
    }
    if (exceptionPhones.some((saved) => canonicalPhone(saved) === phone)) {
      setPhoneError("Esse número já está na lista.");
      return;
    }
    if (exceptionPhones.length >= AI_SANDBOX_MAX_EXCEPTION_PHONES) {
      setPhoneError(`A lista aceita até ${AI_SANDBOX_MAX_EXCEPTION_PHONES} números.`);
      return;
    }
    setPhoneError(null);
    const saved = await save(
      { exceptionPhones: [...exceptionPhones, phone] },
      "Número adicionado.",
      "Não foi possível adicionar o número.",
    );
    if (saved) setPhoneInput("");
  }

  async function removePhone(phone: string) {
    await save(
      { exceptionPhones: exceptionPhones.filter((saved) => saved !== phone) },
      "Número removido.",
      "Não foi possível remover o número.",
    );
  }

  return (
    <section
      aria-labelledby={headingId}
      className={`ai-sandbox${enabled ? " is-on" : ""}`}
      id="modo-sandbox"
    >
      <div className="ai-sandbox-row">
        <div className="ai-sandbox-copy">
          <h2 className="ai-sandbox-title" id={headingId}>
            Modo sandbox
          </h2>
          <p className="ai-sandbox-help" id={descriptionId}>
            Para testar sem afetar clientes: as mensagens aparecem como
            enviadas aqui, mas não chegam ao WhatsApp delas. A IA, a agenda e
            os lembretes continuam funcionando normalmente.
          </p>
        </div>
        <button
          aria-checked={enabled}
          aria-describedby={descriptionId}
          aria-labelledby={headingId}
          className="ai-sandbox-switch"
          disabled={busy}
          role="switch"
          type="button"
          onClick={() => void toggle()}
        >
          <span aria-hidden="true" className="ai-sandbox-knob" />
        </button>
      </div>
      {enabled && (
        <div className="ai-sandbox-exceptions">
          <h3 className="ai-sandbox-subtitle">Números que recebem de verdade</h3>
          <p className="ai-sandbox-help">
            Coloque o seu número, ou o de quem está testando com você. Só eles
            recebem as mensagens enquanto o modo sandbox estiver ligado.
          </p>
          {exceptionPhones.length > 0 ? (
            <ul className="ai-sandbox-list">
              {exceptionPhones.map((phone) => (
                <li className="ai-sandbox-item" key={phone}>
                  <span className="ai-sandbox-phone">{phoneLabel(phone)}</span>
                  <button
                    aria-label={`Remover ${phoneLabel(phone)}`}
                    className="ai-sandbox-remove"
                    disabled={busy}
                    type="button"
                    onClick={() => void removePhone(phone)}
                  >
                    Remover
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="ai-sandbox-empty">
              Nenhum número na lista: nenhuma mensagem sai para o WhatsApp.
            </p>
          )}
          <form
            className="ai-sandbox-form"
            noValidate
            onSubmit={(event) => void addPhone(event)}
          >
            <label className="ai-sandbox-label" htmlFor={inputId}>
              Adicionar número
            </label>
            <div className="ai-sandbox-add">
              <input
                aria-describedby={phoneError ? errorId : undefined}
                aria-invalid={phoneError ? true : undefined}
                autoComplete="tel"
                className="input"
                disabled={busy}
                id={inputId}
                inputMode="tel"
                maxLength={32}
                name="sandboxPhone"
                placeholder="+55 (11) 91234-5678"
                type="tel"
                value={phoneInput}
                onChange={(event) => {
                  setPhoneInput(maskPhoneInput(event.target.value));
                  setPhoneError(null);
                }}
              />
              <button className="btn btn-secondary" disabled={busy} type="submit">
                Adicionar
              </button>
            </div>
            {phoneError && (
              <p className="ai-sandbox-error" id={errorId} role="alert">
                {phoneError}
              </p>
            )}
          </form>
        </div>
      )}
      {message && (
        <p className="ai-state-message" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
