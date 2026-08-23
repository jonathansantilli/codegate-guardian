import { eq, sql } from "drizzle-orm";
import type {
  CreateUserInput,
  UserRepository,
} from "@/src/application/ports/persistence/user-repository";
import type { User } from "@/src/domain/user/entities/user";
import type { DrizzleDb } from "@/src/infrastructure/persistence/drizzle-postgres/client";
import { user } from "@/src/infrastructure/persistence/drizzle-postgres/schema";

/**
 * Advisory lock id for claiming an unclaimed instance. Arbitrary but fixed:
 * every process racing to create the first operator must take the same one.
 */
const BOOTSTRAP_LOCK = 6_150_720_240_823;

export class DrizzleUserRepository implements UserRepository {
  constructor(private readonly db: DrizzleDb) {}

  async findByEmail(email: string): Promise<User[]> {
    return (await this.db
      .select()
      .from(user)
      .where(eq(user.email, email))) as User[];
  }

  async create(input: CreateUserInput): Promise<void> {
    await this.db
      .insert(user)
      .values({ email: input.email, password: input.passwordHash });
  }

  async createFirst(input: CreateUserInput): Promise<boolean> {
    // `WHERE NOT EXISTS` reads a snapshot and takes no lock, so under READ
    // COMMITTED two bootstraps racing at first boot both see an empty table
    // and both insert. An advisory lock serialises them on the one thing that
    // must happen once — claiming an unclaimed instance — and the unique
    // index on email is the backstop if anything reaches the insert anyway.
    return await this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(${BOOTSTRAP_LOCK})`);

      const [existing] = await tx.select({ id: user.id }).from(user).limit(1);
      if (existing) {
        return false;
      }

      await tx
        .insert(user)
        .values({ email: input.email, password: input.passwordHash });

      return true;
    });
  }
}
