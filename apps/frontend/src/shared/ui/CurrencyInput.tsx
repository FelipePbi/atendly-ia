"use client";

import {
  type ChangeEvent,
  type FocusEvent,
  type InputHTMLAttributes,
  useState,
} from "react";

const brlFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const plainFormatter = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export type CurrencyInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "defaultValue" | "inputMode" | "onChange" | "type" | "value"
> & {
  defaultValueCents?: number | null;
  // O "R$" sai do texto do campo: quem usa desenha o símbolo como adorno ao lado.
  hideSymbol?: boolean;
  onValueChange?: (valueCents: number | null) => void;
};

function validCents(cents: number | null | undefined): cents is number {
  return (
    cents !== null &&
    cents !== undefined &&
    Number.isSafeInteger(cents) &&
    cents >= 0
  );
}

function formattedCurrency(cents: number | null, hideSymbol: boolean) {
  if (!validCents(cents)) return "";
  return (hideSymbol ? plainFormatter : brlFormatter).format(cents / 100);
}

function editableText(cents: number | null) {
  if (!validCents(cents)) return "";
  const reais = Math.floor(cents / 100);
  const remainder = cents % 100;
  if (remainder === 0) return String(reais);
  const fraction = String(remainder).padStart(2, "0").replace(/0$/, "");
  return `${reais},${fraction}`;
}

/**
 * Mantém só dígitos, pontos e vírgula (o "R$" e os espaços de um valor colado
 * saem). Só a primeira vírgula conta e a parte depois dela fica com duas casas.
 */
function sanitizedText(raw: string) {
  const kept = raw.replace(/[^\d.,]/g, "");
  const comma = kept.indexOf(",");
  if (comma === -1) return kept;
  const decimals = kept
    .slice(comma + 1)
    .replace(/\D/g, "")
    .slice(0, 2);
  return `${kept.slice(0, comma)},${decimals}`;
}

/**
 * Lê o texto como reais (Goal084): com vírgula, a vírgula separa os centavos e
 * o ponto é milhar; sem vírgula, ponto seguido de um ou dois dígitos no fim é
 * decimal e qualquer outro ponto é milhar. `undefined` quando o valor passa de
 * Number.MAX_SAFE_INTEGER centavos.
 */
function parsedCents(text: string): number | null | undefined {
  if (!/\d/.test(text)) return null;
  let integer: string;
  let decimals: string;
  const comma = text.indexOf(",");
  if (comma >= 0) {
    integer = text.slice(0, comma).replace(/\./g, "");
    decimals = text.slice(comma + 1);
  } else {
    const trailing = /^(.*)\.(\d{1,2})$/.exec(text);
    integer = (trailing ? trailing[1] : text).replace(/\./g, "");
    decimals = trailing ? trailing[2] : "";
  }
  const cents = Number(`${integer}${decimals.padEnd(2, "0")}`);
  return Number.isSafeInteger(cents) ? cents : undefined;
}

export function CurrencyInput({
  defaultValueCents,
  hideSymbol = false,
  onBlur,
  onFocus,
  onValueChange,
  ...inputProps
}: CurrencyInputProps) {
  const [cents, setCents] = useState<number | null>(() =>
    validCents(defaultValueCents) ? defaultValueCents : null,
  );
  const [text, setText] = useState(() =>
    formattedCurrency(cents, hideSymbol),
  );

  function handleFocus(event: FocusEvent<HTMLInputElement>) {
    setText(editableText(cents));
    onFocus?.(event);
  }

  function handleBlur(event: FocusEvent<HTMLInputElement>) {
    setText(formattedCurrency(cents, hideSymbol));
    onBlur?.(event);
  }

  // Toda entrada chega por aqui: tecla física, teclado virtual e IME (que
  // costumam mandar `key: "Unidentified"` no keydown), colar, ditado,
  // preenchimento automático e texto arrastado. Nenhuma depende de keydown.
  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const nextText = sanitizedText(event.currentTarget.value);
    const nextCents = parsedCents(nextText);
    if (nextCents === undefined) return;
    setText(nextText);
    setCents(nextCents);
    onValueChange?.(nextCents);
  }

  return (
    <input
      {...inputProps}
      inputMode="decimal"
      type="text"
      value={text}
      onBlur={handleBlur}
      onChange={handleChange}
      onFocus={handleFocus}
    />
  );
}
