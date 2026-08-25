import { and, eq, lt, sql } from "drizzle-orm";
import type { DrizzleDb } from "../client";
import { signInAttempt } from "../schema";

/**
 * Counts failed sign-ins so a password cannot be guessed at indefinitely.
 *
 * A console with one operator, reachable by anyone who can reach the port,
 * otherwise offers unlimited attempts at the only credential that matters —
 * at whatever rate bcrypt allows, and leaving nothing behind to show it
 * happened.
 *
 * Counted in the database rather than in memory so the limit survives a
 * restart and holds across more than one instance, and so it needs no service
 * this project does not already run.
 *
 * Fixed windows rather than sliding: the window start is what the unique
 * constraint is on, which is what makes the increment atomic under
 * concurrency. The cost is that an attacker gets at most one extra allowance
 * across a boundary, which does not change the economics of guessing.
 */
export class DrizzleSignInAttemptRepository {
  constructor(
    private readonly db: DrizzleDb,
    private readonly windowMs: number,
    private readonly maxFailures: number
  ) {}

  private windowStartFor(at: Date): Date {
    return new Date(Math.floor(at.getTime() / this.windowMs) * this.windowMs);
  }

  private static normalise(email: string): string {
    return email.trim().toLowerCase();
  }

  /** True when this address has already spent its attempts for the window. */
  async isThrottled(email: string, at: Date = new Date()): Promise<boolean> {
    const [row] = await this.db
      .select({ failures: signInAttempt.failures })
      .from(signInAttempt)
      .where(
        and(
          eq(
            signInAttempt.identifier,
            DrizzleSignInAttemptRepository.normalise(email)
          ),
          eq(signInAttempt.windowStart, this.windowStartFor(at))
        )
      );

    return (row?.failures ?? 0) >= this.maxFailures;
  }

  /** Counts one failure against the address, returning the new total. */
  async recordFailure(email: string, at: Date = new Date()): Promise<number> {
    // Upsert rather than read-then-write: concurrent attempts against the
    // same address must not each read "9" and each write "10".
    const [row] = await this.db
      .insert(signInAttempt)
      .values({
        identifier: DrizzleSignInAttemptRepository.normalise(email),
        windowStart: this.windowStartFor(at),
        failures: 1,
      })
      .onConflictDoUpdate({
        target: [signInAttempt.identifier, signInAttempt.windowStart],
        set: { failures: sql`${signInAttempt.failures} + 1` },
      })
      .returning({ failures: signInAttempt.failures });

    return row?.failures ?? 0;
  }

  /** Clears the count for an address that has just signed in successfully. */
  async clear(email: string): Promise<void> {
    await this.db
      .delete(signInAttempt)
      .where(
        eq(
          signInAttempt.identifier,
          DrizzleSignInAttemptRepository.normalise(email)
        )
      );
  }

  /** Drops windows that can no longer throttle anything. */
  async pruneBefore(at: Date): Promise<void> {
    await this.db
      .delete(signInAttempt)
      .where(lt(signInAttempt.windowStart, this.windowStartFor(at)));
  }
}
