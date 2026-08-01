import { NextResponse } from "next/server";
import { ZodError, type ZodSchema } from "zod";
import { currentUserId } from "@/lib/auth";
import { ApiError, badRequest, unauthorized } from "@/server/errors";

/**
 * Thin adapter between Next route handlers and the service layer.
 * Phase 3+ swaps this file for an Express equivalent; services stay put.
 */

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function toErrorResponse(err: unknown) {
  if (err instanceof ZodError) {
    return json({ error: "Validation failed", issues: err.flatten().fieldErrors }, 400);
  }
  if (err instanceof ApiError) {
    return json({ error: err.message, details: err.details }, err.status);
  }
  console.error("[api] unhandled error", err);
  return json({ error: "Something went wrong" }, 500);
}

/** Runs a handler with the signed-in user id, mapping thrown errors to HTTP. */
export async function withUser<T>(fn: (userId: string) => Promise<T>) {
  try {
    const userId = await currentUserId();
    if (!userId) throw unauthorized();
    const result = await fn(userId);
    return result instanceof NextResponse ? result : json(result);
  } catch (err) {
    return toErrorResponse(err);
  }
}

/** Same as withUser but for public endpoints (signup). */
export async function withoutUser<T>(fn: () => Promise<T>) {
  try {
    const result = await fn();
    return result instanceof NextResponse ? result : json(result);
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function parseBody<S extends ZodSchema>(req: Request, schema: S) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw badRequest("Expected a JSON body");
  }
  return schema.parse(raw) as ReturnType<S["parse"]>;
}
