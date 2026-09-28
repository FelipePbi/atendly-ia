import { BffHttpError, type Session } from "@/data";
import { Icon } from "@/shared/icons/Icon";

import type { OnboardingDraft } from "../OnboardingRuntime";
import type { OnboardingScenario } from "../scenarios";

export type OnboardingStepContext = {
  draft: OnboardingDraft;
  go: (step: OnboardingScenario) => void;
  refresh: () => Promise<unknown>;
  refreshSession: () => Promise<Session | null>;
  router: { replace: (href: string) => void };
  setError: (message: string | null) => void;
};

export type OnboardingStepBody = (
  scenario: OnboardingScenario,
  draft: OnboardingDraft,
  setDraft: (updater: (value: OnboardingDraft) => OnboardingDraft) => void,
  // Só o bloco WhatsApp usa isto, para o CTA "Continuar" de whatsapp-conectar
  // saber quando o número já conectou (Goal071/WU-03).
  onWhatsappStatusChange?: (connected: boolean) => void,
) => React.ReactNode;

export type OnboardingStepPersist = (
  scenario: OnboardingScenario,
  ctx: OnboardingStepContext,
) => Promise<void>;

export function Choice({
  copy,
  onClick,
  selected,
  title,
}: {
  copy: string;
  onClick: () => void;
  selected: boolean;
  title: string;
}) {
  return (
    <button
      className={`choice-card${selected ? " is-selected" : ""}`}
      type="button"
      onClick={onClick}
    >
      <span className="choice-check">
        <Icon name="check" />
      </span>
      <h2>{title}</h2>
      <p>{copy}</p>
    </button>
  );
}

