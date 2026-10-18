"use client";

import clsx from "clsx";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useRef, useState } from "react";

import {
  type Appointment,
  type AvailabilitySlot,
  type CalendarState,
  type CreateAppointmentInput,
  type Customer,
  type CustomerList,
  type SeriesOccurrencePreview,
  type Service,
  type ServiceList,
} from "@/data";
import { Icon } from "@/shared/icons/Icon";
import { prefersReducedMotion } from "@/shared/motion/reducedMotion";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { swatchProps } from "@/shared/serviceColor";
import { Button } from "@/shared/ui/Button";
import { DatePicker } from "@/shared/ui/pickers/DatePicker";
import {
  capitalize,
  clockMinutes,
  daysFromToday,
  formatClock,
  MONTHS,
  parseClock,
  parseIsoDate,
  WEEKDAYS,
} from "@/shared/ui/pickers/dateTime";
import { TimePicker } from "@/shared/ui/pickers/TimePicker";

import { appointmentHref } from "./agendaLinks";
import {
  forgetAgendaChanges,
  recalledCalendar,
  recalledCustomer,
  recalledCustomers,
  recalledServiceCatalog,
  rememberAppointment,
  rememberCustomers,
  rememberServiceCatalog,
} from "./agendaMemory";
import {
  AppointmentFlowShell,
  formatMoney,
  ReadOnlyState,
} from "./AppointmentFlowShell";
import { occupyingEntries } from "./ConflictPanel";
import {
  holdLostMessage,
  isHoldLostError,
  isSlotConflictError,
  newIdempotencyKey,
  useHoldSession,
} from "./holdSession";
import { MoreServicesSheet } from "./MoreServicesSheet";
import {
  CustomerField,
  durationLabel,
  MOST_USED_SERVICES,
  personLabel,
  servicesByUsage,
  weekdayShort,
} from "./NewAppointmentFields";
import {
  type AgendaEntry,
  buildAgendaEntries,
  isoDate,
  parseDate,
  requestError,
  serviceColorMap,
} from "./occupancy";
import {
  DEFAULT_REPEAT_INTERVAL,
  releaseHolds,
  REPEAT_COUNT_DEFAULT,
  RepeatFields,
  RepeatReviewSheet,
} from "./RepeatReview";
import {
  type ConflictAvailability,
  ConflictGlyph,
  SlotConflictNotice,
} from "./SlotConflictNotice";
import { holdNotice } from "./SlotPicker";

type AppointmentFormProps = {
  /** Pessoa escolhida de antemão (Goal075, vinda de `/clientes`). Continua trocável. */
  customerId?: string;
  /** Dia vindo de uma hora vazia da Semana (`?date=AAAA-MM-DD`). Continua trocável. */
  initialDate?: string;
  /** "Repetir este atendimento" já ligado (o link antigo `/agenda/serie`, D-171). */
  initialRepeat?: boolean;
};

/**
 * Criação de atendimento (Goal016, apresentação do A6 no Goal083).
 *
 * Três regras do domínio mandam nesta tela, e nenhuma delas é invenção dela:
 * a pessoa é identificada por `customerId` — nunca por telefone, que o
 * Goal006 tirou do domínio e o Goal015 tirou do perfil; o horário escolhido é
 * reservado por um hold antes da criação, e a reserva perdida leva a
 * reescolher, não a um erro genérico; e sobrepor um intervalo ocupado é
 * decisão humana com motivo obrigatório.
 *
 * "Outro, sem cadastro" é o atendimento manual excepcional do Goal008: sem
 * serviço, com título e duração, e sem hold — o hold exige serviço.
 */
