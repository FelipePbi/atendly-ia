import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";
import { AppError } from "../../shared/errors/app-error.js";
import type { ActivityActor } from "../activity/activity-log.js";
import { recordAppointmentDeletion } from "../activity/appointment-activity.js";
import { customerActivity } from "../activity/entity-activity.js";

type DatabaseClient = PrismaClient | Prisma.TransactionClient;

/**
 * Remocao definitiva de atendimento e de pessoa, **por ID**.
 *
 * Existe porque o produto precisa desfazer o que ele mesmo criou: o teste de
 * ativacao cria um atendimento de verdade e a pessoa de teste, e o fluxo do
 * vault termina com os dois **removidos** — nao cancelados, nao escondidos. Um
 * atendimento cancelado continua na agenda do negocio, e era exatamente isso
 * que sobrava depois da limpeza.
 *
 * Duas regras, e nenhuma delas e negociavel:
 *
 * 1. **So por ID.** Nao ha neste arquivo nenhum criterio de selecao que nao
 *    seja o ID recebido — nada de telefone, nome, data ou padrao. Uma linha
 *    que o chamador nao nomeou nao e alcancavel daqui.
 * 2. **Nunca arrasta terceiro.** A pessoa so sai quando nao sobrou nenhum
 *    atendimento dela; o banco ja recusaria (`onDelete: Restrict`), e aqui a
 *    recusa vira codigo proprio em vez de erro de driver.
 *
 * Repetir e no-op: remover o que ja nao existe devolve `false`, nao erro.
 */
export class CalendarRemovalService {
  constructor(
    private readonly database: DatabaseClient,
    private readonly tenantId: string,
  ) {}

  /**
   * Apaga o atendimento e o que pende **exclusivamente** dele: os itens do
   * acordo e o historico operacional.
   *
   * Nada cascateia aqui, e o comentario anterior que dizia o contrario era
   * falso: `AppointmentItem` e `AppointmentEvent` referenciam `Appointment`
   * com `onDelete: Restrict` (schema.prisma) e o FK no banco e
   * `ON DELETE RESTRICT`. Um `appointment.delete` direto funciona no dublê e
   * quebra em producao com violacao de chave estrangeira — que e exatamente o
   * atendimento que a IA cria no teste de ativacao, sempre com item e sempre
   * com evento `CREATED`.
   *
   * As tres remocoes vao na **mesma transacao**: ou o atendimento sai inteiro,
   * ou nada sai. Apagar item e evento e deixar o atendimento de pe seria
   * destruir historico sem remover nada que o negocio veja.
   *
   * O criterio continua sendo so o ID: `tenantId` + `appointmentId`, sem
   * telefone, nome, data ou padrao.
   *
   * `false` quando ja nao existe: e o que torna a segunda passada da limpeza
   * observavelmente inofensiva.
   */
  async deleteAppointment(
    appointmentId: string,
    actor?: ActivityActor,
  ): Promise<boolean> {
    const existing = await this.database.appointment.findUnique({
      where: { tenantId_id: { tenantId: this.tenantId, id: appointmentId } },
      select: { id: true },
    });
    if (!existing) return false;

    await this.inTransaction(async (database) => {
      const where = { tenantId: this.tenantId, appointmentId };
      // O registro de atividade (D-176) não tem chave para o atendimento:
      // a remoção fica nele, com o contexto lido antes de apagar.
      if (actor) {
        await recordAppointmentDeletion(
          database,
          this.tenantId,
          appointmentId,
          actor,
        );
      }
      await database.appointmentItem.deleteMany({ where });
      await database.appointmentEvent.deleteMany({ where });
      await database.appointment.delete({
        where: { tenantId_id: { tenantId: this.tenantId, id: appointmentId } },
      });
    });
    return true;
  }

  /**
   * Roda o corpo numa transacao quando o cliente e o `PrismaClient`.
   *
   * Quando ja estamos dentro de uma transacao (`Prisma.TransactionClient`) nao
   * ha `$transaction` para abrir, e abrir outra seria erro: o corpo roda na
   * transacao do chamador, que e onde ele deve rodar.
   */
  private async inTransaction(
    run: (database: DatabaseClient) => Promise<void>,
  ): Promise<void> {
    const client = this.database as Partial<PrismaClient>;
    if (typeof client.$transaction !== "function") {
      await run(this.database);
      return;
    }
    await (this.database as PrismaClient).$transaction(async (transaction) =>
      run(transaction),
    );
  }

  /**
   * Apaga a pessoa e o que e exclusivamente dela (notas, tags, relacoes e
   * holds cascateiam a partir dela).
   *
   * Atendimento **nao** cascateia: se sobrou algum, a pessoa fica. Apagar uma
   * pessoa com historico de agenda seria remover dado que nao e desta
   * operacao, entao a recusa e explicita e nomeada.
   */
  async deleteCustomer(
    customerId: string,
    actor?: ActivityActor,
  ): Promise<boolean> {
    const existing = await this.database.customer.findUnique({
      where: { tenantId_id: { tenantId: this.tenantId, id: customerId } },
      select: { id: true, name: true, phone: true },
    });
    if (!existing) return false;

    const appointments = await this.database.appointment.count({
      where: { tenantId: this.tenantId, customerId },
    });
    if (appointments > 0) {
      throw new AppError(
        "CUSTOMER_HAS_APPOINTMENTS",
        "This person still has appointments and cannot be removed.",
        409,
        { appointments },
      );
    }

    await this.inTransaction(async (database) => {
      await database.customer.delete({
        where: { tenantId_id: { tenantId: this.tenantId, id: customerId } },
      });
      if (actor) {
        await customerActivity.deleted(
          database,
          this.tenantId,
          actor,
          existing,
        );
      }
    });
    return true;
  }
}
