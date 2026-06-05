import crypto from "node:crypto";
import type { FastifyInstance } from "fastify";
import { currentUser, requireAuth } from "../lib/auth.js";
import { instanceDto, settingsDto } from "../lib/dto.js";
import { AppError } from "../lib/errors.js";
import { dataResponse } from "../lib/http.js";
import { getPrisma } from "../lib/prisma.js";
import {
  buildWebhookUrl,
  connectEvolutionInstance,
  createEvolutionInstance,
  deleteEvolutionInstance,
  getEvolutionContacts,
  getEvolutionQr,
  getEvolutionStatus,
  logoutEvolutionInstance
} from "../services/evolution-go.js";

export async function registerWhatsAppRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", async (request) => {
    if (request.url.startsWith("/whatsapp")) {
      await requireAuth(request);
    }
  });

  app.get("/whatsapp/status", async (request) => {
    const user = currentUser(request);
    const prisma = getPrisma();
    const instance = await prisma.whatsAppInstance.findUnique({
      where: { userId: user.id }
    });

    if (!instance) {
      throw new AppError("NOT_FOUND", "WhatsApp instance not found.", 404);
    }

    const status = await getEvolutionStatus(instance.evolutionInstanceToken);
    const updated = await prisma.whatsAppInstance.update({
      where: { id: instance.id },
      data: {
        status: status.connected ? "CONNECTED" : instance.status,
        phoneNumber: status.phoneNumber ?? instance.phoneNumber,
        connectedAt: status.connected && !instance.connectedAt ? new Date() : instance.connectedAt
      }
    });

    return dataResponse(request, { status, whatsappInstance: instanceDto(updated) });
  });

  app.post("/whatsapp/instance", async (request, reply) => {
    const user = currentUser(request);
    const prisma = getPrisma();
    const record = await prisma.user.findUnique({
      where: { id: user.id },
      include: {
        profile: true,
        whatsappInstance: true
      }
    });

    if (!record) {
      throw new AppError("NOT_FOUND", "User not found.", 404);
    }

    if (record.whatsappInstance) {
      return dataResponse(request, { whatsappInstance: instanceDto(record.whatsappInstance) });
    }

    const instanceName = buildInstanceName(record.profile?.fullName ?? record.email, record.profile?.businessName ?? "atendly");
    const instanceToken = `wa_${crypto.randomBytes(32).toString("hex")}`;
    const evolution = await createEvolutionInstance({
      name: instanceName,
      token: instanceToken,
      webhookUrl: buildWebhookUrl()
    });

    const created = await prisma.whatsAppInstance.create({
      data: {
        userId: user.id,
        evolutionInstanceId: evolution.data?.id ?? evolution.data?.name ?? instanceName,
        evolutionInstanceName: evolution.data?.name ?? instanceName,
        evolutionInstanceToken: evolution.data?.token ?? instanceToken,
        status: "CREATED"
      }
    });

    reply.code(201);
    return dataResponse(request, { whatsappInstance: instanceDto(created) });
  });

  app.delete("/whatsapp/instance", async (request) => {
    const user = currentUser(request);
    const prisma = getPrisma();
    const instance = await prisma.whatsAppInstance.findUnique({
      where: { userId: user.id }
    });

    if (!instance) {
      return dataResponse(request, { whatsappInstance: null });
    }

    await deleteEvolutionInstance(instance.evolutionInstanceId ?? instance.evolutionInstanceName).catch(() => null);
    await prisma.whatsAppInstance.delete({
      where: { id: instance.id }
    });

    return dataResponse(request, { whatsappInstance: null });
  });

  app.post("/whatsapp/connect", async (request) => {
    const user = currentUser(request);
    const prisma = getPrisma();
    const instance = await prisma.whatsAppInstance.findUnique({
      where: { userId: user.id }
    });

    if (!instance) {
      throw new AppError("NOT_FOUND", "Create a WhatsApp instance before connecting.", 404);
    }

    await connectEvolutionInstance(instance.evolutionInstanceToken, buildWebhookUrl());
    const updated = await prisma.whatsAppInstance.update({
      where: { id: instance.id },
      data: {
        status: "CONNECTING"
      }
    });

    return dataResponse(request, { whatsappInstance: instanceDto(updated) });
  });

  app.get("/whatsapp/qr", async (request) => {
    const user = currentUser(request);
    const prisma = getPrisma();
    const instance = await prisma.whatsAppInstance.findUnique({
      where: { userId: user.id }
    });

    if (!instance) {
      throw new AppError("NOT_FOUND", "WhatsApp instance not found.", 404);
    }

    const qr = await getEvolutionQr(instance.evolutionInstanceToken);
    const updated = await prisma.whatsAppInstance.update({
      where: { id: instance.id },
      data: {
        qrcode: qr.qrcode || instance.qrcode,
        status: qr.qrcode ? "WAITING_QR" : instance.status
      }
    });

    return dataResponse(request, {
      qrcode: qr.qrcode,
      code: qr.code,
      pending: !qr.qrcode,
      whatsappInstance: instanceDto(updated)
    });
  });

  app.post("/whatsapp/logout", async (request) => {
    const user = currentUser(request);
    const prisma = getPrisma();
    const instance = await prisma.whatsAppInstance.findUnique({
      where: { userId: user.id }
    });

    if (!instance) {
      return dataResponse(request, { whatsappInstance: null });
    }

    await logoutEvolutionInstance(instance.evolutionInstanceToken).catch(() => null);
    const updated = await prisma.whatsAppInstance.update({
      where: { id: instance.id },
      data: {
        status: "LOGGED_OUT",
        qrcode: null,
        connectedAt: null
      }
    });

    const settings = await prisma.userSettings.findUnique({ where: { userId: user.id } });
    return dataResponse(request, { whatsappInstance: instanceDto(updated), settings: settingsDto(settings) });
  });

  app.get("/whatsapp/contacts", async (request) => {
    const user = currentUser(request);
    const prisma = getPrisma();
    const instance = await prisma.whatsAppInstance.findUnique({
      where: { userId: user.id }
    });

    if (!instance) {
      throw new AppError("NOT_FOUND", "WhatsApp instance not found.", 404);
    }

    if (instance.status !== "CONNECTED") {
      throw new AppError("CONFLICT", "Connect WhatsApp before loading contacts.", 409);
    }

    const [contacts, ignoredContacts] = await Promise.all([
      getEvolutionContacts(instance.evolutionInstanceToken),
      prisma.ignoredContact.findMany({
        where: {
          userId: user.id,
          instanceId: instance.id,
          isActive: true
        },
        select: { jid: true }
      })
    ]);
    const ignoredJids = new Set(ignoredContacts.map((contact) => contact.jid));

    return dataResponse(request, {
      contacts: contacts.map((contact) => ({
        ...contact,
        displayName:
          contact.fullName || contact.pushName || contact.firstName || contact.businessName || contact.phoneNumber || contact.jid,
        alreadyIgnored: ignoredJids.has(contact.jid)
      }))
    });
  });
}

function buildInstanceName(fullName: string, businessName: string): string {
  const personSlug = slugify(fullName) || "usuario";
  const businessSlug = slugify(businessName) || "negocio";
  const hash = crypto.randomBytes(4).toString("hex");
  return `${personSlug}_${businessSlug}_${hash}`;
}

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 48)
    .replace(/^_|_$/g, "");
}
