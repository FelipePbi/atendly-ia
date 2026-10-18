import { type BffHttpClient, routeSchema } from "../http/BffHttpClient";
import type {
  CustomerReturnStatus,
  ReturnCampaignDetail,
  ReturnCampaignInput,
  ReturnCampaignSummary,
  ReturnCandidateList,
  ReturnKind,
  ReturnPlan,
  ReturnPlanInput,
  ReturnSettings,
  ReturnSettingsInput,
} from "../mappers/publicApiSchemas";

/**
 * Retorno de clientes: Renovação e Resgate (D-206). A lista vem pronta do
 * servidor, sem contato ignorado nem conversa pessoal; nada sai sem a
 * profissional aprovar a rodada.
 */
export class BffCustomerReturnService {
  constructor(private readonly http: BffHttpClient) {}

  settings(signal?: AbortSignal) {
    return this.http.request({
      path: "/v1/customer-return/settings",
      schema: routeSchema<ReturnSettings>(
        "GET",
        "/v1/customer-return/settings",
      ),
      signal,
    });
  }

  updateSettings(input: ReturnSettingsInput, signal?: AbortSignal) {
    return this.http.request({
      body: input,
      method: "PATCH",
      path: "/v1/customer-return/settings",
      schema: routeSchema<ReturnSettings>(
        "PATCH",
        "/v1/customer-return/settings",
      ),
      signal,
    });
  }

  candidates(
    query: { kind: ReturnKind; week?: "this" | "next"; days?: number },
    signal?: AbortSignal,
  ) {
    return this.http.request({
      path: "/v1/customer-return/candidates",
      query: {
        kind: query.kind,
        week: query.week,
        days: query.days === undefined ? undefined : String(query.days),
      },
      schema: routeSchema<ReturnCandidateList>(
        "GET",
        "/v1/customer-return/candidates",
      ),
      signal,
    });
  }

  plan(input: ReturnPlanInput, signal?: AbortSignal) {
    return this.http.request({
      body: input,
      method: "POST",
      path: "/v1/customer-return/plan",
      schema: routeSchema<ReturnPlan>("POST", "/v1/customer-return/plan"),
      signal,
    });
  }

  approve(input: ReturnCampaignInput, signal?: AbortSignal) {
    return this.http.request({
      body: input,
      method: "POST",
      path: "/v1/customer-return/campaigns",
      schema: routeSchema<ReturnCampaignDetail>(
        "POST",
        "/v1/customer-return/campaigns",
      ),
      signal,
    });
  }

  campaigns(signal?: AbortSignal) {
    return this.http.request({
      path: "/v1/customer-return/campaigns",
      schema: routeSchema<ReturnCampaignSummary[]>(
        "GET",
        "/v1/customer-return/campaigns",
      ),
      signal,
    });
  }

  campaign(id: string, signal?: AbortSignal) {
    return this.http.request({
      path: `/v1/customer-return/campaigns/${encodeURIComponent(id)}`,
      schema: routeSchema<ReturnCampaignDetail>(
        "GET",
        "/v1/customer-return/campaigns/:id",
      ),
      signal,
    });
  }

  changeCampaign(id: string, action: "pause" | "resume" | "cancel") {
    return this.http.request({
      body: {},
      method: "POST",
      path: `/v1/customer-return/campaigns/${encodeURIComponent(id)}/${action}`,
      schema: routeSchema<ReturnCampaignDetail>(
        "POST",
        "/v1/customer-return/campaigns/:id/:action",
      ),
    });
  }

  skipTarget(id: string, targetId: string) {
    return this.http.request({
      body: {},
      method: "POST",
      path: `/v1/customer-return/campaigns/${encodeURIComponent(id)}/targets/${encodeURIComponent(targetId)}/skip`,
      schema: routeSchema<ReturnCampaignDetail>(
        "POST",
        "/v1/customer-return/campaigns/:id/targets/:targetId/skip",
      ),
    });
  }

  customerStatus(customerId: string, signal?: AbortSignal) {
    return this.http.request({
      path: `/v1/customers/${encodeURIComponent(customerId)}/return-messages`,
      schema: routeSchema<CustomerReturnStatus>(
        "GET",
        "/v1/customers/:id/return-messages",
      ),
      signal,
    });
  }

  setCustomerBlocked(customerId: string, blocked: boolean) {
    return this.http.request({
      body: { blocked },
      method: "PUT",
      path: `/v1/customers/${encodeURIComponent(customerId)}/return-messages`,
      schema: routeSchema<CustomerReturnStatus>(
        "PUT",
        "/v1/customers/:id/return-messages",
      ),
    });
  }
}
