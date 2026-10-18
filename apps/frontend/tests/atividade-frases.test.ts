/**
 * Frases da tela "Atividade" (D-176): o registro vira português claro, com
 * quem fez ("Você" ou "A IA") e o antes e o depois — nunca termo interno.
 */
import { describe, expect, it } from "vitest";

import type { ActivityEntry } from "@/data";
import {
  activityHref,
  activityNote,
  activitySentence,
  changeLines,
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

describe("frases do registro de atividade", () => {
  it("diz que a IA remarcou, de que horário para qual", () => {
    const rescheduled = entry({
      actor: "AI",
      action: "appointment.rescheduled",
      changes: [
        { field: "startsAt", before: "2026-10-20T14:00", after: "2026-10-20T15:30" },
      ],
      details: { customerName: "Ana", startsAt: "2026-10-20T15:30" },
    });
    expect(activitySentence(rescheduled)).toBe(
      "A IA remarcou Ana de 14:00 para 15:30 em 20/10",
    );
    // O horário já está na frase: nenhuma linha repetida embaixo.
    expect(changeLines(rescheduled)).toEqual([]);
  });

  it("remarcação para outro dia mostra as duas datas", () => {
    expect(
      activitySentence(
        entry({
          action: "appointment.rescheduled",
          changes: [
            { field: "startsAt", before: "2026-10-20T14:00", after: "2026-10-22T09:00" },
          ],
          details: { customerName: "Ana" },
        }),
      ),
    ).toBe("Você remarcou Ana de 20/10 às 14:00 para 22/10 às 09:00");
  });

  it("marca pela IA com horário e serviço, e cancela com o motivo", () => {
    expect(
      activitySentence(
        entry({
          actor: "AI",
          details: {
            customerName: "Bia",
            services: ["Corte", "Escova"],
            startsAt: "2026-10-21T10:00",
          },
        }),
      ),
    ).toBe("A IA marcou Bia para 21/10 às 10:00 · Corte, Escova");

    const cancelled = entry({
      action: "appointment.cancelled",
      changes: [{ field: "status", before: "CONFIRMED", after: "CANCELLED" }],
      details: { customerName: "Bia", startsAt: "2026-10-21T10:00", reason: "Cliente viajou" },
    });
    expect(activitySentence(cancelled)).toBe(
      "Você cancelou o horário de Bia de 21/10 às 10:00",
    );
    expect(changeLines(cancelled)).toEqual([
      { label: "Situação", before: "Confirmado", after: "Cancelado" },
    ]);
    expect(activityNote(cancelled)).toBe("Motivo: Cliente viajou");
  });

  it("mostra nome e telefone de antes e de depois na edição do cliente", () => {
    const edited = entry({
      area: "CUSTOMERS",
      action: "customer.updated",
      entity: { type: "customer", id: "customer-1", label: "Ana Souza" },
      changes: [
        { field: "name", before: "Ana", after: "Ana Souza" },
        { field: "phone", before: "+5511988887777", after: "+5511977776666" },
      ],
    });
    expect(activitySentence(edited)).toBe("Você alterou o cadastro de Ana Souza");
    expect(changeLines(edited)).toEqual([
      { label: "Nome", before: "Ana", after: "Ana Souza" },
      { label: "Telefone", before: "(11) 98888-7777", after: "(11) 97777-6666" },
    ]);
    expect(activityHref(edited)).toBe(
      "/clientes/detalhes?id=customer-1&voltar=%2Fconfiguracoes%2Fatividade",
    );
  });

  it("traduz preço, duração, situação do serviço e grade semanal", () => {
    const service = entry({
      area: "SERVICES",
      action: "service.updated",
      entity: { type: "service", id: "service-1", label: "Corte" },
      changes: [
        { field: "price", before: 80, after: 95.5 },
        { field: "durationMinutes", before: 30, after: 60 },
      ],
    });
    expect(changeLines(service)).toEqual([
      { label: "Preço", before: "R$ 80", after: "R$ 95,50" },
      { label: "Duração", before: "30 min", after: "1 h" },
    ]);

    const week = entry({
      area: "SETTINGS",
      action: "settings.availability_updated",
      entity: { type: "settings", id: null, label: null },
      changes: [
        { field: "weekday.0", before: "08:00–20:00", after: null },
        { field: "weekday.1", before: "08:00–20:00", after: "09:00–18:00" },
      ],
    });
    expect(activitySentence(week)).toBe("Você alterou os horários de atendimento");
    expect(changeLines(week)).toEqual([
      { label: "Domingo", before: "08:00–20:00", after: "Fechado" },
      { label: "Segunda", before: "08:00–20:00", after: "09:00–18:00" },
    ]);
  });

  it("a IA passando a conversa nunca vira termo interno", () => {
    const handoff = entry({
      actor: "AI",
      area: "CONVERSATIONS",
      action: "conversation.handoff_requested",
      entity: { type: "conversation", id: "conversation-1", label: "Carla" },
      details: { reason: "pediu desconto", summary: "Quer negociar o valor" },
    });
    expect(activitySentence(handoff)).toBe(
      "A IA passou a conversa com Carla para você",
    );
    expect(activityNote(handoff)).toBe("Quer negociar o valor");
    expect(activityHref(handoff)).toBe("/conversas/conversation-1");
  });

  it("nenhuma ação conhecida usa tenant, sync, handoff, LLM ou provider", () => {
    const actions = [
      "appointment.created", "appointment.rescheduled", "appointment.cancelled",
      "appointment.completed", "appointment.no_show", "appointment.final_value_set",
      "appointment.presence_confirmed", "appointment.deleted", "customer.created",
      "customer.updated", "customer.deleted", "customer.guardian_set",
      "customer.guardian_confirmed", "customer.guardian_cleared", "customer.note_added",
      "customer.note_deleted", "customer.note_ai_access", "customer.tag_added",
      "customer.tag_deleted", "customer.tag_ai_access", "customer.memory_added",
      "customer.memory_ai_access", "customer.memory_removed", "service.created",
      "service.updated", "service.archived", "service.reactivated",
      "service.ai_instruction_updated", "agenda.block_created", "agenda.block_removed",
      "agenda.block_moved", "agenda.block_series_created", "agenda.block_series_updated",
      "agenda.block_series_removed", "agenda.extra_availability_added",
      "agenda.extra_availability_removed", "agenda.unavailability_added",
      "agenda.unavailability_removed", "settings.business_updated", "settings.ai_enabled",
      "settings.ai_paused", "settings.ai_updated", "settings.ai_sandbox_enabled",
      "settings.ai_sandbox_disabled", "settings.ai_sandbox_updated",
      "settings.availability_updated",
      "settings.reminders_updated", "settings.timezone_updated",
      "settings.notifications_updated", "settings.retention_updated",
      "settings.whatsapp_connect_started", "settings.whatsapp_disconnected",
      "account.profile_updated", "account.password_changed", "account.deletion_requested",
      "account.deletion_cancelled", "knowledge.document_created",
      "knowledge.document_updated", "knowledge.document_removed",
      "knowledge.other_info_updated", "conversation.taken_over",
      "conversation.released_to_ai", "conversation.handoff_requested",
      "conversation.category_changed", "conversation.contact_ignored",
      "conversation.contact_unignored", "conversation.resolved", "import.started",
      "import.completed", "import.source_connected", "import.source_disconnected",
    ];
    for (const action of actions) {
      for (const actor of ["AI", "USER"] as const) {
        const sentence = activitySentence(entry({ action, actor }));
        expect(sentence, action).not.toMatch(/tenant|sync|handoff|llm|provider|undefined|null/iu);
        expect(sentence, action).not.toMatch(/fez uma alteração/u);
      }
    }
  });
});
