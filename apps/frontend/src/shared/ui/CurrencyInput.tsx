"use client";

import {
  type ChangeEvent,
  type InputHTMLAttributes,
  type KeyboardEvent,
  useState,
} from "react";

const brlFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export type CurrencyInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "defaultValue" | "inputMode" | "onChange" | "type" | "value"
> & {
  defaultValueCents?: number | null;
  onValueChange?: (valueCents: number | null) => void;
};

function initialDigits(defaultValueCents: number | null | undefined) {
  if (
    defaultValueCents === null ||
    defaultValueCents === undefined ||
    !Number.isSafeInteger(defaultValueCents) ||
    defaultValueCents < 0
  )
    return "";
  return String(defaultValueCents);
}

function normalizedDigits(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  return digits.replace(/^0+(?=\d)/, "");
}

function formattedCurrency(digits: string) {
  if (!digits) return "";
  return brlFormatter.format(Number(digits) / 100);
}

export function CurrencyInput({
  defaultValueCents,
  onKeyDown,
  onValueChange,
  ...inputProps
}: CurrencyInputProps) {
  const [digits, setDigits] = useState(() => initialDigits(defaultValueCents));

  function commit(nextDigits: string) {
    const normalized = normalizedDigits(nextDigits);
    const cents = normalized ? Number(normalized) : null;
    if (cents !== null && !Number.isSafeInteger(cents)) return;
    setDigits(normalized);
    onValueChange?.(cents);
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    commit(event.currentTarget.value);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    onKeyDown?.(event);
    if (event.defaultPrevented || event.key !== "Backspace") return;
    event.preventDefault();
    const hasSelection =
      event.currentTarget.selectionStart !== event.currentTarget.selectionEnd;
    commit(hasSelection ? "" : digits.slice(0, -1));
  }

  return (
    <input
      {...inputProps}
      inputMode="numeric"
      type="text"
      value={formattedCurrency(digits)}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
    />
  );
}
