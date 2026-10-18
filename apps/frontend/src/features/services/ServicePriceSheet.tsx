"use client";

import { useState } from "react";

import { type Service } from "@/data";
import { CurrencyInput } from "@/shared/ui/CurrencyInput";
import { Dialog } from "@/shared/ui/Dialog";

import { formatServicePreview } from "./serviceFormatting";

const options: Array<{ label: string; value: Service["priceType"] }> = [
  { label: "Preço fixo", value: "FIXED" },
  { label: "A partir de", value: "STARTING_AT" },
  { label: "Sob consulta", value: "ON_REQUEST" },
  { label: "Sem preço informado", value: "NOT_INFORMED" },
];

function needsValue(priceType: Service["priceType"]): boolean {
  return priceType === "FIXED" || priceType === "STARTING_AT";
}

/**
 * Tipo de preço na edição (quadro "Serviço · tipo de preço", S5): os quatro
 * tipos, cada um pelo que a IA vai dizer, e o valor dentro do tipo escolhido
 * quando ele precisa de valor. Folha no celular, modal centralizado do tablet
 * em diante. "Aplicar" só devolve a escolha ao formulário.
 */
export function ServicePriceSheet({
  initialCents,
  initialType,
  name,
  onApply,
  onClose,
}: {
  initialCents: number | null;
  initialType: Service["priceType"];
  name: string;
  onApply: (priceType: Service["priceType"], cents: number | null) => void;
  onClose: () => void;
}) {
  const [priceType, setPriceType] = useState(initialType);
  const [cents, setCents] = useState(initialCents);
  const [error, setError] = useState(false);
  const serviceName = name.trim();

  function phrase(type: Service["priceType"]): string | null {
    if (type === "NOT_INFORMED")
      return "A IA não fala de valor e diz que você confirma.";
    // Só o preço, como no quadro: a duração já está no formulário.
    const preview = formatServicePreview({
      durationMinutes: null,
      name: serviceName,
      priceCents: cents,
      priceType: type,
    });
    return preview ? `“${preview}”` : null;
  }

  function apply() {
    if (needsValue(priceType) && cents === null) {
      setError(true);
      return;
    }
    onApply(priceType, needsValue(priceType) ? cents : null);
  }

  return (
    <Dialog
      onClose={onClose}
      open
      title={serviceName ? `Como cobrar ${serviceName}?` : "Como cobrar?"}
      variant="sheet"
    >
      <div
        className="service-sheet service-price-sheet"
        // O formulário atrás marca "alterações não salvas" a cada mudança; o
        // rascunho da folha só conta quando volta por "Aplicar".
        onChange={(event) => event.stopPropagation()}
      >
        <div
          aria-label="Tipo de preço"
          className="service-price-options"
          role="radiogroup"
        >
          {options.map((option) => {
            const selected = priceType === option.value;
            const text = phrase(option.value);
            return (
              <div
                className={`service-price-option${selected ? " is-selected" : ""}`}
                key={option.value}
              >
                <label className="service-price-option-row">
                  <input
                    checked={selected}
                    name="service-price-sheet-type"
                    type="radio"
                    value={option.value}
                    onChange={() => {
                      setPriceType(option.value);
                      setError(false);
                    }}
                  />
                  <span aria-hidden="true" className="service-price-radio" />
                  <span className="service-price-option-copy">
                    <span className="service-price-option-label">
                      {option.label}
                    </span>
                    {text && (
                      <span className="service-price-option-phrase">
                        {text}
                      </span>
                    )}
                  </span>
                </label>
                {selected && needsValue(option.value) && (
                  <span
                    className={`service-price-option-value${error ? " field-error" : ""}`}
                  >
                    <span aria-hidden="true">
                      {option.value === "STARTING_AT" ? "a partir de R$" : "R$"}
                    </span>
                    <CurrencyInput
                      aria-describedby={
                        error ? "service-price-sheet-error" : undefined
                      }
                      aria-invalid={error || undefined}
                      aria-label={
                        option.value === "STARTING_AT"
                          ? "Valor inicial"
                          : "Preço"
                      }
                      defaultValueCents={cents}
                      hideSymbol
                      placeholder="0,00"
                      onValueChange={(value) => {
                        setCents(value);
                        setError(false);
                      }}
                    />
                  </span>
                )}
              </div>
            );
          })}
        </div>
        {error && (
          <span
            className="service-sheet-error"
            id="service-price-sheet-error"
            role="alert"
          >
            Informe o valor ou escolha sob consulta / sem preço.
          </span>
        )}
        <button
          className="btn btn-primary service-sheet-cta"
          type="button"
          onClick={apply}
        >
          Aplicar
        </button>
      </div>
    </Dialog>
  );
}
