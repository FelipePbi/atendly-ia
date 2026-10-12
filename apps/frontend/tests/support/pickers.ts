import { screen, within } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";

/**
 * Escolhe um horário no tambor de "Outro horário" do Novo agendamento
 * (Seletores-de-Data-e-Hora.dc.html): um toque na hora e um no minuto.
 * Aceita "14:30" ou "1430".
 */
export async function chooseManualTime(
  user: UserEvent,
  time: string,
  label = "Outro horário, fora dos oferecidos",
) {
  const [hour, minute] = time.replace(/^(\d{2})(\d{2})$/, "$1:$2").split(":");
  const picker = screen.getByRole("group", { name: label });
  await user.click(
    within(within(picker).getByRole("listbox", { name: "Horas" })).getByRole(
      "option",
      { name: hour },
    ),
  );
  await user.click(
    within(within(picker).getByRole("listbox", { name: "Minutos" })).getByRole(
      "option",
      { name: minute },
    ),
  );
}

const MONTH = new Intl.DateTimeFormat("pt-BR", { month: "long" });

function dayName(date: Date): RegExp {
  return new RegExp(
    `^[^,]+, ${date.getDate()} de ${MONTH.format(date)} de ${date.getFullYear()}`,
  );
}

/** O dia `date` no calendário do formulário, se está na semana à vista. */
export function queryDateCell(date: Date): HTMLElement | null {
  return screen.queryByRole("gridcell", { name: dayName(date) });
}

/** Escolhe `date` no calendário em semana, avançando a semana se preciso. */
export async function chooseDate(user: UserEvent, date: Date) {
  for (let week = 0; week < 6 && !queryDateCell(date); week += 1) {
    await user.click(screen.getByRole("button", { name: "Próxima semana" }));
  }
  const cell = queryDateCell(date);
  if (!cell) throw new Error(`Dia fora do calendário: ${date.toDateString()}`);
  await user.click(cell);
}