export function AppointmentForm({
  customerId,
  initialDate,
  initialRepeat = false,
}: AppointmentFormProps = {}) {
  const router = useRouter();
  const hold = useHoldSession();
  // Vindo da Agenda, o calendário e as listas já estão na memória da aba
  // (D-167; a folha do "+ Novo" as pré-lê, D-168): a tela abre pronta, e a
  // leitura abaixo revalida no lugar.
  const [calendar, setCalendar] = useState<CalendarState | null>(
    recalledCalendar,
  );
  const [services, setServices] = useState<ServiceList | null>(
    recalledServiceCatalog,
  );
  const [customers, setCustomers] = useState<CustomerList | null>(
    recalledCustomers,
  );
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  // Serviços trazidos de "Ver outros serviços": ficam à vista dali em diante.
  const [promotedIds, setPromotedIds] = useState<string[]>([]);
  const [moreServicesOpen, setMoreServicesOpen] = useState(false);
  const serviceChipsRef = useRef<HTMLDivElement>(null);
  // Foco pedido por uma escolha, aplicado depois do commit que a mostra.
  const pendingFocusRef = useRef<(() => void) | null>(null);
  const [other, setOther] = useState(false);
  const [otherTitle, setOtherTitle] = useState("");
  const [otherDuration, setOtherDuration] = useState("");
  const [chosenCustomerId, setChosenCustomerId] = useState<string | null>(
    customerId ?? null,
  );
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  // Nome digitado assumido como cliente novo (saiu do campo ou "Cadastrar").
  const [nameCommitted, setNameCommitted] = useState(false);
  // Recorrência no próprio agendamento (D-171, pedido de 2026-10-12): a
  // revisão reserva um horário por ocorrência; as reservas vivas ficam fora
  // do render para serem liberadas ao sair da tela.
  const [repeat, setRepeat] = useState(initialRepeat);
  const [repeatCount, setRepeatCount] = useState(REPEAT_COUNT_DEFAULT);
  const [repeatInterval, setRepeatInterval] = useState<number | null>(null);
  const [seriesPreview, setSeriesPreview] = useState<
    SeriesOccurrencePreview[] | null
  >(null);
  const seriesHoldsRef = useRef<string[]>([]);
  useEffect(() => () => releaseHolds(seriesHoldsRef.current), []);
  // O horário não vem junto: ele é escolhido entre os livres do serviço, e
  // escolher reserva (hold); só o dia é pré-preenchido.
  const [date, setDate] = useState(() =>
    initialDate && /^\d{4}-\d{2}-\d{2}$/.test(initialDate)
      ? initialDate
      : isoDate(new Date()),
  );
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [startTime, setStartTime] = useState("");
  const [manualTime, setManualTime] = useState("");
  const [showManual, setShowManual] = useState(false);
  const [comments, setComments] = useState("");
  const [showComments, setShowComments] = useState(false);
  // A cliente que o perfil deixou lembrada (o "Agendar" de Clientes): com
  // ela, a tela abre sem esperar a lista inteira de clientes, que segue
  // chegando por trás para a busca (2026-10-16).
  const [seedCustomer] = useState(() =>
    customerId ? recalledCustomer(customerId) : null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Pronto quando há calendário e serviços; a lista de clientes só segura a
  // tela quando a cliente pedida pela URL ainda não é conhecida.
  const loading =
    error === null &&
    (calendar === null ||
      services === null ||
      (Boolean(customerId) && seedCustomer === null && customers === null));
  const [conflict, setConflict] = useState<ConflictState | null>(null);
  const timeFieldsetRef = useRef<HTMLFieldSetElement>(null);
  const timeLegendRef = useRef<HTMLLegendElement>(null);
  const reasonInputRef = useRef<HTMLInputElement>(null);
  const [focusTimeRequest, setFocusTimeRequest] = useState(0);

  // "Escolher outro horário": o foco vai para o primeiro horário livre, ou
  // para a legenda "Horário" quando não há nenhum.
  useEffect(() => {
    if (focusTimeRequest === 0) return;
    const first = timeFieldsetRef.current?.querySelector<HTMLInputElement>(
      'input[name="start-time"]',
    );
    (first ?? timeLegendRef.current)?.focus();
  }, [focusTimeRequest]);

  // Foco pedido por uma escolha (o serviço trazido da folha, a seção revelada
  // pelo cliente escolhido) depois do commit que a mostra. A folha devolve o
  // foco a quem a abriu na limpeza dela, e este efeito roda depois.
  useEffect(() => {
    const focus = pendingFocusRef.current;
    if (!focus) return;
    pendingFocusRef.current = null;
    focus();
  });

  useEffect(() => {
    const controller = new AbortController();
    const fail = (caught: unknown) => {
      if (!controller.signal.aborted)
        setError(
          requestError(caught, "Não foi possível preparar o agendamento."),
        );
    };
    Promise.all([
      getProductServices().calendar.getCalendar(controller.signal),
      getProductServices().serviceCatalog.list(controller.signal),
    ])
      .then(([calendarResult, serviceResult]) => {
        setCalendar(calendarResult);
        setServices(serviceResult);
        rememberServiceCatalog(serviceResult);
      })
      .catch(fail);
    getProductServices()
      .customers.list({}, controller.signal)
      .then((customerResult) => {
        setCustomers(customerResult);
        rememberCustomers(customerResult);
      })
      .catch(fail);
    return () => controller.abort();
  }, []);

  // Dias em que o negócio não atende ficam esmaecidos na faixa de datas (A6).
  // Sem leitura das regras, ou sem regra alguma, nenhum dia é esmaecido.
  const [openWeekdays, setOpenWeekdays] = useState<Set<number> | null>(null);
  // O mesmo expediente diz ao aviso de recusa o motivo verdadeiro (2026-10-12).
  const [availabilitySettings, setAvailabilitySettings] =
    useState<ConflictAvailability | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const settingsService = getProductServices().settings;
    if (!settingsService || typeof settingsService.get !== "function") return;
    settingsService
      .get(controller.signal)
      .then((state) => {
        const rules = state.availability?.rules ?? [];
        setAvailabilitySettings(state.availability ?? null);
        setOpenWeekdays(
          rules.length === 0
            ? null
            : new Set(
                rules
                  .filter((rule) => rule.active)
                  .map((rule) => rule.dayOfWeek),
              ),
        );
      })
      .catch(() => {
        // Sem as regras a faixa fica sem esmaecer; isso não bloqueia o formulário.
      });
    return () => controller.abort();
  }, []);

  // A disponibilidade é consultada para o **conjunto** escolhido, não para o
  // primeiro serviço: é a duração somada que precisa caber no horário.
  const serviceKey = serviceIds.join(",");
  useEffect(() => {
    if (!serviceKey || !date || !calendar?.capabilities.createAppointments) {
      return;
    }
    const controller = new AbortController();
    getProductServices()
      .calendar.getAvailability(
        {
          serviceIds: serviceKey.split(","),
          startDate: date,
          days: 1,
          maxSlots: 100,
        },
        controller.signal,
      )
      .then((result) => {
        setSlots(result.filter((slot) => slot.date === date));
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted)
          setError(
            requestError(
              caught,
              "Não foi possível consultar os horários disponíveis.",
            ),
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setSlotsLoading(false);
      });
    return () => controller.abort();
  }, [calendar, date, serviceKey]);

  const colors = serviceColorMap(services?.items);
  const selectableServices = (services?.items ?? []).filter(
    (item) => item.active && item.durationMinutes !== null,
  );
  // Os 5 mais usados à vista e os demais em "Ver outros serviços" (D-170).
  // Quem foi escolhido na folha, ou está na seleção, fica entre os chips.
  const rankedServices = servicesByUsage(selectableServices);
  const mostUsed = rankedServices.slice(0, MOST_USED_SERVICES);
  const visibleServices = [
    ...mostUsed,
    ...[...promotedIds, ...serviceIds]
      .filter((id, index, ids) => ids.indexOf(id) === index)
      .map((id) => rankedServices.find((item) => item.id === id))
      .filter(
        (item): item is Service =>
          item !== undefined && !mostUsed.includes(item),
      ),
  ];
  const otherServices = rankedServices.filter(
    (item) => !visibleServices.includes(item),
  );
  const selectedServices = selectableServices.filter((item) =>
    serviceIds.includes(item.id),
  );
  const servicesMinutes = selectedServices.reduce(
    (sum, item) => sum + (item.durationMinutes ?? 0),
    0,
  );
  const otherMinutes = Number.parseInt(otherDuration, 10);
  const otherReady =
    otherTitle.trim().length > 0 &&
    Number.isInteger(otherMinutes) &&
    otherMinutes >= 1 &&
    otherMinutes <= 1440;
  const durationMinutes = other
    ? otherReady
      ? otherMinutes
      : 0
    : servicesMinutes;
  const total = agreementTotal(selectedServices);
  const selectedCustomer = chosenCustomerId
    ? (customers?.items.find((item) => item.id === chosenCustomerId) ??
      (seedCustomer?.id === chosenCustomerId ? seedCustomer : undefined))
    : undefined;
  // Telefone não identifica ninguém aqui: uma pessoa já cadastrada é agendada
  // pelo próprio ID, mesmo sem telefone nenhum no perfil.
  const identityReady = selectedCustomer
    ? true
    : customerName.trim().length > 0;
  const serviceReady = other ? otherReady : serviceIds.length > 0;
  const canSubmit =
    identityReady &&
    serviceReady &&
    Boolean(date) &&
    Boolean(startTime) &&
    !busy &&
    !conflict &&
    hold.phase !== "reserving" &&
    hold.phase !== "expired";
  const blockedReason = !identityReady
    ? "Escolha ou cadastre o cliente."
    : !serviceReady
      ? other
        ? "Informe o título e a duração do atendimento."
        : "Escolha ao menos um serviço."
      : !startTime
        ? "Escolha um horário."
        : null;
  // O intervalo do serviço (`recurrenceIntervalDays`) é a sugestão; sem
  // ele, toda semana. Escolher outro vale até a tela fechar.
  const suggestedInterval =
    selectedServices
      .map((item) => item.recurrenceIntervalDays)
      .find(
        (value): value is number => typeof value === "number" && value > 0,
      ) ?? null;
  const intervalDays =
    repeatInterval ?? suggestedInterval ?? DEFAULT_REPEAT_INTERVAL;
  // Quadro "Data e horário" (Seletores-de-Data-e-Hora.dc.html, 03 · Juntos):
  // quem, o quê e quanto tempo, ao lado do resumo da escolha.
  const whoName = selectedCustomer
    ? personLabel(selectedCustomer)
    : customerName.trim();
  const whatLabel = other
    ? otherTitle.trim()
    : selectedServices.map((item) => item.name).join(", ");
  const whoLabel = [
    whoName,
    whatLabel,
    durationMinutes > 0 ? durationLabel(durationMinutes) : "",
  ]
    .filter(Boolean)
    .join(" · ");
  // Dias sem atendimento ficam em cinza no calendário, mas continuam
  // clicáveis; sem regras lidas, nenhum dia é esmaecido.
  const closedWeekdays = openWeekdays
    ? [0, 1, 2, 3, 4, 5, 6].filter((day) => !openWeekdays.has(day))
    : undefined;
  // O expediente do dia escolhido: fora dele o tambor avisa, sem bloquear.
  const dayRules = (availabilitySettings?.rules ?? []).filter(
    (rule) => rule.active && rule.dayOfWeek === parseDate(date).getDay(),
  );
  const businessHours =
    dayRules.length > 0
      ? {
          end:
            dayRules
              .map((rule) => rule.endTime)
              .sort()
              .at(-1) ?? "",
          start: dayRules.map((rule) => rule.startTime).sort()[0] ?? "",
        }
      : null;
  const ctaLabel = startTime
    ? `Criar agendamento · ${weekdayShort(date)} ${parseDate(date).getDate()}, ${startTime}`
    : "Criar agendamento";

  // Revelação progressiva (pedido de 2026-10-12, D-170): Cliente → Serviços
  // → Data e Horário (com observação, série e o rodapé). Uma etapa revelada
  // fica: trocar o cliente ou desmarcar o serviço não some com nada da ordem
  // de foco. O que a tela já abre preenchido (cliente vindo do perfil ou da
  // conversa) aparece de uma vez, sem animação; só o revelado depois anima.
  // "Outro, sem cadastro" também é escolha: a Data e o horário digitado
  // aparecem com ele.
  const serviceChosen = other || serviceIds.length > 0;
  const customerChosen = selectedCustomer
    ? true
    : nameCommitted && customerName.trim().length > 0;
  // Com o horário escolhido, "Repetir este atendimento" (D-171); "Outro, sem
  // cadastro" não repete, porque a série exige serviço cadastrado.
  const readyStage = !customerChosen
    ? 0
    : !serviceChosen
      ? 1
      : !startTime || other
        ? 2
        : 3;
  const [revealedStage, setRevealedStage] = useState(0);
  const [openingStage, setOpeningStage] = useState<number | null>(null);
  if (!loading && openingStage === null) setOpeningStage(readyStage);
  if (readyStage > revealedStage) setRevealedStage(readyStage);
  const shownStage = Math.max(revealedStage, readyStage);
  const [reducedMotion] = useState(prefersReducedMotion);
  const enterClass = (stage: number) =>
    !reducedMotion && openingStage !== null && stage > openingStage
      ? "motion-enter"
      : undefined;
  const servicesSectionRef = useRef<HTMLFieldSetElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const scheduleSectionRef = useRef<HTMLElement>(null);
  const repeatSectionRef = useRef<HTMLDivElement>(null);
  const repeating = repeat && !other && shownStage >= 3;
  const submitLabel = repeating
    ? `Revisar ${repeatCount} agendamentos`
    : ctaLabel;
  const announcedStage =
    openingStage !== null && shownStage > openingStage ? shownStage : 0;

  // A etapa nova entra na vista só se ficou fora dela ("nearest" não rola o
  // que já aparece inteiro).
  const lastShownRef = useRef(shownStage);
  useEffect(() => {
    if (shownStage <= lastShownRef.current) return;
    lastShownRef.current = shownStage;
    if (openingStage === null || shownStage <= openingStage) return;
    const section =
      shownStage === 1
        ? servicesSectionRef.current
        : shownStage === 2
          ? scheduleSectionRef.current
          : repeatSectionRef.current;
    section?.scrollIntoView?.({
      behavior: reducedMotion ? "auto" : "smooth",
      block: "nearest",
    });
  }, [openingStage, reducedMotion, shownStage]);

  function resetSlotChoice() {
    hold.release();
    setStartTime("");
    setConflict(null);
  }

  function chooseCustomer(customer: Customer) {
    resetSlotChoice();
    setChosenCustomerId(customer.id);
    setCustomerName("");
    setCustomerPhone("");
    // A sugestão clicada some: o foco vai para os Serviços quando eles nascem
    // desta escolha e, se já estavam à vista, para o "Trocar" do cliente.
    const revealsServices = shownStage < 1;
    pendingFocusRef.current = () => {
      const target = revealsServices
        ? servicesSectionRef.current?.querySelector<HTMLElement>(
            "input, button",
          )
        : formRef.current?.querySelector<HTMLElement>(".agenda-new-swap");
      target?.focus();
    };
  }

  function commitName(fromChoice: boolean) {
    setNameCommitted(true);
    if (!fromChoice || shownStage >= 1) return;
    pendingFocusRef.current = () =>
      servicesSectionRef.current
        ?.querySelector<HTMLElement>("input, button")
        ?.focus();
  }

  /**
   * "Revisar N agendamentos": a prévia de série (Goal009) reserva cada
   * ocorrência, inclusive a primeira, então a reserva do horário avulso é
   * liberada antes — e a prévia espera a liberação assentar.
   */
  async function reviewSeries() {
    if (busy || !startTime || other) return;
    setBusy(true);
    setError(null);
    try {
      await hold.releaseSettled();
      const result =
        await getProductServices().calendar.previewAppointmentSeries({
          customerId: selectedCustomer?.id,
          firstDate: date,
          firstStartTime: startTime,
          intervalDays,
          occurrenceCount: repeatCount,
          serviceIds,
        });
      seriesHoldsRef.current = result
        .map((item) => item.holdId)
        .filter((value): value is string => Boolean(value));
      setSeriesPreview(result);
    } catch (caught) {
      setError(
        requestError(caught, "Não foi possível revisar os agendamentos."),
      );
    } finally {
      setBusy(false);
    }
  }

  /** "Voltar": nada é criado, as reservas da revisão voltam e o horário escolhido é reservado de novo. */
  function closeReview() {
    releaseHolds(seriesHoldsRef.current);
    seriesHoldsRef.current = [];
    setSeriesPreview(null);
    if (startTime) void chooseTime(startTime);
  }

  async function retryReview() {
    releaseHolds(seriesHoldsRef.current);
    seriesHoldsRef.current = [];
    setSeriesPreview(null);
    await reviewSeries();
  }

  function finishSeries(created: Appointment[], leftover: string[]) {
    // As reservas confirmadas viraram atendimento; só as das datas puladas
    // ainda existem.
    releaseHolds(leftover);
    seriesHoldsRef.current = [];
    forgetAgendaChanges();
    const first = created[0];
    if (!first) return;
    rememberAppointment(first);
    router.replace(appointmentHref(first.id));
  }

  function swapCustomer() {
    resetSlotChoice();
    setChosenCustomerId(null);
  }

  function toggleService(service: Service) {
    const next = serviceIds.includes(service.id)
      ? serviceIds.filter((id) => id !== service.id)
      : [...serviceIds, service.id];
    resetSlotChoice();
    setSlots([]);
    setError(null);
    setOther(false);
    setServiceIds(next);
    setSlotsLoading(next.length > 0);
  }

  function chooseOtherService(service: Service) {
    setMoreServicesOpen(false);
    setPromotedIds((current) =>
      current.includes(service.id) ? current : [...current, service.id],
    );
    if (!serviceIds.includes(service.id)) toggleService(service);
    pendingFocusRef.current = () =>
      serviceChipsRef.current
        ?.querySelector<HTMLInputElement>(`input[value="${service.id}"]`)
        ?.focus();
  }

  function toggleOther() {
    resetSlotChoice();
    setSlots([]);
    setSlotsLoading(false);
    setError(null);
    setServiceIds([]);
    setManualTime("");
    setOther((current) => !current);
  }

  function changeDate(value: string) {
    setDate(value);
    setSlots([]);
    setSlotsLoading(!other && serviceIds.length > 0);
    resetSlotChoice();
    setError(null);
  }

  async function chooseTime(time: string) {
    if (!time || busy) return;
    setError(null);
    setConflict(null);
    setStartTime(time);
    // "Outro, sem cadastro" não tem serviço, e o hold exige serviço: a
    // proteção contra choque fica por conta da recusa 409 na criação.
    if (other) return;
    try {
      await hold.reserve({
        customerId: selectedCustomer?.id,
        date,
        serviceIds,
        startTime: time,
      });
    } catch (caught) {
      if (isSlotRefusal(caught)) {
        await openConflict(time);
        return;
      }
      setError(requestError(caught, "Não foi possível reservar o horário."));
    }
  }

  async function openConflict(time: string, reason = "") {
    setShowManual(false);
    setConflict({
      entries: null,
      loading: true,
      reason,
      reasonError: null,
      startTime: time,
    });
    const entries = await readOccupancy(date, calendar?.timezone);
    setConflict((current) =>
      current && current.startTime === time
        ? {
            ...current,
            entries:
              entries === null
                ? null
                : occupyingEntries(entries, {
                    date,
                    durationMinutes,
                    startTime: time,
                  }),
            loading: false,
          }
        : current,
    );
  }

  async function create(overlapReason?: string) {
    if (busy || !startTime) return;
    setBusy(true);
    setError(null);
    try {
      const input: CreateAppointmentInput = {
        comments: comments.trim() || undefined,
        customerId: selectedCustomer?.id,
        customerName: selectedCustomer ? undefined : customerName.trim(),
        customerPhone: selectedCustomer
          ? undefined
          : customerPhone.trim() || undefined,
        date,
        durationMinutes: other ? otherMinutes : undefined,
        holdId: other ? undefined : (hold.holdId ?? undefined),
        overlapOverride: overlapReason ? true : undefined,
        overlapOverrideReason: overlapReason,
        serviceIds: other ? [] : serviceIds,
        startTime,
        title: other ? otherTitle.trim() : undefined,
      };
      const appointment = await getProductServices().calendar.createAppointment(
        input,
        newIdempotencyKey(),
      );
      // O que a Agenda leu antes da criação deixou de valer (D-167).
      forgetAgendaChanges();
      rememberAppointment(appointment);
      router.replace(appointmentHref(appointment.id));
    } catch (caught) {
      if (isHoldLostError(caught)) {
        hold.markLost();
        setStartTime("");
        setConflict(null);
        setError(holdLostMessage(caught));
        return;
      }
      if (isSlotRefusal(caught)) {
        hold.release();
        await openConflict(startTime, overlapReason);
        return;
      }
      setError(requestError(caught, "Não foi possível criar o agendamento."));
    } finally {
      setBusy(false);
    }
  }

  function submitOverride() {
    if (!conflict || conflict.loading || busy) return;
    const reason = conflict.reason.trim();
    if (!reason) {
      // Sem motivo o encaixe nem sai da tela: o contrato exige o motivo, e
      // enviar sem ele seria pedir uma recusa que ninguém entende.
      setConflict({
        ...conflict,
        reasonError:
          "Descreva o motivo do encaixe. Sem motivo, o agendamento não é enviado.",
      });
      reasonInputRef.current?.focus();
      return;
    }
    setStartTime(conflict.startTime);
    void create(reason);
  }

  function chooseAnotherTime() {
    resetSlotChoice();
    setManualTime("");
    setFocusTimeRequest((current) => current + 1);
  }

  return (
    <AppointmentFlowShell
      agendaBar={false}
      appointmentRoute={{ date }}
      calendar={calendar}
      closeLabel="Fechar novo agendamento"
      loading={loading}
      title="Novo agendamento"
    >
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {!loading && calendar && !calendar.capabilities.createAppointments ? (
        <ReadOnlyState operation="criar agendamentos" />
      ) : (
        <div className="agenda-new-layout">
          <form
            aria-label="Novo agendamento"
            className="agenda-new-form"
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              if (conflict) submitOverride();
              else if (canSubmit && repeating) void reviewSeries();
              else if (canSubmit) void create();
            }}
            ref={formRef}
          >
            {/* Anuncia a etapa revelada depois da abertura (D-170). */}
            <p aria-live="polite" className="sr-only">
              {announcedStage === 1
                ? "Serviços"
                : announcedStage === 2
                  ? "Data e horário"
                  : announcedStage === 3
                    ? "Repetir este atendimento"
                    : ""}
            </p>
            <div className="agenda-new-columns">
              <div className="agenda-new-column">
                <CustomerField
                  customers={customers}
                  name={customerName}
                  onChoose={chooseCustomer}
                  onCommitName={commitName}
                  onName={setCustomerName}
                  onPhone={setCustomerPhone}
                  onSwap={swapCustomer}
                  phone={customerPhone}
                  selected={selectedCustomer}
                />
              </div>
              <div className="agenda-new-column">
                {shownStage >= 1 && (
                  <fieldset
                    className={clsx("agenda-new-block", enterClass(1))}
                    ref={servicesSectionRef}
                  >
                    <legend className="label">Serviços</legend>
                    {selectableServices.length === 0 ? (
                      <p className="muted">
                        Nenhum serviço disponível para agendamento.
                      </p>
                    ) : (
                      <div className="agenda-new-chips" ref={serviceChipsRef}>
                        {visibleServices.map((item) => (
                          <label className="agenda-new-chip" key={item.id}>
                            <input
                              checked={serviceIds.includes(item.id)}
                              onChange={() => toggleService(item)}
                              type="checkbox"
                              value={item.id}
                            />
                            <span>
                              <Icon name="check" />
                              <span
                                aria-hidden="true"
                                className="agenda-appt-service-dot"
                                {...swatchProps(colors.get(item.id))}
                              />
                              {item.name}
                              <span className="sr-only"> · </span>
                              <small>
                                {durationLabel(item.durationMinutes ?? 0)}
                              </small>
                            </span>
                          </label>
                        ))}
                        {otherServices.length > 0 && (
                          <button
                            aria-haspopup="dialog"
                            className="agenda-new-chip-other agenda-new-chip-more"
                            onClick={() => setMoreServicesOpen(true)}
                            type="button"
                          >
                            Ver outros serviços
                          </button>
                        )}
                        <button
                          aria-pressed={other}
                          className="agenda-new-chip-other"
                          onClick={toggleOther}
                          type="button"
                        >
                          Outro, sem cadastro
                        </button>
                      </div>
                    )}
                    {moreServicesOpen && (
                      <MoreServicesSheet
                        colors={colors}
                        onChoose={chooseOtherService}
                        onClose={() => setMoreServicesOpen(false)}
                        services={otherServices}
                      />
                    )}
                    {!other && (
                      <p className="agenda-new-total">
                        {selectedServices.length === 0 ? (
                          <span>Nenhum serviço escolhido.</span>
                        ) : (
                          <>
                            <span>
                              {selectedServices.length}{" "}
                              {selectedServices.length === 1
                                ? "serviço"
                                : "serviços"}
                            </span>
                            <span className="sr-only"> · </span>
                            <strong>
                              {durationLabel(servicesMinutes)} ·{" "}
                              {totalLabel(total)}
                            </strong>
                          </>
                        )}
                      </p>
                    )}
                    {other && (
                      <div className="agenda-new-other">
                        <label className="field">
                          <span className="label">Título do atendimento</span>
                          <input
                            className="input"
                            maxLength={200}
                            onChange={(event) => {
                              resetSlotChoice();
                              setOtherTitle(event.target.value);
                            }}
                            value={otherTitle}
                          />
                        </label>
                        <label className="field">
                          <span className="label">Duração em minutos</span>
                          <input
                            className="input"
                            inputMode="numeric"
                            max={1440}
                            min={1}
                            onChange={(event) => {
                              setOtherDuration(event.target.value);
                              setConflict(null);
                            }}
                            type="number"
                            value={otherDuration}
                          />
                        </label>
                      </div>
                    )}
                  </fieldset>
                )}
              </div>
            </div>
            {shownStage >= 2 && (
              <section
                aria-labelledby="agenda-new-when-title"
                className={clsx("agenda-new-when", enterClass(2))}
                ref={scheduleSectionRef}
              >
                <div className="agenda-new-when-head">
                  <div className="agenda-new-when-reading">
                    <span
                      className="agenda-new-when-eyebrow"
                      id="agenda-new-when-title"
                    >
                      Data e horário
                    </span>
                    <span
                      aria-live="polite"
                      className="agenda-new-when-summary"
                      key={`${date}-${startTime}`}
                    >
                      {whenDateLabel(date)}
                      <span>
                        {" · "}
                        {startTime
                          ? endTimeLabel(startTime, durationMinutes)
                          : "escolha o horário"}
                      </span>
                    </span>
                  </div>
                  {whoLabel && (
                    <span className="agenda-new-when-who">
                      <span
                        aria-hidden="true"
                        className="agenda-appt-service-dot"
                        {...swatchProps(
                          selectedServices[0] &&
                            colors.get(selectedServices[0].id),
                        )}
                      />
                      {whoLabel}
                    </span>
                  )}
                </div>
                <div className="agenda-new-when-grid">
                  <div
                    aria-labelledby="agenda-new-date-label"
                    className="agenda-new-block"
                    role="group"
                  >
                    <span className="label" id="agenda-new-date-label">
                      Data
                    </span>
                    <DatePicker
                      closedWeekdays={closedWeekdays}
                      label="Dias"
                      min={isoDate(new Date())}
                      onChange={changeDate}
                      value={date}
                    />
                  </div>
                  <fieldset
                    className="agenda-new-block agenda-new-time"
                    disabled={!other && serviceIds.length === 0}
                    ref={timeFieldsetRef}
                  >
                    <legend className="label" ref={timeLegendRef} tabIndex={-1}>
                      Horário
                      {!other && durationMinutes > 0 && (
                        <span className="agenda-new-legend-note">
                          {" "}
                          · livres para {durationLabel(durationMinutes)}
                        </span>
                      )}
                    </legend>
                    <div className="agenda-new-time-card">
                      {other ? (
                        <p className="muted">
                          Sem serviço cadastrado não há horários sugeridos.
                          Digite o horário abaixo.
                        </p>
                      ) : serviceIds.length === 0 ? (
                        <p className="muted">
                          Escolha um serviço para ver os horários livres.
                        </p>
                      ) : slotsLoading ? (
                        <p>Consultando disponibilidade…</p>
                      ) : slots.length === 0 ? (
                        <p className="muted">
                          Nenhum horário disponível para esta seleção.
                        </p>
                      ) : null}
                      {(!other || conflict) && (
                        <div className="agenda-new-chips">
                          {!other &&
                            !slotsLoading &&
                            slots.map((slot) => {
                              const refused =
                                conflict?.startTime === slot.startTime;
                              return (
                                <label
                                  className={`agenda-new-chip agenda-new-slot${refused ? " is-conflict" : ""}`}
                                  key={`${slot.date}-${slot.startTime}`}
                                >
                                  <input
                                    checked={startTime === slot.startTime}
                                    name="start-time"
                                    onChange={() =>
                                      void chooseTime(slot.startTime)
                                    }
                                    type="radio"
                                  />
                                  <span>
                                    {refused && (
                                      <ConflictGlyph
                                        size={14}
                                        strokeWidth={2.25}
                                      />
                                    )}
                                    {slot.startTime}
                                    {refused && (
                                      <span className="sr-only">
                                        {" "}
                                        · ocupado
                                      </span>
                                    )}
                                  </span>
                                </label>
                              );
                            })}
                          {conflict &&
                            (other ||
                              slotsLoading ||
                              !slots.some(
                                (slot) => slot.startTime === conflict.startTime,
                              )) && (
                              <label className="agenda-new-chip agenda-new-slot is-conflict">
                                <input
                                  checked
                                  name="start-time"
                                  onChange={() => undefined}
                                  type="radio"
                                />
                                <span>
                                  <ConflictGlyph size={14} strokeWidth={2.25} />
                                  {conflict.startTime}
                                  <span className="sr-only"> · ocupado</span>
                                </span>
                              </label>
                            )}
                          {!other && (
                            <button
                              aria-expanded={showManual}
                              className="agenda-new-chip-other"
                              disabled={serviceIds.length === 0}
                              onClick={() =>
                                setShowManual((current) => !current)
                              }
                              type="button"
                            >
                              Outro horário
                            </button>
                          )}
                        </div>
                      )}
                      {(other || showManual) && !conflict && (
                        <div className="agenda-new-manual">
                          <TimePicker
                            businessHours={businessHours}
                            duration={durationMinutes}
                            label="Outro horário, fora dos oferecidos"
                            onChange={setManualTime}
                            value={manualTime}
                          />
                          <button
                            className="btn btn-secondary"
                            disabled={!manualTime || (other && !otherReady)}
                            onClick={() => void chooseTime(manualTime)}
                            type="button"
                          >
                            Usar este horário
                          </button>
                          <p className="muted">
                            Um horário fora dos oferecidos pode estar ocupado.
                            Se estiver, a agenda mostra o que ocupa o intervalo
                            e sobrepor exige motivo.
                          </p>
                        </div>
                      )}
                    </div>
                  </fieldset>
                </div>
              </section>
            )}
            {shownStage >= 3 && !other && (
              <div
                className={clsx("agenda-new-repeat", enterClass(3))}
                ref={repeatSectionRef}
              >
                <div className="agenda-new-repeat-row">
                  <span
                    className="agenda-new-repeat-label"
                    id="agenda-new-repeat-label"
                  >
                    Repetir este atendimento
                  </span>
                  <button
                    aria-checked={repeat}
                    aria-labelledby="agenda-new-repeat-label"
                    className="agenda-days-switch"
                    disabled={busy}
                    onClick={() => setRepeat((current) => !current)}
                    role="switch"
                    type="button"
                  >
                    <span aria-hidden="true" className="agenda-days-knob" />
                  </button>
                </div>
                {repeat && (
                  <RepeatFields
                    count={repeatCount}
                    intervalDays={intervalDays}
                    onCount={setRepeatCount}
                    onInterval={setRepeatInterval}
                    suggestedDays={suggestedInterval}
                  />
                )}
              </div>
            )}
            {conflict && (
              <>
                <SlotConflictNotice
                  availability={availabilitySettings}
                  date={date}
                  durationMinutes={durationMinutes}
                  entries={conflict.entries}
                  loading={conflict.loading}
                  startTime={conflict.startTime}
                />
                <div className="agenda-new-block">
                  <label className="label" htmlFor="agenda-new-reason">
                    Motivo do encaixe
                  </label>
                  <input
                    aria-describedby={
                      conflict.reasonError
                        ? "agenda-new-reason-error"
                        : undefined
                    }
                    aria-invalid={conflict.reasonError ? true : undefined}
                    className="input"
                    id="agenda-new-reason"
                    onChange={(event) => {
                      const value = event.target.value;
                      setConflict((current) =>
                        current
                          ? { ...current, reason: value, reasonError: null }
                          : current,
                      );
                    }}
                    ref={reasonInputRef}
                    type="text"
                    value={conflict.reason}
                  />
                  {conflict.reasonError && (
                    <p
                      className="form-error"
                      id="agenda-new-reason-error"
                      role="alert"
                    >
                      {conflict.reasonError}
                    </p>
                  )}
                </div>
              </>
            )}
            {shownStage >= 2 && (
              <>
                <div className={clsx("agenda-new-note", enterClass(2))}>
                  {showComments ? (
                    <label className="field">
                      <span className="label">Observações</span>
                      <textarea
                        className="input agenda-new-textarea"
                        onChange={(event) => setComments(event.target.value)}
                        rows={3}
                        value={comments}
                      />
                    </label>
                  ) : (
                    <button
                      aria-expanded={false}
                      className="agenda-new-note-button"
                      onClick={() => setShowComments(true)}
                      type="button"
                    >
                      <Icon name="plus" />
                      Adicionar observação
                    </button>
                  )}
                </div>
              </>
            )}
            {shownStage < 2 ? null : conflict ? (
              <div className="agenda-new-footer is-conflict">
                <Button
                  className="agenda-new-cta"
                  disabled={conflict.loading}
                  loading={busy}
                  onClick={submitOverride}
                  type="button"
                >
                  Encaixar mesmo assim
                </Button>
                <Button
                  className="agenda-new-cta"
                  disabled={busy}
                  onClick={chooseAnotherTime}
                  type="button"
                  variant="secondary"
                >
                  Escolher outro horário
                </Button>
              </div>
            ) : (
              <div className={clsx("agenda-new-footer", enterClass(2))}>
                <p className="agenda-hold-status" role="status">
                  {!other && hold.phase !== "none"
                    ? holdNotice(hold, calendar?.timezone)
                    : ""}
                </p>
                {blockedReason && (
                  <p className="agenda-new-blocked">{blockedReason}</p>
                )}
                <Button
                  className="agenda-new-cta"
                  disabled={!canSubmit}
                  loading={busy}
                  type="submit"
                >
                  {submitLabel}
                </Button>
              </div>
            )}
            {seriesPreview && (
              <RepeatReviewSheet
                comments={comments.trim() || undefined}
                customer={
                  selectedCustomer
                    ? { customerId: selectedCustomer.id }
                    : {
                        customerName: customerName.trim(),
                        customerPhone: customerPhone.trim() || undefined,
                      }
                }
                customerLabel={
                  selectedCustomer
                    ? personLabel(selectedCustomer)
                    : customerName.trim()
                }
                intervalDays={intervalDays}
                occurrences={seriesPreview}
                onBack={closeReview}
                onConfirmed={finishSeries}
                onRetry={() => void retryReview()}
                serviceIds={serviceIds}
                serviceLabel={selectedServices
                  .map((item) => item.name)
                  .join(" + ")}
                unitPrice={
                  total.type === "NONE" || total.amount === null
                    ? null
                    : {
                        amount: total.amount,
                        startingAt: total.type === "STARTING_AT",
                      }
                }
              />
            )}
          </form>
        </div>
      )}
    </AppointmentFlowShell>
  );
}

