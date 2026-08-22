import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { DrizzleUserRepository } from "@/src/infrastructure/persistence/drizzle-postgres/repositories/user-repository";
import { ChatbotError } from "../errors";
import type { User } from "./schema";
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