export function Summary({ rows }: { rows: Array<[string, string]> }) {
  return (
    <div className="service-summary">
      {rows.map(([label, value]) => (
        <div className="summary-row" key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}

export function onboardingError(error: unknown): string {
  if (error instanceof BffHttpError && error.status === 409) {
    return "Ainda há itens obrigatórios pendentes. Revise negócio, agenda, serviço, disponibilidade e tom da IA.";
  }
  return "Não foi possível salvar esta etapa. Tente novamente.";
}

type ValidatableControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

let generatedFieldIdCounter = 0;

function ensureFieldId(control: ValidatableControl): string {
  if (control.id) return control.id;
  if (!control.dataset.onboardingFieldId) {
    generatedFieldIdCounter += 1;
    control.dataset.onboardingFieldId = `onboarding-field-${generatedFieldIdCounter}`;
  }
  control.id = control.dataset.onboardingFieldId;
  return control.id;
}

function fieldErrorMessage(control: ValidatableControl): string {
  const validity = control.validity;
  const overrideMessage = control.dataset.errorMessage;
  if (validity.customError) return control.validationMessage;
  if (validity.valueMissing) {
    return overrideMessage ?? "Preencha este campo.";
  }
  if (validity.patternMismatch) {
    return overrideMessage ?? "Preencha este campo corretamente.";
  }
  if (validity.tooShort) {
    const min = "minLength" in control ? control.minLength : -1;
    return min > 0
      ? `Use pelo menos ${min} caracteres.`
      : "Este campo está muito curto.";
  }
  if (validity.tooLong) return "Este campo está muito longo.";
  if (validity.rangeUnderflow) return "O valor é menor que o permitido.";
  if (validity.rangeOverflow) return "O valor é maior que o permitido.";
  if (validity.typeMismatch) return "Formato inválido.";
  return "Revise esta informação.";
}

/** Um grupo de escolha (chips, cartões) que precisa de ao menos uma opção.
 * O bloco declara `data-validation-group` no contêiner e põe a mensagem em
 * `data-group-error` enquanto nada estiver escolhido; vazio é válido. */
const GROUP_SELECTOR = "[data-validation-group]";
/** Subárvore com validação própria (ex.: o formulário de "Adicionar outro
 * serviço"), que o envio da etapa não confere. */
const SCOPE_SELECTOR = "[data-validation-scope]";

function describedByTokens(element: HTMLElement, removeId: string): string[] {
  return (element.getAttribute("aria-describedby") ?? "")
    .split(/\s+/)
    .filter((token) => token !== "" && token !== removeId);
}

function clearFieldError(root: HTMLElement, element: HTMLElement) {
  const errorId = `${ensureElementId(element)}-error`;
  element.removeAttribute("aria-invalid");
  const tokens = describedByTokens(element, errorId);
  if (tokens.length > 0) element.setAttribute("aria-describedby", tokens.join(" "));
  else element.removeAttribute("aria-describedby");
  element.closest<HTMLElement>(".field")?.classList.remove("field-error");
  root.querySelector(`#${CSS.escape(errorId)}`)?.remove();
}

function markFieldError(root: HTMLElement, element: HTMLElement, message: string) {
  const errorId = `${ensureElementId(element)}-error`;
  element.setAttribute("aria-invalid", "true");
  element.setAttribute(
    "aria-describedby",
    [...describedByTokens(element, errorId), errorId].join(" "),
  );
  element.closest<HTMLElement>(".field")?.classList.add("field-error");
  let messageEl = root.querySelector<HTMLElement>(`#${CSS.escape(errorId)}`);
  if (!messageEl) {
    messageEl = document.createElement("span");
    messageEl.id = errorId;
    messageEl.className = "field-help";
    messageEl.setAttribute("role", "alert");
    // Fora do <label> que envolve o campo: dentro dele, o erro passaria a
    // fazer parte do nome acessível; a ligação é só por aria-describedby.
    (element.closest("label") ?? element).insertAdjacentElement(
      "afterend",
      messageEl,
    );
  }
  messageEl.textContent = message;
}

function ensureElementId(element: HTMLElement): string {
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLSelectElement ||
    element instanceof HTMLTextAreaElement
  ) {
    return ensureFieldId(element);
  }
  if (element.id) return element.id;
  generatedFieldIdCounter += 1;
  element.id = `onboarding-group-${generatedFieldIdCounter}`;
  return element.id;
}

function focusTargetOf(element: HTMLElement): HTMLElement | null {
  if (!element.matches(GROUP_SELECTOR)) return element;
  return element.querySelector<HTMLElement>("button, input, select, textarea");
}

/**
 * Substitui `form.checkValidity()`/`reportValidity()` (sem UI acessível, sem
 * mensagem em português) por leitura de `validity`/`validationMessage`
 * (propriedades, não métodos) e decoração manual de `aria-invalid` +
 * `aria-describedby`. Funciona para qualquer etapa do onboarding sem que o
 * bloco precise saber disso: só usa os atributos nativos (`required`,
 * `pattern`, `minLength`...) que os campos já declaram, mais
 * `data-error-message` opcional para uma mensagem específica,
 * `setCustomValidity` para regras que HTML sozinho não expressa (ex.:
 * horário final antes do inicial) e `data-validation-group` para "ao menos
 * uma opção" num grupo (segmento, modalidade, dias), com o erro ligado ao
 * grupo. Mostra todos os erros juntos e foca o primeiro inválido; não grava
 * nada quando retorna `false`.
 *
 * `root` é o formulário da etapa, ou uma subárvore com validação própria
 * (`data-validation-scope`), que o envio da etapa deixa de fora.
 */
export function applyInlineValidation(root: HTMLElement): boolean {
  const elements = Array.from(
    root.querySelectorAll<HTMLElement>(`input, select, textarea, ${GROUP_SELECTOR}`),
  ).filter((element) => {
    const scope = element.closest(SCOPE_SELECTOR);
    if (scope && scope !== root && root.contains(scope)) return false;
    if (element.matches(GROUP_SELECTOR)) return true;
    // Controles dentro de um grupo são decididos pelo grupo.
    if (element.closest(GROUP_SELECTOR)) return false;
    return (element as ValidatableControl).willValidate;
  });

  let firstInvalid: HTMLElement | null = null;
  for (const element of elements) {
    const message = element.matches(GROUP_SELECTOR)
      ? element.dataset.groupError || null
      : (element as ValidatableControl).validity.valid
        ? null
        : fieldErrorMessage(element as ValidatableControl);
    if (message === null) {
      clearFieldError(root, element);
      continue;
    }
    if (!firstInvalid) firstInvalid = element;
    markFieldError(root, element, message);
  }
  if (firstInvalid) focusTargetOf(firstInvalid)?.focus();
  return firstInvalid === null;
}

/**
 * Leva ao campo a recusa de validação do servidor (`400 VALIDATION_ERROR`,
 * `details.fieldErrors` por seção, e `BUSINESS_ADDRESS_REQUIRED` com
 * `details.field`). Cada campo declara o caminho em `data-server-field`
 * (ex.: `service.price`); dentro da seção recusada, vale o campo cujo nome
 * aparece na mensagem, ou o primeiro da seção na etapa. O texto é o da tela
 * (`data-error-message`), nunca a mensagem crua do servidor. Devolve `false`
 * quando nenhum campo da etapa corresponde, para o chamador cair no aviso
 * geral.
 */
export function applyServerFieldErrors(root: HTMLElement, error: unknown): boolean {
  if (!(error instanceof BffHttpError)) return false;
  const details = error.details as
    | { field?: unknown; fieldErrors?: Record<string, string[] | undefined> }
    | undefined;
  const refused: Array<{ section: string; messages: string[] }> = [];
  if (error.code === "VALIDATION_ERROR" && details?.fieldErrors) {
    for (const [section, messages] of Object.entries(details.fieldErrors)) {
      refused.push({ section, messages: messages ?? [] });
    }
  } else if (
    error.code === "BUSINESS_ADDRESS_REQUIRED" &&
    typeof details?.field === "string"
  ) {
    refused.push({ section: "business", messages: [`business.${details.field}`] });
  }

  const controls = Array.from(
    root.querySelectorAll<ValidatableControl>("[data-server-field]"),
  );
  let firstInvalid: HTMLElement | null = null;
  for (const { section, messages } of refused) {
    const inSection = controls.filter((control) =>
      (control.dataset.serverField ?? "").startsWith(`${section}.`),
    );
    const named = inSection.find((control) => {
      const field = (control.dataset.serverField ?? "").slice(section.length + 1);
      return messages.some((message) => message.includes(field));
    });
    const target = named ?? inSection[0];
    if (!target) continue;
    if (!firstInvalid) firstInvalid = target;
    markFieldError(
      root,
      target,
      target.dataset.errorMessage ?? "Revise esta informação.",
    );
  }
  firstInvalid?.focus();
  return firstInvalid !== null;
}
