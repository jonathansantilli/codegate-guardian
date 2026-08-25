import "server-only";

import { count } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { DrizzleSignInAttemptRepository } from "@/src/infrastructure/persistence/drizzle-postgres/repositories/sign-in-attempt-repository";
import { DrizzleUserRepository } from "@/src/infrastructure/persistence/drizzle-postgres/repositories/user-repository";
import { GuardianError } from "../errors";
import { type User, user } from "./schema";
import { generateHashedPassword } from "./utils";

/**
 * The only database access outside the container: the accounts that can sign
 * in. Everything the console shows goes through the fleet repository port.
 */

const client = postgres(process.env.POSTGRES_URL ?? "");
const db = drizzle(client);
const userRepository = new DrizzleUserRepository(db);

export async function getUser(email: string): Promise<User[]> {
  try {
    return await userRepository.findByEmail(email);
  } catch (_error) {
    throw new GuardianError(
      "bad_request:database",
      "Failed to get user by email"
    );
  }
}

export async function createUser(email: string, password: string) {
  const hashedPassword = generateHashedPassword(password);

  try {
    await userRepository.create({ email, passwordHash: hashedPassword });
  } catch (_error) {
    throw new GuardianError("bad_request:database", "Failed to create user");
  }
}

/**
 * Whether this instance has an operator yet.
 *
 * A fresh install has to let someone in to become the first operator; after
 * that, self-service registration would hand console authority — including
 * minting enrolment codes — to anyone who can reach the port.
 */
export async function hasAnyUser(): Promise<boolean> {
  const [row] = await db.select({ total: count() }).from(user);
  return (row?.total ?? 0) > 0;
}

/**
 * Creates the first operator, atomically, and only when there is none.
 * Returns false if this instance already has one.
 */
export async function createFirstUser(
  email: string,
  password: string
): Promise<boolean> {
  try {
    return await userRepository.createFirst({
      email,
      passwordHash: generateHashedPassword(password),
    });
  } catch (_error) {
    throw new GuardianError("bad_request:database", "Failed to create user");
  }
}

/**
 * How many failures a single address may accumulate before it is refused,
 * and over what window.
 *
 * Deliberately per-address rather than per-IP: this console has one operator,
 * so the address under attack is the one that matters, and an IP is trivially
 * varied. It does mean someone who knows the address can lock that account
 * out for the window — an acceptable trade on an instance whose own guidance
 * is to keep it on an internal network, and visible in the activity log
 * either way.
 */
export const SIGN_IN_WINDOW_MS = 15 * 60 * 1000;
export const SIGN_IN_MAX_FAILURES = 10;

const signInAttempts = new DrizzleSignInAttemptRepository(
  db,
  SIGN_IN_WINDOW_MS,
  SIGN_IN_MAX_FAILURES
);

export async function isSignInThrottled(
  email: string,
  at: Date = new Date()
): Promise<boolean> {
  try {
    return await signInAttempts.isThrottled(email, at);
  } catch (_error) {
    // Failing open would remove the limit exactly when the database is
    // unhealthy, which is not the moment to relax it.
    return true;
  }
}

export async function recordSignInFailure(
  email: string,
  at: Date = new Date()
): Promise<number> {
  try {
    return await signInAttempts.recordFailure(email, at);
  } catch (_error) {
    return 0;
  }
}

export async function clearSignInFailures(email: string): Promise<void> {
  try {
    await signInAttempts.clear(email);
  } catch (_error) {
    // A stale counter expires with its window; nothing to escalate.
  }
}
