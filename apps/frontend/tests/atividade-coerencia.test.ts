/**
 * Coerência de cada tipo de registro da tela "Atividade" (D-200): valores
 * legíveis para quem não é técnico — cor com nome e círculo, telefone
 * formatado, minutos, dinheiro, fuso, sim/não —, nunca "Campo" nem dígitos
 * crus, inclusive nas linhas gravadas antes da correção.
 */
import { describe, expect, it } from "vitest";

import type { ActivityEntry } from "@/data";
import {
  activityNote,
  activitySentence,
  changeLines,
  formatChangeValue,
  UNKNOWN_FIELD_LABEL,
} from "@/features/activity/activityCopy";

function entry(overrides: Partial<ActivityEntry>): ActivityEntry {
  return {
    id: "scheduling:1",
    occurredAt: "2026-10-16T15:00:00.000Z",
    actor: "USER",
    area: "AGENDA",
    action: "appointment.created",
    entity: { type: "appointment", id: "appointment-1", label: "Ana" },
    changes: [],
    details: null,
    ...overrides,
  };
}

/** As linhas como a tela as lê: rótulo, antes (ou `null`) e depois. */
function lines(value: ActivityEntry) {
  return changeLines(value).map((line) => ({
    label: line.label,
    before: line.before?.text ?? null,
    after: line.after.text,
  }));
}

const service = (
  changes: ActivityEntry["changes"],
  action = "service.updated",
) =>
  entry({
    area: "SERVICES",
    action,
    entity: { type: "service", id: "service-1", label: "Teste alérgico" },
    changes,
  });

const settings = (
  action: string,
  type: string,
  changes: ActivityEntry["changes"],
) =>
  entry({
    area: "SETTINGS",
    action,
    entity: { type, id: null, label: null },
    changes,
  });

describe("cor do serviço", () => {
  it("um campo só, com o círculo e o nome da cor", () => {
    const changed = service([
      { field: "color", before: "ROSE", after: "#d479ff" },
    ]);
    expect(activitySentence(changed)).toBe(
      "Você alterou o serviço Teste alérgico",
    );
    expect(changeLines(changed)).toEqual([
      {
        field: "color",
        label: "Cor",
        before: { text: "Rosa-antigo", color: "ROSE" },
        after: { text: "#D479FF", color: "#d479ff" },
      },
    ]);
    expect(
      lines(service([{ field: "color", before: "#d479ff", after: "SKY" }])),
    ).toEqual([{ label: "Cor", before: "#D479FF", after: "Ameixa" }]);
  });

  it("registro antigo (só colorHex): a anterior não registrada, sem traço solto", () => {
    const legacy = service([
      { field: "colorHex", before: null, after: "#d479ff" },
    ]);
    expect(lines(legacy)).toEqual([
      { label: "Cor", before: "Não registrada", after: "#D479FF" },
    ]);
    const [line] = changeLines(legacy);
    expect(line?.before).toMatchObject({ muted: true });
    expect(line?.before?.color).toBeUndefined();
    expect(
      lines(
        service([{ field: "colorHex", before: "#71d6d2", after: "#89e7e3" }]),
      ),
    ).toEqual([{ label: "Cor", before: "#71D6D2", after: "#89E7E3" }]);
    expect(
      lines(service([{ field: "colorHex", before: "#71d6d2", after: null }])),
    ).toEqual([
      { label: "Cor", before: "#71D6D2", after: "Uma das cores sugeridas" },
    ]);
  });

  it("token e hex no mesmo registro viram uma linha só", () => {
    expect(
      lines(
        service([
          { field: "colorToken", before: "ROSE", after: null },
          { field: "colorHex", before: null, after: "#d479ff" },
        ]),
      ),
    ).toEqual([{ label: "Cor", before: "Rosa-antigo", after: "#D479FF" }]);
  });

  it("serviço criado mostra o que entrou; arquivado não repete a situação", () => {
    expect(
      lines(
        service(
          [
            { field: "name", before: null, after: "Teste alérgico" },
            { field: "durationMinutes", before: null, after: 90 },
            { field: "price", before: null, after: 90 },
            { field: "color", before: null, after: "EMERALD" },
            { field: "active", before: null, after: true },
          ],
          "service.created",
        ),
      ),
    ).toEqual([
      { label: "Duração", before: null, after: "1 h 30 min" },
      { label: "Preço", before: null, after: "R$ 90,00" },
      { label: "Cor", before: null, after: "Oliva" },
    ]);
    expect(
      changeLines(
        service(
          [{ field: "active", before: true, after: false }],
          "service.archived",
        ),
      ),
    ).toEqual([]);
  });
});

