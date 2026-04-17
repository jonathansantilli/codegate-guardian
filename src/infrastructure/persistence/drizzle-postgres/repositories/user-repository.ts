import { eq } from "drizzle-orm";
import type {
  CreateGuestUserResult,
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

  async createGuest(input: CreateUserInput): Promise<CreateGuestUserResult> {
    const [row] = await this.db
      .insert(user)
      .values({ email: input.email, password: input.passwordHash })
      .returning({ id: user.id, email: user.email });
    return { id: row.id, email: row.email };
  }
}
