import type { User } from "@/src/domain/user/entities/user";

export type CreateUserInput = {
  email: string;
  /**
   * The already-hashed password. Hashing is the responsibility of the
   * `PasswordHasher` port (arrives in Phase 11). Until then the caller
   * hashes before invoking this method.
   */
  passwordHash: string;
};

export type UserRepository = {
  findByEmail(email: string): Promise<User[]>;
  create(input: CreateUserInput): Promise<void>;
  /**
   * Creates the instance's first operator, and only if there is none.
   *
   * Atomic because "is this the first user" and "create the user" as two
   * statements let two requests racing at first boot both claim the console.
   * Returns false when someone got there first.
   */
  createFirst(input: CreateUserInput): Promise<boolean>;
};
