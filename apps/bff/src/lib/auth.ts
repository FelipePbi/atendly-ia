import type { FastifyReply, FastifyRequest } from "fastify";
import { jwtVerify, SignJWT } from "jose";

import { env } from "../config/env.js";
import { AppError } from "./errors.js";

export type AuthenticatedUser = {
  id: string;
  email: string;
};

const secretKey = () => new TextEncoder().encode(env.JWT_SECRET);

export async function signSession(user: AuthenticatedUser): Promise<string> {
  return new SignJWT({ email: user.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(env.JWT_EXPIRES_IN)
    .sign(secretKey());
}

export async function verifySessionToken(
  token: string,
): Promise<AuthenticatedUser> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (!payload.sub || typeof payload.email !== "string") {
      throw new AppError("UNAUTHORIZED", "Invalid session.", 401);
    }

    return {
      id: payload.sub,
      email: payload.email,
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("UNAUTHORIZED", "Invalid or expired session.", 401);
  }
}

export function setSessionCookie(reply: FastifyReply, token: string): void {
  reply.setCookie(env.SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.COOKIE_SECURE || env.COOKIE_SAME_SITE === "none",
    sameSite: env.COOKIE_SAME_SITE,
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(env.SESSION_COOKIE_NAME, {
    secure: env.COOKIE_SECURE || env.COOKIE_SAME_SITE === "none",
    sameSite: env.COOKIE_SAME_SITE,
    path: "/",
  });
}

export async function requireAuth(request: FastifyRequest): Promise<void> {
  const header = request.headers.authorization;
  const bearerToken = header?.startsWith("Bearer ")
    ? header.slice("Bearer ".length).trim()
    : "";
  const cookieToken = request.cookies[env.SESSION_COOKIE_NAME];
  const token = bearerToken || cookieToken;

  if (!token) {
    throw new AppError("UNAUTHORIZED", "Authentication required.", 401);
  }

  request.user = await verifySessionToken(token);
}

export function currentUser(request: FastifyRequest): AuthenticatedUser {
  if (!request.user) {
    throw new AppError("UNAUTHORIZED", "Authentication required.", 401);
  }

  return request.user;
}
