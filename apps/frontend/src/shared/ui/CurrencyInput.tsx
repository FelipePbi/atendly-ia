"use client";

import { type ChangeEvent, type InputHTMLAttributes, useState } from "react";

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

/**
 * O que a edição fez com o texto da tela: o trecho que entrou e quantos
 * caracteres saíram, pelo prefixo e pelo sufixo comuns entre o texto
 * formatado de antes e o que o navegador acabou de montar. Não importa onde
 * estava o cursor nem que evento trouxe a entrada.
 */
function editedText(previousText: string, nextText: string) {
  let prefix = 0;
  while (
    prefix < previousText.length &&
    prefix < nextText.length &&
    previousText[prefix] === nextText[prefix]
  )
    prefix += 1;
  let suffix = 0;
  while (
    suffix < previousText.length - prefix &&
    suffix < nextText.length - prefix &&
    previousText[previousText.length - 1 - suffix] ===
      nextText[nextText.length - 1 - suffix]
  )
    suffix += 1;
  return {
    inserted: nextText.slice(prefix, nextText.length - suffix),
    removed: previousText.length - prefix - suffix,
  };
}

/**
 * Máscara de centavos que acrescenta ao fim (Goal058 §4): sem nada
 * selecionado, o dígito novo entra à direita do valor qualquer que seja a
 * posição do cursor e o que não é dígito é ignorado; apagar um caractere tira
 * o último dígito. Quando a edição substitui ou apaga uma seleção (ou o
 * preenchimento automático troca o texto), o campo fica com os dígitos que
 * passou a mostrar: seleção total seguida de dígito recomeça o valor.
 */
function nextDigits(digits: string, previousText: string, nextText: string) {
  const { inserted, removed } = editedText(previousText, nextText);
  const insertedDigits = inserted.replace(/\D/g, "");
  if (removed === 0) return digits + insertedDigits;
  if (removed === 1 && !insertedDigits) return digits.slice(0, -1);
  return nextText.replace(/\D/g, "");
}

export function CurrencyInput({
  defaultValueCents,
  onValueChange,
  ...inputProps
}: CurrencyInputProps) {
  const [digits, setDigits] = useState(() => initialDigits(defaultValueCents));
  const text = formattedCurrency(digits);

  function commit(nextDigits: string) {
    const normalized = normalizedDigits(nextDigits);
    const cents = normalized ? Number(normalized) : null;
    if (cents !== null && !Number.isSafeInteger(cents)) return;
    setDigits(normalized);
    onValueChange?.(cents);
  }

  // Toda entrada chega por aqui: tecla física, teclado virtual e IME (que
  // costumam mandar `key: "Unidentified"` no keydown), colar, ditado,
  // preenchimento automático e texto arrastado. Nenhuma depende de keydown.
  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    commit(nextDigits(digits, text, event.currentTarget.value));
  }

  return (
    <input
      {...inputProps}
      inputMode="numeric"
      type="text"
      value={text}
      onChange={handleChange}
    />
  );
}
