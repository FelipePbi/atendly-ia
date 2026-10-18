"use client";

import { type KeyboardEvent, type PointerEvent, useRef, useState } from "react";

import {
  type HexColor,
  hexToRgb,
  type Hsv,
  hsvToRgb,
  isHexColor,
  rgbToHex,
  rgbToHsv,
  type SavedServiceColor,
  swatchProps,
} from "@/shared/serviceColor";
import { Dialog } from "@/shared/ui/Dialog";

/** Cor de partida quando o serviço ainda não tem cor personalizada. */
const START_HSV: Hsv = { h: 130, s: 0.23, v: 0.62 };

const checkMark = (
  <svg
    aria-hidden="true"
    fill="none"
    height="14"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth="3"
    viewBox="0 0 24 24"
    width="14"
  >
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/**
 * "Outra cor" do serviço (quadro "Serviço · cor personalizada"): campo de
 * tom, régua de matiz, código hex editável com R/G/B ao lado, "Suas cores"
 * e a prévia "Assim na agenda". Abre pelo "+" das cores sugeridas, num modal
 * centralizado (2026-10-18).
 */
export function ServiceColorPicker({
  initial,
  onClose,
  onPick,
  open,
  saved = [],
  serviceName,
  summary,
}: {
  initial: HexColor | null;
  onClose: () => void;
  onPick: (color: HexColor) => void;
  open: boolean;
  /** Cores próprias que o negócio já usa (`savedServiceColors`). */
  saved?: SavedServiceColor[];
  serviceName: string;
  summary: string;
}) {
  // Montado só enquanto aberto: o estado nasce da cor atual a cada abertura.
  // O hex é a cor exata (o que foi digitado não muda na volta); o HSV só
  // posiciona o campo de tom e a régua, e guarda o matiz de um cinza.
  const [color, setColor] = useState<HexColor>(
    () => initial ?? rgbToHex(hsvToRgb(START_HSV)),
  );
  const [hsv, setHsv] = useState<Hsv>(() => rgbToHsv(hexToRgb(color)));
  const [hexDraft, setHexDraft] = useState(() => color.slice(1).toUpperCase());
  const fieldRef = useRef<HTMLDivElement>(null);

  const rgb = hexToRgb(color);
  const hueColor = rgbToHex(hsvToRgb({ h: hsv.h, s: 1, v: 1 }));

  function apply(next: Hsv) {
    const hex = rgbToHex(hsvToRgb(next));
    setHsv(next);
    setColor(hex);
    setHexDraft(hex.slice(1).toUpperCase());
  }

  function applyHex(hex: HexColor) {
    setColor(hex);
    setHsv((current) => {
      const next = rgbToHsv(hexToRgb(hex));
      // Cinza não tem matiz: a régua fica onde estava.
      return next.s === 0 ? { ...next, h: current.h } : next;
    });
  }

  function pickFromPointer(event: PointerEvent<HTMLDivElement>) {
    const box = fieldRef.current?.getBoundingClientRect();
    if (!box) return;
    apply({
      ...hsv,
      s: clamp((event.clientX - box.left) / box.width, 0, 1),
      v: clamp(1 - (event.clientY - box.top) / box.height, 0, 1),
    });
  }

  function fieldKeys(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 0.1 : 0.02;
    const moves: Record<string, Partial<Hsv>> = {
      ArrowLeft: { s: clamp(hsv.s - step, 0, 1) },
      ArrowRight: { s: clamp(hsv.s + step, 0, 1) },
      ArrowUp: { v: clamp(hsv.v + step, 0, 1) },
      ArrowDown: { v: clamp(hsv.v - step, 0, 1) },
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    apply({ ...hsv, ...move });
  }

  function typeHex(value: string) {
    const clean = value
      .replace(/[^0-9a-f]/gi, "")
      .slice(0, 6)
      .toUpperCase();
    setHexDraft(clean);
    const candidate = `#${clean.toLowerCase()}`;
    if (isHexColor(candidate)) applyHex(candidate);
  }

  function typeChannel(channel: "r" | "g" | "b", value: string) {
    const number = clamp(Number.parseInt(value || "0", 10) || 0, 0, 255);
    const hex = rgbToHex({ ...rgb, [channel]: number });
    applyHex(hex);
    setHexDraft(hex.slice(1).toUpperCase());
  }

  const saturation = Math.round(hsv.s * 100);
  const brightness = Math.round(hsv.v * 100);

  return (
    <Dialog
      onClose={onClose}
      open={open}
      title={`Outra cor para ${serviceName || "o serviço"}`}
    >
      <div className="service-picker">
        <div
          aria-label="Tom da cor"
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={saturation}
          aria-valuetext={`saturação ${saturation}%, brilho ${brightness}%`}
          className="service-picker-field"
          ref={fieldRef}
          role="slider"
          style={{ backgroundColor: hueColor }}
          tabIndex={0}
          onKeyDown={fieldKeys}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            pickFromPointer(event);
          }}
          onPointerMove={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId))
              pickFromPointer(event);
          }}
        >
          <span
            aria-hidden="true"
            className="service-picker-thumb"
            style={{
              left: `${hsv.s * 100}%`,
              top: `${(1 - hsv.v) * 100}%`,
              backgroundColor: color,
            }}
          />
        </div>
        <input
          aria-label="Matiz"
          className="service-picker-hue"
          max={359}
          min={0}
          step={1}
          style={{ ["--picker-thumb" as string]: hueColor }}
          type="range"
          value={Math.round(hsv.h)}
          onChange={(event) => apply({ ...hsv, h: Number(event.target.value) })}
        />
        <div className="service-picker-codes">
          <label className="service-picker-hex">
            <span className="service-picker-code-label">Código da cor</span>
            <span className="service-picker-hex-input">
              <span
                aria-hidden="true"
                className="service-picker-hex-dot"
                style={{ backgroundColor: color }}
              />
              <span aria-hidden="true">#</span>
              <input
                autoComplete="off"
                inputMode="text"
                maxLength={6}
                spellCheck={false}
                value={hexDraft}
                onBlur={() => setHexDraft(color.slice(1).toUpperCase())}
                onChange={(event) => typeHex(event.target.value)}
              />
            </span>
          </label>
          {(["r", "g", "b"] as const).map((channel) => (
            <label className="service-picker-channel" key={channel}>
              <span className="service-picker-code-label">
                {channel.toUpperCase()}
              </span>
              <input
                inputMode="numeric"
                max={255}
                min={0}
                type="number"
                value={rgb[channel]}
                onChange={(event) => typeChannel(channel, event.target.value)}
              />
            </label>
          ))}
        </div>
        {saved.length > 0 && (
          <div
            aria-labelledby="service-picker-saved-label"
            className="service-picker-saved"
            role="group"
          >
            <span
              className="service-picker-code-label"
              id="service-picker-saved-label"
            >
              Suas cores
            </span>
            <div className="service-picker-saved-list">
              {saved.map((entry) => {
                const label =
                  entry.usedBy.length > 0
                    ? `Cor ${entry.hex.toUpperCase()}, usada em ${entry.usedBy.join(", ")}`
                    : `Cor ${entry.hex.toUpperCase()}`;
                const current = color.toLowerCase() === entry.hex;
                return (
                  <button
                    aria-label={label}
                    aria-pressed={current}
                    className="service-picker-saved-color"
                    key={entry.hex}
                    title={label}
                    type="button"
                    onClick={() => {
                      applyHex(entry.hex);
                      setHexDraft(entry.hex.slice(1).toUpperCase());
                    }}
                  >
                    <span
                      aria-hidden="true"
                      className="service-color-circle"
                      {...swatchProps(entry.hex)}
                    >
                      {current && checkMark}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <div className="service-agenda-preview">
          <span className="service-agenda-preview-label">Assim na agenda</span>
          <div className="service-agenda-preview-row">
            <span className="service-agenda-preview-time">15:30</span>
            <span
              aria-hidden="true"
              className="service-agenda-preview-bar"
              {...swatchProps(color)}
            />
            <span className="service-agenda-preview-body">
              <span className="service-agenda-preview-name">Cliente</span>
              <span className="service-agenda-preview-line">{summary}</span>
            </span>
          </div>
          <span className="service-picker-marks">
            <span
              aria-hidden="true"
              className="service-picker-mark is-month"
              {...swatchProps(color)}
            />
            <span
              aria-hidden="true"
              className="service-picker-mark is-week"
              {...swatchProps(color)}
            />
            risco no Mês · barra na Semana
          </span>
        </div>
        <p className="service-picker-note">
          Tons médios ficam mais legíveis sobre o papel. Se a cor for clara
          demais, escurecemos um pouco o traço para manter o contraste.
        </p>
        <button
          className="btn btn-primary service-picker-use"
          type="button"
          onClick={() => onPick(color)}
        >
          Usar esta cor
        </button>
        <button className="service-picker-back" type="button" onClick={onClose}>
          Voltar às cores sugeridas
        </button>
      </div>
    </Dialog>
  );
}
