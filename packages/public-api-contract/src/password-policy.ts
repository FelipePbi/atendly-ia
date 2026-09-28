import { z } from "zod";

// U-10 (DECISIONS): senha única, um mínimo de 8 caracteres com letra e
// número, sem "Repita a senha". Escrita uma vez aqui e usada por
// registerSchema, resetPasswordSchema e passwordSchema (PATCH
// /v1/auth/password) no BFF, e pela validação inline do frontend. Login não
// usa esta regra: conta antiga com senha fora dela continua entrando.
export const passwordPolicySchema = z
  .string()
  .min(8, { message: "Password must have at least 8 characters." })
  .max(200)
  .refine((value) => /[A-Za-z]/.test(value), {
    message: "Password must contain at least one letter.",
  })
  .refine((value) => /[0-9]/.test(value), {
    message: "Password must contain at least one digit.",
  });

// Mesmas regras, em forma de lista, para a tela mostrar o que falta ao
// digitar (Goal064 §4). A ordem é a ordem de exibição.
export const PASSWORD_POLICY_RULES = [
  {
    id: "MIN_LENGTH",
    test: (value: string) => value.length >= 8,
  },
  {
    id: "HAS_LETTER_AND_DIGIT",
    test: (value: string) => /[A-Za-z]/.test(value) && /[0-9]/.test(value),
  },
] as const;

export type PasswordPolicyRuleId = (typeof PASSWORD_POLICY_RULES)[number]["id"];
