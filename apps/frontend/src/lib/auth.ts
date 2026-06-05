import "server-only";

import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import { loginSchema } from "@/lib/validation";
import { verifyPassword } from "@/lib/password";

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
  },
  secret: process.env.AUTH_SECRET || process.env.JWT_SECRET,
  pages: {
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "Email e senha",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Senha", type: "password" },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email },
        });

        if (!user) return null;

        const validPassword = await verifyPassword(parsed.data.password, user.passwordHash);
        if (!validPassword) return null;

        return {
          id: user.id,
          email: user.email,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.email = user.email;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id && token.email) {
        session.user.id = token.id;
        session.user.email = token.email;
      }

      return session;
    },
  },
};
