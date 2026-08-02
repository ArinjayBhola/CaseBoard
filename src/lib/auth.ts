import bcrypt from "bcryptjs";
import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import { clientIp, createSession } from "@/lib/sessions/service";

/**
 * Backstop cadence for the jwt callback's DB revocation check. The live
 * <SessionGuard> stream is what makes a remote sign-out feel instant; this is
 * the fallback that catches non-browser clients or a stream that never opened.
 */
const REVOCATION_CHECK_MS = 20_000;

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, req) {
        const email = credentials?.email?.trim().toLowerCase();
        const password = credentials?.password;
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return null;

        const ok = await bcrypt.compare(password, user.password);
        if (!ok) return null;

        // Record where this sign-in came from, so the account page can list and
        // revoke it. Best-effort: never block a valid login on session logging.
        let sessionId: string | undefined;
        try {
          const ip = clientIp(req?.headers ?? {});
          const ua =
            (req?.headers?.["user-agent"] as string | undefined) ?? null;
          sessionId = await createSession(user.id, ip, ua);
        } catch (err) {
          console.warn("[auth] could not record session:", err);
        }

        return { id: user.id, email: user.email, name: user.username || user.email.split("@")[0], image: user.imageUrl, sessionId };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      // Fresh sign-in: stamp the user and session ids onto the token.
      if (user) {
        token.uid = user.id;
        token.sid = user.sessionId;
        token.checkedAt = Date.now();
        return token;
      }

      // Existing token: periodically confirm the session row still exists, so a
      // remote sign-out actually takes effect (within one check interval).
      if (token.sid) {
        const now = Date.now();
        if (!token.checkedAt || now - token.checkedAt > REVOCATION_CHECK_MS) {
          const row = await prisma.userSession.findUnique({
            where: { id: token.sid },
            select: { id: true },
          });
          if (!row) {
            // Revoked elsewhere — strip identity so guards treat it as signed out.
            delete token.uid;
            delete token.sid;
          } else {
            await prisma.userSession.update({
              where: { id: token.sid },
              data: { lastSeenAt: new Date() },
            });
            token.checkedAt = now;
          }
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.uid) {
        session.user.id = token.uid;
        const user = await prisma.user.findUnique({
          where: { id: token.uid },
          select: { username: true, imageUrl: true },
        });
        session.user.name = user?.username || session.user.name || "Account";
        session.user.image = user?.imageUrl;
      }
      session.sessionId = token.sid;
      return session;
    },
  },
};

/** Session user id, or null when signed out. Use in route handlers and server components. */
export async function currentUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  return session?.user?.id ?? null;
}

export const PASSWORD_MIN_LENGTH = 8;

export function hashPassword(plain: string) {
  return bcrypt.hash(plain, 10);
}
