import type { PrismaClient } from "../../../src/generated/prisma/client.js";

/**
 * Limpeza de tenant entre cenários de integração, em ordem de dependência.
 *
 * A ordem não é estética. `AppointmentEvent_appointment_fkey` é
 * `ON DELETE RESTRICT` de propósito (Goal008): o histórico operacional
 * nunca é apagado por efeito colateral de outra operação. Isso vale
 * também para os testes — apagar `Appointment` antes de `AppointmentEvent`
 * faz o banco recusar com `P2003`, que foi exatamente o que quebrou a
 * suíte quando a FK entrou. Concentrar a ordem aqui evita que cada suíte
 * nova redescubra o mesmo erro.
 *
 * Holds vêm antes de `Customer` porque referenciam a pessoa
 * (`ON DELETE SET NULL`), e depois de nada em especial: nada aponta para
 * eles.
 */
export async function resetTenant(
  prisma: PrismaClient,
  tenantId: string,
): Promise<void> {
  await prisma.appointmentEvent.deleteMany({ where: { tenantId } });
  await prisma.appointmentItem.deleteMany({ where: { tenantId } });
  await prisma.appointment.deleteMany({ where: { tenantId } });
  // Goal009: series so referenciadas por SET NULL (Appointment.seriesId,
  // TimeBlock.seriesId), entao podem ser apagadas depois de quem as
  // referencia sem violar FK.
  await prisma.appointmentSeries.deleteMany({ where: { tenantId } });
  await prisma.appointmentHold.deleteMany({ where: { tenantId } });
  await prisma.calendarMutationIdempotency.deleteMany({ where: { tenantId } });
  await prisma.customerNote.deleteMany({ where: { tenantId } });
  await prisma.customerTag.deleteMany({ where: { tenantId } });
  await prisma.customerRelation.deleteMany({ where: { tenantId } });
  await prisma.customer.deleteMany({ where: { tenantId } });
  await prisma.service.deleteMany({ where: { tenantId } });
  await prisma.availabilityException.deleteMany({ where: { tenantId } });
  await prisma.availabilityRule.deleteMany({ where: { tenantId } });
  await prisma.timeBlock.deleteMany({ where: { tenantId } });
  await prisma.blockSeries.deleteMany({ where: { tenantId } });
  // Goal010: a sessao de importacao e o pai de decisao, item e categoria
  // (`ON DELETE CASCADE`), mas a ordem explicita continua aqui pelo mesmo
  // motivo dos demais: quem le esta funcao ve a dependencia sem precisar
  // abrir a migration. `ExternalEntityMap` vem junto porque a execucao da
  // importacao o preenche, e um mapa deixado para tras faria o cenario
  // seguinte encontrar o registro como "ja importado".
  await prisma.importDecision.deleteMany({ where: { tenantId } });
  await prisma.importItem.deleteMany({ where: { tenantId } });
  await prisma.importSessionCategory.deleteMany({ where: { tenantId } });
  await prisma.importSession.deleteMany({ where: { tenantId } });
  await prisma.externalEntityMap.deleteMany({ where: { tenantId } });
}
