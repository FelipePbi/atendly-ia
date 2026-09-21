import { type z } from "zod";

import { type BffHttpClient, routeSchema } from "../http/BffHttpClient";
import {
  type NotificationLevel,
  type NotificationList,
  type notificationMarkReadResultSchema,
  type NotificationPreferences,
  type NotificationSummary,
} from "../mappers/publicApiSchemas";

type NotificationMarkReadResult = z.infer<
  typeof notificationMarkReadResultSchema
>;

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
      schema: routeSchema<NotificationList>("GET", "/v1/notifications"),
      signal,
    });
  }

  summary(signal?: AbortSignal) {
    return this.http.request({
      path: "/v1/notifications/summary",
      schema: routeSchema<NotificationSummary>(
        "GET",
        "/v1/notifications/summary",
      ),
      signal,
    });
  }

  markRead(input: MarkNotificationsReadInput, signal?: AbortSignal) {
    return this.http.request({
      body: input,
      method: "POST",
      path: "/v1/notifications/read",
      schema: routeSchema<NotificationMarkReadResult>(
        "POST",
        "/v1/notifications/read",
      ),
      signal,
    });
  }

  getPreferences(signal?: AbortSignal) {
    return this.http.request({
      path: "/v1/notifications/preferences",
      schema: routeSchema<NotificationPreferences>(
        "GET",
        "/v1/notifications/preferences",
      ),
      signal,
    });
  }

  updatePreferences(input: NotificationPreferencesInput, signal?: AbortSignal) {
    return this.http.request({
      body: input,
      method: "PATCH",
      path: "/v1/notifications/preferences",
      schema: routeSchema<NotificationPreferences>(
        "PATCH",
        "/v1/notifications/preferences",
      ),
      signal,
    });
  }
}
