import { PrismaClient } from "@prisma/client";

/**
 * The websocket server is its own process, so it gets its own client and its own
 * connection pool. Keep the pool small — this process holds long-lived rooms but
 * only writes in bursts.
 */
export const prisma = new PrismaClient({ log: ["error"] });
