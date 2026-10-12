import type { AvailabilityException, TimeBlock } from "@/data";
import { type getProductServices } from "@/shared/runtime/ProductRuntime";

import {
  type AgendaWindow,
  recalledAgendaWindow,
  rememberAgendaWindow,
} from "./agendaMemory";

/**
 * Leitura de uma janela de datas da Agenda e a pré-leitura das vizinhas, em
 * segundo plano, para a memória da aba (D-167, D-168): a troca de visão, as
 * setas e o mini calendário encontram a janela pronta em vez de esperar a
 * rede.
 */
export type AgendaCalendarServices = ReturnType<
  typeof getProductServices
>["calendar"];

export type DateRange = { endDate: string; startDate: string };

/** As três leituras de uma janela, respeitando a fonte (bloqueio e exceção só na Avenly). */
export async function readAgendaWindow(
  services: AgendaCalendarServices,
  source: string,
  queryWindow: DateRange,
  signal: AbortSignal,
): Promise<AgendaWindow> {
  const avenly = source === "AVENLY";
  const [appointments, timeBlocks, exceptions] = await Promise.all([
    services.listAppointments(queryWindow, signal),
    avenly
      ? services.listTimeBlocks(queryWindow, signal)
      : Promise.resolve<TimeBlock[]>([]),
    avenly
      ? services.listAvailabilityExceptions(queryWindow, signal)
      : Promise.resolve<AvailabilityException[]>([]),
  ]);
  return {
    appointments,
    endDate: queryWindow.endDate,
    exceptions,
    source,
    startDate: queryWindow.startDate,
    timeBlocks,
  };
}

type IdleWindow = Window & {
  requestIdleCallback?: (callback: () => void) => number;
};

/**
 * Lê, quando o navegador está ocioso, as janelas que ainda não estão na
 * memória da aba, uma de cada vez. Sem `requestIdleCallback` não há
 * pré-leitura: é só conforto, e a troca espera a rede como antes.
 */
export function prefetchAgendaWindows(
  services: AgendaCalendarServices,
  source: string,
  ranges: DateRange[],
  signal: AbortSignal,
): void {
  if (typeof window === "undefined") return;
  const idle = (window as IdleWindow).requestIdleCallback;
  if (typeof idle !== "function") return;
  idle(() => {
    if (signal.aborted) return;
    void (async () => {
      for (const range of ranges) {
        if (signal.aborted) return;
        if (recalledAgendaWindow(source, range.startDate, range.endDate)) {
          continue;
        }
        try {
          rememberAgendaWindow(
            await readAgendaWindow(services, source, range, signal),
          );
        } catch {
          /* Pré-leitura é só conforto: a troca espera a rede como antes. */
        }
      }
    })();
  });
}