/**
 * A recusa `409 SLOT_UNAVAILABLE` chega do BFF real como `UPSTREAM_ERROR` com
 * o código de origem em `details.upstreamCode`; os dois formatos valem.
 */
function isSlotRefusal(caught: unknown): boolean {
  return isSlotConflictError(caught);
}

interface ConflictState {
  entries: AgendaEntry[] | null;
  loading: boolean;
  reason: string;
  reasonError: string | null;
  startTime: string;
}

/**
 * Ocupação real do dia, para dizer o que toma o intervalo recusado. Falha de
 * leitura devolve `null` — a tela diz que não conseguiu listar, em vez de
 * afirmar que nada ocupa.
 */
export async function readOccupancy(
  date: string,
  timezone?: string | null,
): Promise<AgendaEntry[] | null> {
  try {
    const [appointments, timeBlocks] = await Promise.all([
      getProductServices().calendar.listAppointments({
        endDate: date,
        startDate: date,
      }),
      getProductServices().calendar.listTimeBlocks({
        endDate: date,
        startDate: date,
      }),
    ]);
    return buildAgendaEntries({
      appointments,
      exceptions: [],
      timeBlocks,
      timezone,
    });
  } catch {
    return null;
  }
}

export interface AgreementTotal {
  amount: number | null;
  type: "FIXED" | "STARTING_AT" | "NONE";
}

