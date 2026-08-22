import { eq, sql } from "drizzle-orm";
import type {
  CreateUserInput,
  UserRepository,
} from "@/src/application/ports/persistence/user-repository";
import type { User } from "@/src/domain/user/entities/user";
import type { DrizzleDb } from "@/src/infrastructure/persistence/drizzle-postgres/client";
import { user } from "@/src/infrastructure/persistence/drizzle-postgres/schema";

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
    // One statement, so the "no users yet" test and the insert cannot be
    // interleaved by a second request arriving at the same moment.
    const inserted = await this.db.execute(sql`
      insert into ${user} (email, password)
      select ${input.email}, ${input.passwordHash}
      where not exists (select 1 from ${user})
      returning id
    `);

    return inserted.length > 0;
  }
}