describe("modo sandbox", () => {
  it("ligar e desligar são frases próprias, sem linha repetida", () => {
    const enabled = settings("settings.ai_sandbox_enabled", "ai_settings", [
      { field: "enabled", before: false, after: true },
    ]);
    expect(activitySentence(enabled)).toBe("Você ligou o modo sandbox");
    expect(changeLines(enabled)).toEqual([]);
    expect(activityNote(enabled)).toMatch(/deixam de sair para os clientes/u);
    const disabled = settings("settings.ai_sandbox_disabled", "ai_settings", [
      { field: "enabled", before: true, after: false },
    ]);
    expect(activitySentence(disabled)).toBe("Você desligou o modo sandbox");
    expect(activityNote(disabled)).toBe(
      "As mensagens voltaram a sair para os clientes.",
    );
  });

  it("registro antigo, só com a contagem: nunca 'Campo 0 → 1'", () => {
    const legacy = settings("settings.ai_sandbox_updated", "ai_settings", [
      { field: "exceptionCount", before: 0, after: 1 },
    ]);
    expect(activitySentence(legacy)).toBe(
      "Você mudou quem recebe de verdade no modo sandbox",
    );
    expect(lines(legacy)).toEqual([
      {
        label: "Números que recebem de verdade",
        before: "Nenhum",
        after: "1 número",
      },
    ]);
  });

  it("registro novo: os números mascarados, um por linha", () => {
    const first = settings("settings.ai_sandbox_updated", "ai_settings", [
      { field: "exceptionPhones", before: null, after: "+55 55 •••••-7958" },
    ]);
    expect(lines(first)).toEqual([
      {
        label: "Números que recebem de verdade",
        before: "Nenhum",
        after: "+55 55 •••••-7958",
      },
    ]);
    const [line] = changeLines(
      settings("settings.ai_sandbox_updated", "ai_settings", [
        {
          field: "exceptionPhones",
          before: "+55 55 •••••-7958",
          after: "+55 55 •••••-7958, +55 11 •••••-5678",
        },
      ]),
    );
    expect(line?.after.items).toEqual([
      "+55 55 •••••-7958",
      "+55 11 •••••-5678",
    ]);
  });
});

describe("contatos e clientes", () => {
  const contact = (
    label: string | null,
    action = "conversation.contact_ignored",
  ) =>
    entry({
      area: "CONVERSATIONS",
      action,
      entity: { type: "conversation", id: "conversation-1", label },
    });

  it("o nome quando há, senão o telefone formatado", () => {
    expect(activitySentence(contact("555596936463"))).toBe(
      "Você pediu para a IA não atender +55 55 99693-6463",
    );
    expect(
      activitySentence(contact("Maria", "conversation.contact_unignored")),
    ).toBe("Você voltou a deixar a IA atender Maria");
    expect(
      activitySentence(
        contact("555596513889", "conversation.contact_unignored"),
      ),
    ).toBe("Você voltou a deixar a IA atender +55 55 99651-3889");
  });

  it("identificador do WhatsApp que não é telefone nunca aparece cru", () => {
    expect(activitySentence(contact("123456789012345"))).toBe(
      "Você pediu para a IA não atender um contato do WhatsApp",
    );
  });

  it("cliente e atendimento só com telefone saem formatados", () => {
    expect(
      activitySentence(
        entry({
          area: "CUSTOMERS",
          action: "customer.created",
          actor: "AI",
          entity: { type: "customer", id: "c-1", label: "+555531919817" },
        }),
      ),
    ).toBe("A IA cadastrou +55 55 3191-9817");
    expect(
      activitySentence(
        entry({
          action: "appointment.cancelled",
          details: { customerName: "+5511912345678" },
        }),
      ),
    ).toBe("Você cancelou o horário de +55 11 91234-5678");
    expect(
      lines(
        entry({
          area: "CUSTOMERS",
          action: "customer.created",
          entity: { type: "customer", id: "c-1", label: "Ana" },
          changes: [
            { field: "name", before: null, after: "Ana" },
            { field: "phone", before: null, after: "+555531919817" },
          ],
        }),
      ),
    ).toEqual([{ label: "Telefone", before: null, after: "+55 55 3191-9817" }]);
  });

  it("desativar e reativar cliente têm frase própria", () => {
    const customer = { type: "customer", id: "c-1", label: "Ana Cristina" };
    expect(
      activitySentence(
        entry({
          area: "CUSTOMERS",
          action: "customer.deactivated",
          entity: customer,
        }),
      ),
    ).toBe("Você desativou Ana Cristina");
    expect(
      activitySentence(
        entry({
          area: "CUSTOMERS",
          action: "customer.reactivated",
          entity: customer,
        }),
      ),
    ).toBe("Você reativou Ana Cristina");
  });

  it("observação, etiqueta e preferência: o que entrou ou saiu, sem '— →'", () => {
    const customer = { type: "customer", id: "c-1", label: "Ana" };
    expect(
      lines(
        entry({
          area: "CUSTOMERS",
          action: "customer.note_added",
          entity: customer,
          changes: [{ field: "note", before: null, after: "Alergia a cola" }],
        }),
      ),
    ).toEqual([{ label: "Observação", before: null, after: "Alergia a cola" }]);
    expect(
      lines(
        entry({
          area: "CUSTOMERS",
          action: "customer.tag_deleted",
          entity: customer,
          changes: [{ field: "tag", before: "VIP", after: null }],
        }),
      ),
    ).toEqual([{ label: "Etiqueta", before: null, after: "VIP" }]);
    expect(
      lines(
        entry({
          area: "CUSTOMERS",
          actor: "AI",
          action: "customer.memory_added",
          entity: customer,
          changes: [
            { field: "memory.PREFERRED_PERIOD", before: null, after: "Manhã" },
          ],
        }),
      ),
    ).toEqual([{ label: "Período preferido", before: null, after: "Manhã" }]);
    expect(
      lines(
        entry({
          area: "CUSTOMERS",
          action: "customer.tag_ai_access",
          entity: customer,
          changes: [{ field: "aiAuthorized", before: false, after: true }],
        }),
      ),
    ).toEqual([{ label: "A IA pode usar", before: "Não", after: "Sim" }]);
  });
});

