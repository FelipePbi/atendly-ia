/**
 * Recuperação de senha (G-34): experiência visual de quatro telas — e-mail,
 * código, nova senha e sucesso — sem chamada de rede nesta fase. A máquina
 * fica pura e sem I/O de propósito: a UI é a única parte com efeito
 * colateral (navegar para a tela de sucesso), o que deixa as transições
 * testáveis sem montar componente nem simular rede.
 */

export type RecoveryStep = "code" | "done" | "email" | "new-password";

export interface RecoveryState {
  email: string;
  step: RecoveryStep;
}

export type RecoveryEvent =
  | { type: "BACK" }
  | { type: "SUBMIT_CODE" }
  | { type: "SUBMIT_EMAIL"; email: string }
  | { type: "SUBMIT_NEW_PASSWORD" };

export const initialRecoveryState: RecoveryState = {
  email: "",
  step: "email",
};

export function recoveryReducer(
  state: RecoveryState,
  event: RecoveryEvent,
): RecoveryState {
  switch (event.type) {
    case "SUBMIT_EMAIL":
      if (state.step !== "email") return state;
      return { email: event.email, step: "code" };
    case "SUBMIT_CODE":
      if (state.step !== "code") return state;
      return { ...state, step: "new-password" };
    case "SUBMIT_NEW_PASSWORD":
      if (state.step !== "new-password") return state;
      return { ...state, step: "done" };
    case "BACK":
      if (state.step === "code") return { ...state, step: "email" };
      if (state.step === "new-password") return { ...state, step: "code" };
      return state;
    default:
      return state;
  }
}