/**
 * Mesma regra única do total do acordo do Scheduling (`computeAgreementTotal`,
 * Goal007), reimplementada aqui por decisão de contrato (D-011): os dois lados
 * não compartilham pacote para este cálculo. Qualquer item `ON_REQUEST` ou
 * `NOT_INFORMED` derruba o total — a tela não fabrica valor fechado, e o
 * `totalPriceType` que o contrato devolve depois da criação é a mesma coisa.
 */
export function agreementTotal(
  items: Array<{ price: number | null; priceType: Service["priceType"] }>,
): AgreementTotal {
  if (items.length === 0) return { amount: null, type: "NONE" };
  const hasUnpriced = items.some(
    (item) =>
      item.priceType === "ON_REQUEST" || item.priceType === "NOT_INFORMED",
  );
  if (hasUnpriced) return { amount: null, type: "NONE" };
  const amount = items.reduce((sum, item) => sum + (item.price ?? 0), 0);
  const allFixed = items.every((item) => item.priceType === "FIXED");
  return { amount, type: allFixed ? "FIXED" : "STARTING_AT" };
}

export function totalLabel(total: AgreementTotal): string {
  if (total.type === "NONE" || total.amount === null) return "Sob consulta";
  if (total.type === "STARTING_AT") {
    return `A partir de ${formatMoney(total.amount)}`;
  }
  return formatMoney(total.amount);
}

/** "Hoje, 13 de outubro", "Amanhã, …", "Quinta, 16 de outubro". */
function whenDateLabel(date: string): string {
  // Meia-noite local: `parseDate` devolve meio-dia, e meio dia de diferença
  // arredondava hoje para "Amanhã".
  const parsed = parseIsoDate(date) ?? parseDate(date);
  const diff = daysFromToday(parsed);
  const weekday =
    diff === 0
      ? "Hoje"
      : diff === 1
        ? "Amanhã"
        : capitalize(WEEKDAYS[parsed.getDay()].replace("-feira", ""));
  return `${weekday}, ${parsed.getDate()} de ${MONTHS[parsed.getMonth()]}`;
}

/** "14:30 – 15:15"; sem duração, só o início. */
function endTimeLabel(startTime: string, durationMinutes: number): string {
  const start = parseClock(startTime);
  if (!start || durationMinutes <= 0) return startTime;
  const total = (clockMinutes(start) + durationMinutes) % 1440;
  return `${startTime} – ${formatClock({ hour: Math.floor(total / 60), minute: total % 60 })}`;
}