describe("configurações e agenda", () => {
  it("lembretes: minutos por extenso, sim/não, escolha e mensagem", () => {
    expect(
      lines(
        settings("settings.reminders_updated", "settings", [
          { field: "reminder.FIRST", before: 1440, after: 335 },
          { field: "reminder.SECOND", before: null, after: 120 },
          { field: "confirmationEnabled", before: false, after: true },
          { field: "pricePolicy", before: "NEVER", after: "WHEN_FIXED" },
          {
            field: "messageExample",
            before: null,
            after: "Oi! Lembrete do seu horário.",
          },
        ]),
      ),
    ).toEqual([
      {
        label: "Primeiro lembrete",
        before: "1 dia antes",
        after: "5 h 35 min antes",
      },
      { label: "Segundo lembrete", before: "Sem lembrete", after: "2 h antes" },
      { label: "Pedir confirmação", before: "Não", after: "Sim" },
      {
        label: "Preço no lembrete",
        before: "Não mostrar",
        after: "Mostrar quando for fixo",
      },
      {
        label: "Mensagem de exemplo",
        before: "Sem mensagem",
        after: "Oi! Lembrete do seu horário.",
      },
    ]);
  });

  it("valor final em reais, com centavos", () => {
    expect(
      lines(
        entry({
          action: "appointment.final_value_set",
          changes: [{ field: "finalValue", before: null, after: 90 }],
          details: { customerName: "Ana" },
        }),
      ),
    ).toEqual([
      { label: "Valor final", before: "Sem valor", after: "R$ 90,00" },
    ]);
  });

  it("negócio: fuso, atendimento e segmento legíveis", () => {
    expect(
      lines(
        entry({
          area: "SETTINGS",
          action: "settings.business_updated",
          entity: { type: "business", id: null, label: "Studio" },
          changes: [
            {
              field: "timezone",
              before: "America/Sao_Paulo",
              after: "America/Manaus",
            },
            {
              field: "modalities",
              before: "ON_SITE",
              after: "AT_HOME,ON_SITE",
            },
            { field: "category", before: "Cílios", after: "Sobrancelhas" },
          ],
        }),
      ),
    ).toEqual([
      {
        label: "Fuso horário",
        before: "Brasília (GMT−3)",
        after: "Manaus (GMT−4)",
      },
      {
        label: "Atendimento",
        before: "Local próprio",
        after: "A domicílio, Local próprio",
      },
      { label: "Segmento", before: "Cílios", after: "Sobrancelhas" },
    ]);
  });

  it("antecedência e intervalos em minutos, horas e dias", () => {
    expect(
      lines(
        settings("settings.availability_updated", "settings", [
          { field: "minLeadMinutes", before: 120, after: 90 },
          { field: "maxLeadDays", before: 30, after: 60 },
          { field: "granularityMinutes", before: 30, after: 15 },
          { field: "customerChangeMinNoticeMinutes", before: 0, after: 1440 },
        ]),
      ),
    ).toEqual([
      { label: "Antecedência mínima", before: "2 h", after: "1 h 30 min" },
      { label: "Agenda aberta até", before: "30 dias", after: "60 dias" },
      { label: "Intervalo entre horários", before: "30 min", after: "15 min" },
      { label: "Aviso mínimo para mudar", before: "0 min", after: "1 dia" },
    ]);
  });

  it("IA: estilo traduzido; ligar e pausar sem linha repetida", () => {
    const tone = settings("settings.ai_updated", "ai_settings", [
      { field: "tone", before: "CASUAL", after: "BALANCED" },
    ]);
    expect(activitySentence(tone)).toBe("Você mudou o estilo da IA");
    expect(lines(tone)).toEqual([
      { label: "Estilo da IA", before: "Descontraída", after: "Equilibrada" },
    ]);
    expect(
      changeLines(
        settings("settings.ai_paused", "ai_settings", [
          { field: "enabled", before: true, after: false },
        ]),
      ),
    ).toEqual([]);
  });

  it("guarda das conversas em dias; avisos em sim/não", () => {
    expect(
      lines(
        settings("settings.retention_updated", "retention_settings", [
          { field: "commercialRetentionDays", before: 90, after: 30 },
        ]),
      ),
    ).toEqual([
      { label: "Conversas comerciais", before: "90 dias", after: "30 dias" },
    ]);
    expect(
      lines(
        settings("settings.notifications_updated", "notification_preference", [
          { field: "aiAppointmentCreated", before: false, after: true },
        ]),
      ),
    ).toEqual([
      { label: "Avisar quando a IA marcar", before: "Não", after: "Sim" },
    ]);
  });

  it("compromisso pessoal, série com os dias e importação com falhas", () => {
    expect(
      activitySentence(
        entry({
          action: "agenda.block_created",
          entity: { type: "time_block", id: "b-1", label: "Dentista" },
          details: {
            kind: "PERSONAL",
            startsAt: "2026-10-20T14:00",
            endsAt: "2026-10-20T15:00",
            title: "Dentista",
          },
        }),
      ),
    ).toBe(
      "Você marcou um compromisso pessoal em 20/10, das 14:00 às 15:00 “Dentista”",
    );
    const series = entry({
      action: "agenda.block_series_created",
      entity: { type: "block_series", id: "s-1", label: "Almoço" },
      details: {
        kind: "BLOCK",
        daysOfWeek: [3, 1],
        startTime: "12:00",
        endTime: "13:00",
      },
    });
    expect(activitySentence(series)).toBe(
      "Você criou um bloqueio que se repete “Almoço”",
    );
    expect(activityNote(series)).toBe(
      "Repete segunda e quarta, das 12:00 às 13:00",
    );
    expect(
      activityNote(
        entry({
          area: "IMPORT",
          action: "import.completed",
          details: { counts: { imported: 2396, failed: 173 } },
        }),
      ),
    ).toBe("2.396 itens importados · 173 não importados");
  });
});

describe("campo que a tela não conhece", () => {
  it("ganha rótulo neutro, nunca 'Campo', e valor legível", () => {
    expect(
      lines(
        settings("settings.business_updated", "business", [
          { field: "someNewFlag", before: false, after: true },
          { field: "someDate", before: null, after: "2026-10-20" },
        ]),
      ),
    ).toEqual([
      { label: UNKNOWN_FIELD_LABEL, before: "Não", after: "Sim" },
      { label: UNKNOWN_FIELD_LABEL, before: "—", after: "20/10/2026" },
    ]);
    expect(UNKNOWN_FIELD_LABEL).not.toBe("Campo");
  });

  it("hora local e data solta saem em pt-BR", () => {
    const base = entry({});
    expect(formatChangeValue(base, "startsAt", "2026-10-20T14:00").text).toBe(
      "20/10 às 14:00",
    );
    expect(formatChangeValue(base, "anything", "2026-10-20").text).toBe(
      "20/10/2026",
    );
  });
});
