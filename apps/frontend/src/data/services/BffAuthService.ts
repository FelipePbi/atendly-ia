import { type z } from "zod";

import { type BffHttpClient, routeSchema } from "../http/BffHttpClient";
import {
  type loginResultSchema,
  type messageResultSchema,
  type okSchema,
  type registerResultSchema,
  type Session,
} from "../mappers/publicApiSchemas";

type RegisterResult = z.infer<typeof registerResultSchema>;
type LoginResult = z.infer<typeof loginResultSchema>;
type Ok = z.infer<typeof okSchema>;
type MessageResult = z.infer<typeof messageResultSchema>;

export interface RegisterInput {
  confirmPassword: string;
  email: string;
  password: string;
  privacyPolicyVersion: string;
  termsAccepted: true;
  termsVersion: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface ChangePasswordInput {
  confirmPassword: string;
  currentPassword: string;
  newPassword: string;
}

export interface ResetPasswordInput {
  confirmPassword: string;
  newPassword: string;
  token: string;
}

export class BffAuthService {
  constructor(private readonly http: BffHttpClient) {}

  register(input: RegisterInput, signal?: AbortSignal) {
    return this.http.request({
      body: input,
      method: "POST",
      path: "/v1/auth/register",
      schema: routeSchema<RegisterResult>("POST", "/v1/auth/register"),
      signal,
    });
  }

  login(input: LoginInput, signal?: AbortSignal) {
    return this.http.request({
      body: input,
      method: "POST",
      path: "/v1/auth/login",
      schema: routeSchema<LoginResult>("POST", "/v1/auth/login"),
      signal,
    });
  }

  async logout(signal?: AbortSignal) {
    try {
      return await this.http.request({
        method: "POST",
        path: "/v1/auth/logout",
        schema: routeSchema<Ok>("POST", "/v1/auth/logout"),
        signal,
      });
    } finally {
      // A sessão foi revogada no servidor; guardar o token dela só levaria a
      // enviar uma prova morta na próxima mutação.
      this.http.resetCsrfToken();
    }
  }

  session(signal?: AbortSignal) {
    return this.http.request({
      path: "/v1/auth/session",
      schema: routeSchema<Session>("GET", "/v1/auth/session"),
      signal,
    });
  }

  changePassword(input: ChangePasswordInput, signal?: AbortSignal) {
    return this.http.request({
      body: input,
      method: "PATCH",
      path: "/v1/auth/password",
      schema: routeSchema<Ok>("PATCH", "/v1/auth/password"),
      signal,
    });
  }

  forgotPassword(email: string, signal?: AbortSignal) {
    return this.http.request({
      body: { email },
      method: "POST",
      path: "/v1/auth/forgot-password",
      schema: routeSchema<MessageResult>("POST", "/v1/auth/forgot-password"),
      signal,
    });
  }

  resetPassword(input: ResetPasswordInput, signal?: AbortSignal) {
    return this.http.request({
      body: input,
      method: "POST",
      path: "/v1/auth/reset-password",
      schema: routeSchema<Ok>("POST", "/v1/auth/reset-password"),
      signal,
    });
  }

  async logoutAllDevices(signal?: AbortSignal) {
    try {
      return await this.http.request({
        method: "POST",
        path: "/v1/auth/logout-all",
        schema: routeSchema<Ok>("POST", "/v1/auth/logout-all"),
        signal,
      });
    } finally {
      // A sessão corrente também foi revogada; o token de CSRF guardado
      // morreu junto com ela.
      this.http.resetCsrfToken();
    }
  }
}
