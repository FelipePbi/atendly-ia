import { type BffHttpClient } from "../http/BffHttpClient";
import type { NotificationLevel } from "../mappers/publicApiSchemas";
import {
  notificationListSchema,
  notificationMarkReadResultSchema,
  notificationPreferencesSchema,
  notificationSummarySchema,
} from "../mappers/publicApiSchemas";

export interface ListNotificationsQuery {
  level?: NotificationLevel;
  unread?: boolean;
  resolved?: boolean;
  limit?: number;
  offset?: number;
}

export type MarkNotificationsReadInput = { id: string } | { all: true };

export interface NotificationPreferencesInput {
  aiAppointmentCreated: boolean;
}

export class BffNotificationService {
  constructor(private readonly http: BffHttpClient) {}

  list(query: ListNotificationsQuery = {}, signal?: AbortSignal) {
    return this.http.request({
      path: "/v1/notifications",
      query: {
        level: query.level,
        unread: query.unread,
        resolved: query.resolved,
        limit: query.limit,
        offset: query.offset,
      },
      schema: notificationListSchema,
      signal,
    });
  }

  summary(signal?: AbortSignal) {
    return this.http.request({
      path: "/v1/notifications/summary",
      schema: notificationSummarySchema,
      signal,
    });
  }

  markRead(input: MarkNotificationsReadInput, signal?: AbortSignal) {
    return this.http.request({
      body: input,
      method: "POST",
      path: "/v1/notifications/read",
      schema: notificationMarkReadResultSchema,
      signal,
    });
  }

  getPreferences(signal?: AbortSignal) {
    return this.http.request({
      path: "/v1/notifications/preferences",
      schema: notificationPreferencesSchema,
      signal,
    });
  }

  updatePreferences(
    input: NotificationPreferencesInput,
    signal?: AbortSignal,
  ) {
    return this.http.request({
      body: input,
      method: "PATCH",
      path: "/v1/notifications/preferences",
      schema: notificationPreferencesSchema,
      signal,
    });
  }
}
