import { strict as assert } from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { DrizzleChatRepository } from "@/src/infrastructure/persistence/drizzle-postgres/repositories/chat-repository";
import { DrizzleMessageRepository } from "@/src/infrastructure/persistence/drizzle-postgres/repositories/message-repository";
import { DrizzleScanFindingRepository } from "@/src/infrastructure/persistence/drizzle-postgres/repositories/scan-finding-repository";
import { DrizzleScanRunRepository } from "@/src/infrastructure/persistence/drizzle-postgres/repositories/scan-run-repository";
import { DrizzleUserRepository } from "@/src/infrastructure/persistence/drizzle-postgres/repositories/user-repository";
import { DrizzleUnitOfWork } from "@/src/infrastructure/persistence/drizzle-postgres/unit-of-work";
import {
  type PostgresHarness,
  startPostgresHarness,
} from "@/tests/helpers/testcontainer-pg";

describe("Feature: ScanRunRepository + ScanFindingRepository + UnitOfWork (Drizzle-Postgres)", () => {
  let harness: PostgresHarness;
  let scanRuns: DrizzleScanRunRepository;
  let scanFindings: DrizzleScanFindingRepository;
  let unitOfWork: DrizzleUnitOfWork;
  let messageId: string;
  let chatId: string;
  let userId: string;

  before(async () => {
    harness = await startPostgresHarness();
    scanRuns = new DrizzleScanRunRepository(harness.db);
    scanFindings = new DrizzleScanFindingRepository(harness.db);
    unitOfWork = new DrizzleUnitOfWork(harness.db);
  });

  after(async () => {
    if (harness) await harness.stop();
  });

  beforeEach(async () => {
    await harness.resetDatabase();
    const users = new DrizzleUserRepository(harness.db);
    const chats = new DrizzleChatRepository(harness.db);
    const messages = new DrizzleMessageRepository(harness.db);
    const guest = await users.createGuest({
      email: "scan-fixture@example.com",
      passwordHash: "h",
    });
    userId = guest.id;
    chatId = "80000000-0000-0000-0000-000000000001";
    messageId = "80000000-0000-0000-0000-0000000000a1";
    await chats.save({
      id: chatId,
      userId,
      title: "scan chat",
      visibility: "private",
    });
    await messages.save({
      messages: [
        {
          id: messageId,
          chatId,
          role: "assistant",
          parts: [],
          attachments: [],
          createdAt: new Date(),
        },
      ],
    });
  });

  it("Given a transactional save, when UnitOfWork.run completes, then scan-run and its findings are persisted together", async () => {
    await unitOfWork.run(async (repos) => {
      const [run] = await repos.scanRuns.saveMany([
        {
          chatId,
          messageId,
          toolCallId: "call-1",
          toolName: "analyzeConfig",
          mode: "analyze_config",
          scanMode: null,
          repositoryUrl: null,
          selectedSkill: null,
          guessedPath: ".claude/settings.json",
          findingsTotal: 1,
          summaryBySeverity: { CRITICAL: 1 },
          rawOutput: {},
          rawReport: {},
          createdAt: new Date(),
        },
      ]);
      await repos.scanFindings.saveMany([
        {
          scanRunId: run.id,
          findingId: "finding-1",
          ruleId: "rule",
          severity: "CRITICAL",
          category: "cat",
          layer: "layer",
          filePath: "x.json",
          description: "boom",
          evidence: null,
          owasp: [],
          cwe: null,
          confidence: null,
          fixable: null,
          rawFinding: {},
          createdAt: new Date(),
        },
      ]);
    });

    const ids = await scanRuns.findIdsByMessageIds([messageId]);
    assert.equal(ids.length, 1);
    const findings = await scanFindings.listByScanRunIds(ids);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].findingId, "finding-1");
  });

  it("Given an error mid-transaction, when UnitOfWork.run throws, then neither scan-run nor findings are persisted", async () => {
    await assert.rejects(() =>
      unitOfWork.run(async (repos) => {
        await repos.scanRuns.saveMany([
          {
            chatId,
            messageId,
            toolCallId: "call-abort",
            toolName: "analyzeConfig",
            mode: "m",
            scanMode: null,
            repositoryUrl: null,
            selectedSkill: null,
            guessedPath: null,
            findingsTotal: 0,
            summaryBySeverity: {},
            rawOutput: {},
            rawReport: {},
            createdAt: new Date(),
          },
        ]);
        throw new Error("boom");
      })
    );

    const ids = await scanRuns.findIdsByMessageIds([messageId]);
    assert.equal(ids.length, 0);
  });

  it("Given existing scan-runs, when deleteByMessageIds + saveMany run atomically, then only the new rows remain", async () => {
    // Arrange: seed one scan-run outside the UoW.
    await scanRuns.saveMany([
      {
        chatId,
        messageId,
        toolCallId: "stale-1",
        toolName: "analyzeConfig",
        mode: null,
        scanMode: null,
        repositoryUrl: null,
        selectedSkill: null,
        guessedPath: null,
        findingsTotal: 0,
        summaryBySeverity: {},
        rawOutput: {},
        rawReport: {},
        createdAt: new Date(),
      },
    ]);

    await unitOfWork.run(async (repos) => {
      const existingRunIds = await repos.scanRuns.findIdsByMessageIds([
        messageId,
      ]);
      await repos.scanFindings.deleteByScanRunIds(existingRunIds);
      await repos.scanRuns.deleteByMessageIds([messageId]);
      await repos.scanRuns.saveMany([
        {
          chatId,
          messageId,
          toolCallId: "fresh-1",
          toolName: "analyzeConfig",
          mode: null,
          scanMode: null,
          repositoryUrl: null,
          selectedSkill: null,
          guessedPath: null,
          findingsTotal: 0,
          summaryBySeverity: {},
          rawOutput: {},
          rawReport: {},
          createdAt: new Date(),
        },
      ]);
    });

    const remaining = await scanRuns.listByMessageIds([messageId]);
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].toolCallId, "fresh-1");
  });
});
