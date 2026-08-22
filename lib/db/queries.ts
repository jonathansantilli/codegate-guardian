import "server-only";

import { count } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { DrizzleUserRepository } from "@/src/infrastructure/persistence/drizzle-postgres/repositories/user-repository";
import { ChatbotError } from "../errors";
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
    throw new ChatbotError(
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
    throw new ChatbotError("bad_request:database", "Failed to create user");
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
    throw new ChatbotError("bad_request:database", "Failed to create user");
  }
}
