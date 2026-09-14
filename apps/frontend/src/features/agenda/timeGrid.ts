import type { CSSProperties } from "react";

import type { AgendaEntry } from "./occupancy";

/**
 * Mecânica de posição cronológica compartilhada por Semana e Dia (Goal016).
 *
 * A Semana já colocava cada entrada na posição real do tempo por `--start` e
 * `--span` (uma hora = 72px no CSS do módulo); o Dia usa exatamente a mesma
 * conversão, em vez de uma lista ordenada que só sugere a ordem. Duas telas
 * que dizem "ocupado às 14h" precisam colocá-lo no mesmo lugar.
 */

export const DEFAULT_START_HOUR = 7;
export const DEFAULT_END_HOUR = 20;

export interface TimeGridBounds {
  /** Altura total da grade, em CSS, para o eixo e a coluna do dia. */
  gridHeight: string;
  hours: number[];
  startHour: number;
}

/**
 * A janela visível parte do horário comercial e só cresce para caber o que
 * existe: evento às 6h ou às 22h aparece na posição dele, não empurrado para
 * a borda da grade.
 */
export function timeGridBounds(entries: AgendaEntry[]): TimeGridBounds {
  const boundaryMinutes = entries.flatMap((entry) => [
    entry.startMinutes,
    entry.endMinutes,
  ]);
  const startHour = Math.min(
    DEFAULT_START_HOUR,
    ...boundaryMinutes.map((minutes) => Math.floor(minutes / 60)),
  );
  const endHour = Math.max(
    DEFAULT_END_HOUR,
    ...boundaryMinutes.map((minutes) => Math.ceil(minutes / 60)),
  );
  const hours = Array.from(
    { length: endHour - startHour },
    (_, index) => startHour + index,
  );
  return { gridHeight: `calc(${hours.length} * 72px)`, hours, startHour };
}

/** Posição e duração da entrada, em horas a partir do topo da grade. */
export function entryPlacement(
  entry: AgendaEntry,
  startHour: number,
  lane?: { index: number; total: number },
): CSSProperties {
  // Propriedade customizada não existe em `CSSProperties`; o React a repassa
  // ao DOM como está, e é assim que a Semana já posicionava suas entradas.
  const placement: CSSProperties = {
    "--span": Math.max(0.4, (entry.endMinutes - entry.startMinutes) / 60),
    "--start": entry.startMinutes / 60 - startHour,
  } as CSSProperties;
  if (!lane) return placement;
  return {
    ...placement,
    "--lane": lane.index,
    "--lanes": lane.total,
  } as CSSProperties;
}

export interface LanedEntry {
  entry: AgendaEntry;
  lane: { index: number; total: number };
}

/**
 * Entradas que se sobrepõem no tempo dividem a largura da coluna em vez de
 * uma cobrir a outra. Sobreposição na agenda é real — o Goal008 permite-a por
 * decisão humana, e buffer encosta em atendimento — então esconder a de baixo
 * seria a grade mentindo sobre a ocupação.
 */
export function layoutDayEntries(entries: AgendaEntry[]): LanedEntry[] {
  const sorted = [...entries].sort(
    (left, right) =>
      left.startMinutes - right.startMinutes ||
      left.endMinutes - right.endMinutes,
  );
  const result: LanedEntry[] = [];
  // Um cluster e um trecho continuo de tempo ocupado: so quem esta no mesmo
  // cluster disputa largura, entao um dia cheio nao encolhe a manha inteira
  // por causa de dois eventos sobrepostos a tarde.
  let cluster: LanedEntry[] = [];
  let clusterEnd = -1;
  let laneEnds: number[] = [];

  function closeCluster() {
    const total = Math.max(1, laneEnds.length);
    for (const item of cluster) item.lane.total = total;
    cluster = [];
    laneEnds = [];
  }

  for (const entry of sorted) {
    if (entry.startMinutes >= clusterEnd) closeCluster();
    let index = laneEnds.findIndex((end) => end <= entry.startMinutes);
    if (index < 0) index = laneEnds.length;
    laneEnds[index] = entry.endMinutes;
    clusterEnd = Math.max(clusterEnd, entry.endMinutes);
    const laid: LanedEntry = { entry, lane: { index, total: 1 } };
    cluster.push(laid);
    result.push(laid);
  }
  closeCluster();

  return result;
}
