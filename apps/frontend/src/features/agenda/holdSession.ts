"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { type AppointmentHold, type CreateHoldInput } from "@/data";
import {
  schedulingRefusalCode,
  schedulingRefusalDetails,
} from "@/data/http/schedulingRefusal";
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
  /**
   * Libera e devolve a promessa da liberação assentada: quem vai reservar o
   * mesmo horário por outro caminho (a revisão da repetição, D-171) espera
   * por ela, para não bater na reserva da própria tela.
   */
  releaseSettled: () => Promise<void>;
  reserve: (input: CreateHoldInput) => Promise<void>;
}

export const HOLD_LOST_MESSAGE =
  "A reserva deste horário venceu antes da confirmação. Nada foi agendado: escolha o horário de novo.";

export const HOLD_EXPIRED_NOTICE =
  "A reserva deste horário venceu. O horário não está mais garantido. Escolha o horário de novo.";

export function isHoldLostError(caught: unknown): boolean {
  return schedulingRefusalCode(caught) === "APPOINTMENT_HOLD_EXPIRED";
}

export function isSlotConflictError(caught: unknown): boolean {
  return schedulingRefusalCode(caught) === "SLOT_UNAVAILABLE";
}

/**
 * `slotStillAvailable` no detalhe da recusa é a única coisa que o contrato
 * garante saber depois da revalidação. Quando ele vem, a mensagem diz o que de
 * fato aconteceu; quando não vem, ela não inventa uma garantia.
 */
export function holdLostMessage(caught: unknown): string {
  const stillAvailable = readSlotStillAvailable(
    schedulingRefusalDetails(caught),
  );
  if (stillAvailable === true) {
    return `${HOLD_LOST_MESSAGE} O horário continuava livre nesta verificação.`;
  }
  if (stillAvailable === false) {
    return `${HOLD_LOST_MESSAGE} O horário já não estava livre nesta verificação.`;
  }
  return HOLD_LOST_MESSAGE;
}

function readSlotStillAvailable(
  details: Record<string, unknown>,
): boolean | null {
  const value = details.slotStillAvailable;
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
  // Reserva anterior ainda em voo (pedido e, se substituída, a liberação do
  // que ela criou). A próxima só é pedida depois que esta assenta.
  const settled = useRef<Promise<void>>(Promise.resolve());

  const releaseLive = useCallback((): Promise<void> => {
    const current = liveHold.current;
    liveHold.current = null;
    if (!current) return Promise.resolve();
    // Melhor esforço: se a liberação falhar, o TTL do banco fecha o caso —
    // o que não pode acontecer é a tela travar por causa disso.
    return getProductServices()
      .calendar.releaseHold(current.id)
      .then(
        () => undefined,
        () => undefined,
      );
  }, []);

  // Abandonar o fluxo (sair da tela) devolve o horário na hora.
  useEffect(
    () => () => {
      // Uma reserva ainda em voo também é devolvida quando responder.
      attempt.current += 1;
      void releaseLive();
    },
    [releaseLive],
  );

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
    // A próxima reserva também espera esta liberação assentar.
    settled.current = Promise.all([settled.current, releaseLive()]).then(
      () => undefined,
    );
    setHold(null);
    setPhase("none");
  }, [releaseLive]);

  const releaseSettled = useCallback(() => {
    release();
    return settled.current;
  }, [release]);

  const markLost = useCallback(() => {
    attempt.current += 1;
    liveHold.current = null;
    setHold(null);
    setPhase("expired");
  }, []);

  const reserve = useCallback(
    async (input: CreateHoldInput) => {
      const current = (attempt.current += 1);
      // Trocar de horário libera o anterior e **espera** a liberação antes de
      // pedir o novo. Bug de 2026-10-12: a liberação ia sem esperar, o pedido
      // de 13:30 chegava ao Scheduling antes dela e batia na reserva da
      // própria tela em 13:00 (13:00–14:15), e o horário livre era recusado
      // como ocupado. O mesmo vale para uma reserva anterior ainda em voo.
      const previous = settled.current;
      const releasing = releaseLive();
      setHold(null);
      setPhase("reserving");
      const work = (async () => {
        await previous;
        await releasing;
        return getProductServices().calendar.createHold(
          input,
          newIdempotencyKey(),
        );
      })();
      const superseded = work.then(
        (created) =>
          current === attempt.current
            ? undefined
            : getProductServices()
                .calendar.releaseHold(created.id)
                .then(
                  () => undefined,
                  () => undefined,
                ),
        () => undefined,
      );
      settled.current = superseded;
      let created: AppointmentHold;
      try {
        created = await work;
      } catch (caught) {
        if (current !== attempt.current) return;
        setHold(null);
        setPhase("none");
        throw caught;
      }
      // Substituída enquanto voava: `superseded` já devolve o que ela criou.
      if (current !== attempt.current) return;
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
    releaseSettled,
    reserve,
  };
}
