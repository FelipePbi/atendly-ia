#!/usr/bin/env node
import { createRequire } from "node:module";

const requireFromBff = createRequire(new URL("../apps/bff/package.json", import.meta.url));
const { Client } = requireFromBff("pg");

const usage = `Usage:
  API_DATABASE_URL=... CUSTOMER_PHONE=... SINCE_ISO=... npm run smoke:final-audit

Optional:
  BFF_DATABASE_URL=...
  INBOUND_TEXT_MARKER=...

This audit verifies production evidence after a real WhatsApp smoke:
- API recorded inbound customer message.
- API recorded outbound AI message sent through Evolution Go.
- API recorded a real Minha Agenda schedule/reschedule write.
- BFF inbox recorded the inbound customer message, when BFF_DATABASE_URL is set.
`;

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(usage.trim());
  process.exit(0);
}

const config = {
  apiDatabaseUrl: process.env.API_DATABASE_URL,
  bffDatabaseUrl: process.env.BFF_DATABASE_URL,
  customerPhone: normalizePhone(process.env.CUSTOMER_PHONE || ""),
  sinceIso: process.env.SINCE_ISO,
  inboundTextMarker: process.env.INBOUND_TEXT_MARKER?.trim() || ""
};

const results = [];

async function main() {
  validateConfig();

  const api = await connect(config.apiDatabaseUrl);
  const bff = config.bffDatabaseUrl ? await connect(config.bffDatabaseUrl) : null;

  try {
    const apiEvidence = await auditApi(api);

    if (bff) {
      await auditBffInbox(bff);
    } else {
      record("bff_inbox_recorded_inbound", true, "skipped: BFF_DATABASE_URL not set");
    }

    printSummary(apiEvidence);
  } finally {
    await api.end();
    if (bff) await bff.end();
  }
}

function validateConfig() {
  const missing = [];
  if (!config.apiDatabaseUrl) missing.push("API_DATABASE_URL");
  if (!config.customerPhone) missing.push("CUSTOMER_PHONE");
  if (!config.sinceIso) missing.push("SINCE_ISO");
  if (config.sinceIso && Number.isNaN(Date.parse(config.sinceIso))) {
    throw new Error("SINCE_ISO must be a valid ISO date.");
  }
  if (missing.length > 0) {
    console.error(usage.trim());
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }
}

async function connect(connectionString) {
  const client = new Client({ connectionString });
  await client.connect();
  return client;
}

async function auditApi(client) {
  const conversation = await first(
    client,
    `
      select id, "createdAt", "updatedAt"
      from "Conversation"
      where "whatsappPhone" = $1
      limit 1
    `,
    [config.customerPhone]
  );

  record("api_conversation_exists", Boolean(conversation), summarizeRow(conversation));

  const inbound = conversation
    ? await first(
        client,
        `
          select id, "createdAt"
          from "Message"
          where "conversationId" = $1
            and direction = 'INBOUND'
            and source = 'CUSTOMER'
            and "createdAt" >= $2
            ${config.inboundTextMarker ? "and body ilike $3" : ""}
          order by "createdAt" desc
          limit 1
        `,
        config.inboundTextMarker
          ? [conversation.id, new Date(config.sinceIso), `%${config.inboundTextMarker}%`]
          : [conversation.id, new Date(config.sinceIso)]
      )
    : null;

  record("api_recorded_inbound_customer_message", Boolean(inbound), summarizeRow(inbound));

  const outbound = conversation
    ? await first(
        client,
        `
          select id, "createdAt", "whatsappMessageId", ("rawPayload" is not null) as "hasRawPayload"
          from "Message"
          where "conversationId" = $1
            and direction = 'OUTBOUND'
            and source = 'AI'
            and "createdAt" >= $2
            and "rawPayload" is not null
          order by "createdAt" desc
          limit 1
        `,
        [conversation.id, inbound?.createdAt || new Date(config.sinceIso)]
      )
    : null;

  record("api_recorded_ai_reply_sent", Boolean(outbound), summarizeRow(outbound));

  const appointmentTool = conversation
    ? await first(
        client,
        `
          select id, name, status, "completedAt"
          from "ToolCall"
          where "conversationId" = $1
            and status = 'SUCCEEDED'
            and name in ('confirmar_agendamento', 'confirmar_remarcacao')
            and "completedAt" >= $2
          order by "completedAt" desc
          limit 1
        `,
        [conversation.id, new Date(config.sinceIso)]
      )
    : null;

  record("api_recorded_successful_appointment_tool", Boolean(appointmentTool), summarizeRow(appointmentTool));

  const appointment = conversation
    ? await first(
        client,
        `
          select id, "minhaAgendaAppointmentId", status, "createdAt", "updatedAt"
          from "ExternalAppointment"
          where "conversationId" = $1
            and status in ('SCHEDULED', 'RESCHEDULED')
            and ("createdAt" >= $2 or "updatedAt" >= $2)
          order by "updatedAt" desc
          limit 1
        `,
        [conversation.id, new Date(config.sinceIso)]
      )
    : null;

  record("api_recorded_minha_agenda_write", Boolean(appointment), summarizeRow(appointment));

  return { conversation, inbound, outbound, appointmentTool, appointment };
}

async function auditBffInbox(client) {
  const inbound = await first(
    client,
    `
      select m.id, m.timestamp, c."lastMessageAt"
      from "Message" m
      join "Conversation" c on c.id = m."conversationId"
      where c."contactJid" like $1
        and m."fromMe" = false
        and m.timestamp >= $2
      order by m.timestamp desc
      limit 1
    `,
    [`%${config.customerPhone}%`, new Date(config.sinceIso)]
  );

  record("bff_inbox_recorded_inbound", Boolean(inbound), summarizeRow(inbound));
}

async function first(client, sql, params) {
  const result = await client.query(sql, params);
  return result.rows[0] || null;
}

function summarizeRow(row) {
  if (!row) return "not found";
  return JSON.stringify(redactRow(row));
}

function redactRow(row) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => {
      if (value instanceof Date) return [key, value.toISOString()];
      return [key, value];
    })
  );
}

function record(name, ok, details) {
  results.push({ name, ok, details });
  console.log(JSON.stringify({ name, ok, phone: maskPhone(config.customerPhone), details }));
}

function printSummary(evidence) {
  const failed = results.filter((result) => !result.ok);
  console.log(JSON.stringify({
    total: results.length,
    failed: failed.length,
    evidence: {
      conversationId: evidence.conversation?.id ?? null,
      inboundMessageId: evidence.inbound?.id ?? null,
      outboundMessageId: evidence.outbound?.id ?? null,
      appointmentToolCallId: evidence.appointmentTool?.id ?? null,
      externalAppointmentId: evidence.appointment?.id ?? null,
      minhaAgendaAppointmentId: evidence.appointment?.minhaAgendaAppointmentId ?? null
    }
  }, null, 2));

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

function normalizePhone(value) {
  return value.replace(/\D/g, "");
}

function maskPhone(value) {
  if (!value) return "";
  return `${value.slice(0, 2)}***${value.slice(-4)}`;
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
