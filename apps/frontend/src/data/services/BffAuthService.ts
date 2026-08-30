import { type BffHttpClient } from "../http/BffHttpClient";
import {
  loginResultSchema,
  messageResultSchema,
  okSchema,
  registerResultSchema,
  sessionSchema,
} from "../mappers/publicApiSchemas";

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
      schema: registerResultSchema,
      signal,
    });
  }

  login(input: LoginInput, signal?: AbortSignal) {
    return this.http.request({
      body: input,
      method: "POST",
      path: "/v1/auth/login",
      schema: loginResultSchema,
      signal,
    });
  }

  logout(signal?: AbortSignal) {
    return this.http.request({
      method: "POST",
      path: "/v1/auth/logout",
      schema: okSchema,
      signal,
    });
  }

  session(signal?: AbortSignal) {
    return this.http.request({
      path: "/v1/auth/session",
      schema: sessionSchema,
      signal,
    });
  }

  changePassword(input: ChangePasswordInput, signal?: AbortSignal) {
    return this.http.request({
      body: input,
      method: "PATCH",
      path: "/v1/auth/password",
      schema: okSchema,
      signal,
    });
  }

  forgotPassword(email: string, signal?: AbortSignal) {
    return this.http.request({
      body: { email },
      method: "POST",
      path: "/v1/auth/forgot-password",
      schema: messageResultSchema,
      signal,
    });
  }

  resetPassword(input: ResetPasswordInput, signal?: AbortSignal) {
    return this.http.request({
      body: input,
      method: "POST",
      path: "/v1/auth/reset-password",
      schema: okSchema,
      signal,
    });
  }
}
