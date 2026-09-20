"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  type AppointmentHold,
  BffHttpError,
  type CreateHoldInput,
} from "@/data";
import { getProductServices } from "@/shared/runtime/ProductRuntime";

/**
 * Ciclo de vida do hold na UI (Goal008, consumido a partir do Goal016).
 *
 * O hold segura o horário por cinco minutos **pelo relógio do banco** — esta
 * tela não decide o prazo, só lê `expiresAt` e para de prometer o horário
 * quando ele passa. Os quatro estados do contrato (`ACTIVE`, `CONSUMED`,
 * `RELEASED`, `EXPIRED`) viram aqui uma máquina pequena e honesta: só
 * `held` autoriza enviar `holdId`, e qualquer perda leva a reescolher
 * horário com mensagem própria, nunca a um erro genérico.
 */
export type HoldPhase = "none" | "reserving" | "held" | "expired";

export interface HoldSession {
  /** Instante em que a reserva vence; só existe enquanto ela vale. */
  expiresAt: string | null;
  /** `holdId` a enviar na confirmação — nulo em qualquer fase que não garanta o horário. */
  holdId: string | null;
  phase: HoldPhase;
  /** Perda declarada pelo servidor (409 na confirmação): a reserva não vale mais. */
  markLost: () => void;
  /** Abandono explícito do horário: libera agora, sem esperar o TTL. */
  release: () => void;
  reserve: (input: CreateHoldInput) => Promise<void>;
}

export const HOLD_LOST_MESSAGE =
  "A reserva deste horário venceu antes da confirmação. Nada foi agendado: escolha o horário de novo.";

export const HOLD_EXPIRED_NOTICE =
  "A reserva deste horário venceu. O horário não está mais garantido — escolha o horário de novo.";

export function isHoldLostError(caught: unknown): boolean {
  return (
    caught instanceof BffHttpError &&
    caught.code === "APPOINTMENT_HOLD_EXPIRED"
  );
}

export function isSlotConflictError(caught: unknown): boolean {
  return caught instanceof BffHttpError && caught.code === "SLOT_UNAVAILABLE";
}

/**
 * `details.slotStillAvailable` é a única coisa que o contrato garante saber
 * depois da revalidação. Quando ele vem, a mensagem diz o que de fato
 * aconteceu; quando não vem, ela não inventa uma garantia.
 */
export function holdLostMessage(caught: unknown): string {
  const details = caught instanceof BffHttpError ? caught.details : undefined;
  const stillAvailable = readSlotStillAvailable(details);
  if (stillAvailable === true) {
    return `${HOLD_LOST_MESSAGE} O horário continuava livre nesta verificação.`;
  }
  if (stillAvailable === false) {
    return `${HOLD_LOST_MESSAGE} O horário já não estava livre nesta verificação.`;
  }
  return HOLD_LOST_MESSAGE;
}

function readSlotStillAvailable(details: unknown): boolean | null {
  if (typeof details !== "object" || details === null) return null;
  const value = (details as Record<string, unknown>).slotStillAvailable;
  return typeof value === "boolean" ? value : null;
}

/**
 * Chave de idempotência das escritas que ocupam horário (hold, criação e
 * remarcação). `crypto.randomUUID` não existe em todo runtime que renderiza
 * estas telas, e uma escrita sem chave é pior do que uma chave derivada de
 * `getRandomValues`.
 */
export function newIdempotencyKey(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  const values = new Uint32Array(4);
  globalThis.crypto.getRandomValues(values);
  return Array.from(values, (value) =>
    value.toString(16).padStart(8, "0"),
  ).join("-");
}

export function useHoldSession(): HoldSession {
  const [hold, setHold] = useState<AppointmentHold | null>(null);
  const [phase, setPhase] = useState<HoldPhase>("none");
  // A reserva viva, fora do ciclo de render: a liberação no unmount precisa
  // dela depois de o componente já ter saído.
  const liveHold = useRef<AppointmentHold | null>(null);
  // Descarta resposta de uma reserva que já foi substituída por outra.
  const attempt = useRef(0);

  const releaseLive = useCallback(() => {
    const current = liveHold.current;
    liveHold.current = null;
    if (!current) return;
    // Melhor esforço: se a liberação falhar, o TTL do banco fecha o caso —
    // o que não pode acontecer é a tela travar por causa disso.
    void getProductServices()
      .calendar.releaseHold(current.id)
      .catch(() => undefined);
  }, []);

  // Abandonar o fluxo (sair da tela) devolve o horário na hora.
  useEffect(() => () => releaseLive(), [releaseLive]);

  // Vencimento pelo prazo do servidor: a tela para de prometer o horário
  // sozinha, sem esperar uma recusa na confirmação.
  useEffect(() => {
    if (phase !== "held" || !hold) return;
    const remaining = Date.parse(hold.expiresAt) - Date.now();
    const timer = setTimeout(
      () => {
        liveHold.current = null;
        setPhase("expired");
      },
      Math.max(0, remaining),
    );
    return () => clearTimeout(timer);
  }, [hold, phase]);

  const release = useCallback(() => {
    attempt.current += 1;
    releaseLive();
    setHold(null);
    setPhase("none");
  }, [releaseLive]);

  const markLost = useCallback(() => {
    attempt.current += 1;
    liveHold.current = null;
    setHold(null);
    setPhase("expired");
  }, []);

  const reserve = useCallback(
    async (input: CreateHoldInput) => {
      const current = (attempt.current += 1);
      // Trocar de horário libera o anterior antes de pedir o novo.
      releaseLive();
      setHold(null);
      setPhase("reserving");
      let created: AppointmentHold;
      try {
        created = await getProductServices().calendar.createHold(
          input,
          newIdempotencyKey(),
        );
      } catch (caught) {
        if (current !== attempt.current) return;
        setHold(null);
        setPhase("none");
        throw caught;
      }
      if (current !== attempt.current) {
        void getProductServices()
          .calendar.releaseHold(created.id)
          .catch(() => undefined);
        return;
      }
      const usable = created.status === "ACTIVE";
      liveHold.current = usable ? created : null;
      setHold(created);
      setPhase(usable ? "held" : "expired");
    },
    [releaseLive],
  );

  return {
    expiresAt: phase === "held" && hold ? hold.expiresAt : null,
    holdId: phase === "held" && hold ? hold.id : null,
    markLost,
    phase,
    release,
    reserve,
  };
}
