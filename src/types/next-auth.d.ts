import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email?: string | null;
      name?: string | null;
      image?: string | null;
    };
    /** Id of the UserSession row backing this login, so the UI can mark it. */
    sessionId?: string;
  }

  /** Extra field carried out of `authorize` into the jwt callback. */
  interface User {
    sessionId?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid?: string;
    /** UserSession row id — see prisma UserSession. */
    sid?: string;
    /** Epoch ms of the last DB revocation check, to throttle it. */
    checkedAt?: number;
  }
}
