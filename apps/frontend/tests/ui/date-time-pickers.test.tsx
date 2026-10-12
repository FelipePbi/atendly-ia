// @vitest-environment jsdom
/**
 * Seletores de data e hora (Seletores-de-Data-e-Hora.dc.html) — os
 * componentes compartilhados que substituem `<input type="date">` e
 * `<input type="time">`.
 *
 * O que este arquivo afirma: o valor entra e sai no formato do campo nativo
 * (`YYYY-MM-DD`, `HH:mm`); dia fora do intervalo não responde; abrir o seletor
 * nunca muda o que já estava salvo; teclado e foco funcionam dentro do painel.
 */

import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { DatePicker } from "@/shared/ui/pickers/DatePicker";
import { DateField, TimeField } from "@/shared/ui/pickers/PickerFields";
import { TimePicker } from "@/shared/ui/pickers/TimePicker";

import { expectNoA11yViolations } from "../support/a11y";

// Terça, 13 de outubro de 2026.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 13, 10, 7));
});
afterEach(() => {
  vi.useRealTimers();
});

function Controlled({
  initial = "",
  kind,
  onValue,
  ...rest
}: {
  initial?: string;
  kind: "date-picker" | "time-picker" | "date-field" | "time-field";
  onValue?: (value: string) => void;
  min?: string;
  required?: boolean;
}) {
  const [value, setValue] = useState(initial);
  const change = (next: string) => {
    setValue(next);
    onValue?.(next);
  };
  if (kind === "date-picker")
    return <DatePicker min={rest.min} onChange={change} value={value} />;
  if (kind === "time-picker")
    return <TimePicker duration={45} onChange={change} value={value} />;
  if (kind === "date-field")
    return (
      <label>
        Data
        <DateField min={rest.min} onValueChange={change} value={value} />
      </label>
    );
  return (
    <label>
      Início
      <TimeField
        onValueChange={change}
        required={rest.required}
        value={value}
      />
    </label>
  );
}

describe("DatePicker", () => {
  test("nasce na semana do valor e devolve a data escolhida em ISO", async () => {
    const onValue = vi.fn();
    render(
      <Controlled initial="2026-10-15" kind="date-picker" onValue={onValue} />,
    );

    expect(screen.getByRole("button", { name: /Outubro/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    const day = screen.getByRole("gridcell", {
      name: /Sexta-feira, 16 de outubro/,
    });
    await userEvent.click(day);

    expect(onValue).toHaveBeenLastCalledWith("2026-10-16");
    expect(day).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Sexta-feira, 16 de outubro")).toBeVisible();
  });

  test("dia antes do mínimo não responde e é anunciado como indisponível", async () => {
    const onValue = vi.fn();
    render(
      <Controlled
        initial="2026-10-15"
        kind="date-picker"
        min="2026-10-13"
        onValue={onValue}
      />,
    );

    const past = screen.getByRole("gridcell", {
      name: /12 de outubro.*indisponível/,
    });
    expect(past).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(past);
    expect(onValue).not.toHaveBeenCalled();
  });

  test("o mês abre sobre a semana, as setas trocam o mês e escolher recolhe", async () => {
    render(<Controlled initial="2026-10-15" kind="date-picker" />);

    await userEvent.click(screen.getByRole("button", { name: /Outubro/ }));
    expect(screen.getByRole("button", { name: /Outubro/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await userEvent.click(screen.getByRole("button", { name: "Próximo mês" }));
    expect(screen.getByRole("button", { name: /Novembro/ })).toBeVisible();

    await userEvent.click(
      screen.getByRole("gridcell", { name: /, 3 de novembro/ }),
    );
    expect(screen.getByRole("button", { name: /Novembro/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  test("teclado: setas andam pelos dias e Enter escolhe", async () => {
    const onValue = vi.fn();
    render(
      <Controlled initial="2026-10-15" kind="date-picker" onValue={onValue} />,
    );

    const selected = screen.getByRole("gridcell", { name: /15 de outubro/ });
    expect(selected).toHaveAttribute("tabindex", "0");
    act(() => selected.focus());
    await userEvent.keyboard("{ArrowRight}");
    expect(
      screen.getByRole("gridcell", { name: /16 de outubro/ }),
    ).toHaveFocus();
    // Seta para baixo sai da semana: a faixa troca de semana e o foco segue.
    await userEvent.keyboard("{ArrowDown}{Enter}");
    expect(onValue).toHaveBeenLastCalledWith("2026-10-23");
  });

  test("Hoje escolhe hoje, que leva a marca de hoje", async () => {
    const onValue = vi.fn();
    render(
      <Controlled initial="2026-11-20" kind="date-picker" onValue={onValue} />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Hoje" }));
    expect(onValue).toHaveBeenLastCalledWith("2026-10-13");
    expect(
      screen.getByRole("gridcell", { name: /13 de outubro de 2026, hoje/ }),
    ).toHaveAttribute("aria-selected", "true");
  });

  test("sem valor, nada fica escolhido", () => {
    render(<Controlled kind="date-picker" />);
    expect(screen.getByText("Nenhuma data escolhida")).toBeVisible();
    expect(
      screen
        .queryAllByRole("gridcell")
        .filter((cell) => cell.getAttribute("aria-selected") === "true"),
    ).toHaveLength(0);
  });

  test("passa no axe", async () => {
    const { container } = render(
      <Controlled initial="2026-10-15" kind="date-picker" />,
    );
    await expectNoA11yViolations(container);
  });
});

describe("TimePicker", () => {
  test("tocar num número do tambor escolhe e mostra quando termina", async () => {
    const onValue = vi.fn();
    render(<Controlled initial="14:30" kind="time-picker" onValue={onValue} />);

    expect(screen.getByText("até 15:15 · 45 min")).toBeVisible();
    const hours = screen.getByRole("listbox", { name: "Horas" });
    await userEvent.click(within(hours).getByRole("option", { name: "16" }));
    expect(onValue).toHaveBeenLastCalledWith("16:30");
    const minutes = screen.getByRole("listbox", { name: "Minutos" });
    await userEvent.click(within(minutes).getByRole("option", { name: "05" }));
    expect(onValue).toHaveBeenLastCalledWith("16:05");
    expect(screen.getByText("16:05")).toBeVisible();
  });

  // Regressão: o tambor comercial vai das 07 às 21 em passos de 5. Um valor
  // salvo fora disso (06:00, 14:22) não pode ser arredondado só por abrir.
  test("valor fora do tambor entra na lista e não é reescrito", () => {
    const onValue = vi.fn();
    render(<Controlled initial="06:22" kind="time-picker" onValue={onValue} />);

    const hours = screen.getByRole("listbox", { name: "Horas" });
    expect(within(hours).getByRole("option", { name: "06" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    const minutes = screen.getByRole("listbox", { name: "Minutos" });
    expect(within(minutes).getByRole("option", { name: "22" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByText("06:22")).toBeVisible();
    expect(onValue).not.toHaveBeenCalled();
  });

  test("teclado: seta anda um passo, End vai ao fim", async () => {
    const onValue = vi.fn();
    render(<Controlled initial="14:30" kind="time-picker" onValue={onValue} />);

    act(() => screen.getByRole("listbox", { name: "Minutos" }).focus());
    await userEvent.keyboard("{ArrowDown}");
    expect(onValue).toHaveBeenLastCalledWith("14:35");
    act(() => screen.getByRole("listbox", { name: "Horas" }).focus());
    await userEvent.keyboard("{End}");
    expect(onValue).toHaveBeenLastCalledWith("21:35");
  });

  test("Agora arredonda para o próximo passo", async () => {
    const onValue = vi.fn();
    render(<Controlled initial="14:30" kind="time-picker" onValue={onValue} />);
    await userEvent.click(screen.getByRole("button", { name: "Agora" }));
    expect(onValue).toHaveBeenLastCalledWith("10:10");
  });

  test("fora do horário de atendimento avisa, sem bloquear", async () => {
    const onChange = vi.fn();
    render(
      <TimePicker
        businessHours={{ end: "19:00", start: "08:00" }}
        onChange={onChange}
        value="19:30"
      />,
    );
    expect(
      screen.getByText(/Fora do seu horário de atendimento \(08:00–19:00\)/),
    ).toBeVisible();
    const hours = screen.getByRole("listbox", { name: "Horas" });
    await userEvent.click(within(hours).getByRole("option", { name: "20" }));
    expect(onChange).toHaveBeenLastCalledWith("20:30");
  });

  test("sem valor mostra --:-- e o primeiro toque escolhe", async () => {
    const onValue = vi.fn();
    render(<Controlled kind="time-picker" onValue={onValue} />);
    expect(screen.getByText("--:--")).toBeVisible();
    await userEvent.click(screen.getByRole("option", { name: "09" }));
    expect(onValue).toHaveBeenLastCalledWith("09:00");
  });

  describe("arrastar para cima e para baixo", () => {
    const pause = (ms: number) =>
      new Promise((resolve) => window.setTimeout(resolve, ms));

    async function dragDrum(
      name: "Horas" | "Minutos",
      deltaY: number,
      pointerType: "mouse" | "touch",
      { settle = true } = {},
    ) {
      const drum = screen.getByRole("listbox", { name });
      const base = { button: 0, pointerId: 7, pointerType };
      fireEvent.pointerDown(drum, { ...base, clientY: 300 });
      for (let step = 1; step <= 4; step += 1) {
        fireEvent.pointerMove(drum, {
          ...base,
          clientY: 300 + (deltaY * step) / 4,
        });
      }
      // Parado antes de soltar: sem embalo, para onde o dedo deixou.
      if (settle) await pause(120);
      fireEvent.pointerUp(drum, { ...base, clientY: 300 + deltaY });
      return drum;
    }

    test.each(["touch", "mouse"] as const)(
      "%s: subir duas linhas avança dois passos",
      async (pointerType) => {
        const onValue = vi.fn();
        render(
          <Controlled initial="14:30" kind="time-picker" onValue={onValue} />,
        );
        await dragDrum("Minutos", -88, pointerType);
        expect(onValue).toHaveBeenLastCalledWith("14:40");
        await dragDrum("Horas", 44, pointerType);
        expect(onValue).toHaveBeenLastCalledWith("13:40");
      },
    );

    test("o tambor não passa do fim da lista", async () => {
      const onValue = vi.fn();
      render(
        <Controlled initial="14:30" kind="time-picker" onValue={onValue} />,
      );
      await dragDrum("Horas", -44 * 40, "touch");
      expect(onValue).toHaveBeenLastCalledWith("21:30");
    });

    test("soltar ainda em movimento leva o embalo adiante", async () => {
      const onValue = vi.fn();
      render(
        <Controlled initial="14:30" kind="time-picker" onValue={onValue} />,
      );
      await dragDrum("Minutos", -44, "touch", { settle: false });
      const [, minute] = (onValue.mock.lastCall?.[0] as string).split(":");
      expect(Number(minute)).toBeGreaterThan(35);
    });

    test("o clique que vem depois do arrasto não escolhe o número sob o dedo", async () => {
      const onValue = vi.fn();
      render(
        <Controlled initial="14:30" kind="time-picker" onValue={onValue} />,
      );
      const drum = await dragDrum("Minutos", -88, "mouse");
      fireEvent.click(within(drum).getByRole("option", { name: "50" }));
      expect(onValue).toHaveBeenLastCalledWith("14:40");
      // O próximo toque de verdade volta a escolher.
      await userEvent.click(within(drum).getByRole("option", { name: "50" }));
      expect(onValue).toHaveBeenLastCalledWith("14:50");
    });

    test("toque parado continua sendo escolha", async () => {
      const onValue = vi.fn();
      render(
        <Controlled initial="14:30" kind="time-picker" onValue={onValue} />,
      );
      const drum = screen.getByRole("listbox", { name: "Horas" });
      const option = within(drum).getByRole("option", { name: "16" });
      const base = {
        button: 0,
        clientY: 300,
        pointerId: 3,
        pointerType: "touch",
      };
      fireEvent.pointerDown(option, base);
      fireEvent.pointerMove(option, { ...base, clientY: 302 });
      fireEvent.pointerUp(option, { ...base, clientY: 302 });
      fireEvent.click(option);
      expect(onValue).toHaveBeenLastCalledWith("16:30");
    });
  });

  test("passa no axe", async () => {
    const { container } = render(
      <Controlled initial="14:30" kind="time-picker" />,
    );
    await expectNoA11yViolations(container);
  });
});

describe("DateField", () => {
  test("mostra dd/mm/aaaa e aceita a data digitada", async () => {
    const onValue = vi.fn();
    render(
      <Controlled initial="2026-10-20" kind="date-field" onValue={onValue} />,
    );

    const input = screen.getByLabelText("Data");
    expect(input).toHaveValue("20/10/2026");
    await userEvent.clear(input);
    expect(onValue).toHaveBeenLastCalledWith("");
    await userEvent.type(input, "22102026");
    expect(input).toHaveValue("22/10/2026");
    expect(onValue).toHaveBeenLastCalledWith("2026-10-22");
  });

  test("data impossível digitada não vira valor", async () => {
    const onValue = vi.fn();
    render(<Controlled kind="date-field" onValue={onValue} />);
    await userEvent.type(screen.getByLabelText("Data"), "31022026");
    expect(onValue).not.toHaveBeenCalledWith(expect.stringMatching(/\d/));
  });

  test("o calendário abre num painel, escolher fecha e devolve o foco", async () => {
    const onValue = vi.fn();
    render(
      <Controlled initial="2026-10-20" kind="date-field" onValue={onValue} />,
    );

    const toggle = screen.getByRole("button", { name: "Escolher data" });
    await userEvent.click(toggle);
    const dialog = screen.getByRole("dialog", { name: "Escolher data" });
    expect(
      within(dialog).getByRole("gridcell", { name: /20 de outubro/ }),
    ).toHaveFocus();

    await userEvent.click(
      within(dialog).getByRole("gridcell", { name: /28 de outubro/ }),
    );
    expect(onValue).toHaveBeenLastCalledWith("2026-10-28");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByLabelText("Data")).toHaveFocus();
    expect(screen.getByLabelText("Data")).toHaveValue("28/10/2026");
  });

  test("Esc fecha só o painel, e não o diálogo por baixo", async () => {
    const outer = vi.fn();
    document.addEventListener("keydown", outer);
    try {
      render(<Controlled initial="2026-10-20" kind="date-field" />);
      await userEvent.click(
        screen.getByRole("button", { name: "Escolher data" }),
      );
      await userEvent.keyboard("{Escape}");
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(outer).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener("keydown", outer);
    }
  });

  test("toque fora fecha o painel", async () => {
    render(
      <>
        <Controlled initial="2026-10-20" kind="date-field" />
        <p>fora</p>
      </>,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Escolher data" }),
    );
    expect(screen.getByRole("dialog")).toBeVisible();
    await userEvent.click(screen.getByText("fora"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("TimeField", () => {
  test("aceita hh:mm digitado como o campo nativo", async () => {
    const onValue = vi.fn();
    render(<Controlled initial="15:00" kind="time-field" onValue={onValue} />);

    const input = screen.getByLabelText("Início");
    expect(input).toHaveValue("15:00");
    await userEvent.clear(input);
    expect(onValue).toHaveBeenLastCalledWith("");
    await userEvent.type(input, "14:00");
    expect(onValue).toHaveBeenLastCalledWith("14:00");
    await userEvent.clear(input);
    await userEvent.type(input, "0930");
    expect(input).toHaveValue("09:30");
    expect(onValue).toHaveBeenLastCalledWith("09:30");
  });

  test("fireEvent.change com o valor inteiro também vale", () => {
    const onValue = vi.fn();
    render(<Controlled kind="time-field" onValue={onValue} />);
    fireEvent.change(screen.getByLabelText("Início"), {
      target: { value: "14:30" },
    });
    expect(onValue).toHaveBeenLastCalledWith("14:30");
  });

  test("o tambor abre num painel e Pronto fecha devolvendo o foco", async () => {
    const onValue = vi.fn();
    render(<Controlled initial="15:00" kind="time-field" onValue={onValue} />);

    await userEvent.click(
      screen.getByRole("button", { name: "Escolher horário" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Escolher horário" });
    expect(
      within(dialog).getByRole("listbox", { name: "Horas" }),
    ).toHaveFocus();
    await userEvent.click(within(dialog).getByRole("option", { name: "06" }));
    expect(onValue).toHaveBeenLastCalledWith("06:00");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Pronto" }),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByLabelText("Início")).toHaveFocus();
  });

  test("required continua barrando o envio vazio", () => {
    render(<Controlled kind="time-field" required />);
    expect(screen.getByLabelText("Início")).toBeRequired();
    expect(screen.getByLabelText("Início")).toBeInvalid();
  });

  test("passa no axe com o painel aberto", async () => {
    const { baseElement } = render(
      <Controlled initial="15:00" kind="time-field" />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Escolher horário" }),
    );
    await expectNoA11yViolations(baseElement);
  });
});
