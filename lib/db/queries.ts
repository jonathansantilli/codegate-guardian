import "server-only";

import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  inArray,
  lt,
  type SQL,
} from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { ArtifactKind } from "@/components/chat/artifact";
import type { VisibilityType } from "@/components/chat/visibility-selector";
import {
  extractFindingLocations,
  extractStringArrayField,
  type FindingLocation,
} from "@/lib/security/report-finding-detail";
import { extractNormalizedScanRunsFromMessages } from "@/lib/security/report-normalization";
import {
  buildReportingOverview,
  type ReportingOverview,
  type ReportSeverity,
} from "@/lib/security/reporting-overview";
import { DocumentNotFoundError } from "@/src/application/ports/persistence/document-repository";
import { DrizzleChatRepository } from "@/src/infrastructure/persistence/drizzle-postgres/repositories/chat-repository";
import { DrizzleDocumentRepository } from "@/src/infrastructure/persistence/drizzle-postgres/repositories/document-repository";
import { DrizzleMessageRepository } from "@/src/infrastructure/persistence/drizzle-postgres/repositories/message-repository";
import { DrizzleStreamRepository } from "@/src/infrastructure/persistence/drizzle-postgres/repositories/stream-repository";
import { DrizzleSuggestionRepository } from "@/src/infrastructure/persistence/drizzle-postgres/repositories/suggestion-repository";
import { DrizzleUserRepository } from "@/src/infrastructure/persistence/drizzle-postgres/repositories/user-repository";
import { DrizzleVoteRepository } from "@/src/infrastructure/persistence/drizzle-postgres/repositories/vote-repository";
import { DrizzleUnitOfWork } from "@/src/infrastructure/persistence/drizzle-postgres/unit-of-work";
import { ChatbotError } from "../errors";
import { generateUUID } from "../utils";
import {
  type Chat,
  chat,
  type DBMessage,
  document,
  message,
  type Suggestion,
  scanFinding,
  scanRun,
  stream,
  suggestion,
  type User,
  user,
  vote,
} from "./schema";
import { generateHashedPassword } from "./utils";

const client = postgres(process.env.POSTGRES_URL ?? "");
const db = drizzle(client);

// Phase-3a shim: entity operations delegate to repository adapters built
// on the same Drizzle instance. Document / suggestion / scan-run /
// reporting operations still live in this file and will migrate in
// Phases 3b and 3c.
const userRepository = new DrizzleUserRepository(db);
const chatRepository = new DrizzleChatRepository(db);
const messageRepository = new DrizzleMessageRepository(db);
const voteRepository = new DrizzleVoteRepository(db);
const streamRepository = new DrizzleStreamRepository(db);
const documentRepository = new DrizzleDocumentRepository(db);
const suggestionRepository = new DrizzleSuggestionRepository(db);
const unitOfWork = new DrizzleUnitOfWork(db);

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

export async function createGuestUser() {
  const email = `guest-${Date.now()}`;
  const passwordHash = generateHashedPassword(generateUUID());

  try {
    const guest = await userRepository.createGuest({ email, passwordHash });
    return [{ id: guest.id, email: guest.email }];
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to create guest user"
    );
  }
}

export async function saveChat({
  id,
  userId,
  title,
  visibility,
}: {
  id: string;
  userId: string;
  title: string;
  visibility: VisibilityType;
}) {
  try {
    await chatRepository.save({ id, userId, title, visibility });
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to save chat");
  }
}

export async function deleteChatById({ id }: { id: string }) {
  try {
    return await chatRepository.deleteById(id);
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to delete chat by id"
    );
  }
}

export async function deleteAllChatsByUserId({ userId }: { userId: string }) {
  try {
    return await chatRepository.deleteAllForUser(userId);
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to delete all chats by user id"
    );
  }
}

export async function getChatsByUserId({
  id,
  limit,
  startingAfter,
  endingBefore,
}: {
  id: string;
  limit: number;
  startingAfter: string | null;
  endingBefore: string | null;
}) {
  try {
    return await chatRepository.listByUser({
      userId: id,
      limit,
      startingAfter,
      endingBefore,
    });
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get chats by user id"
    );
  }
}

export async function getChatById({ id }: { id: string }) {
  try {
    return await chatRepository.findById(id);
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to get chat by id");
  }
}

export async function saveMessages({ messages }: { messages: DBMessage[] }) {
  try {
    await messageRepository.save({ messages });
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to save messages");
  }
}

export async function updateMessage({
  id,
  parts,
}: {
  id: string;
  parts: DBMessage["parts"];
}) {
  try {
    await messageRepository.update({ id, parts });
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to update message");
  }
}

export async function getMessagesByChatId({ id }: { id: string }) {
  try {
    return await messageRepository.listByChat(id);
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get messages by chat id"
    );
  }
}

export async function syncScanReportsForMessages({
  messages,
}: {
  messages: Pick<DBMessage, "chatId" | "id" | "parts" | "createdAt">[];
}) {
  try {
    const uniqueMessageIds = [
      ...new Set(messages.map((current) => current.id)),
    ];

    if (uniqueMessageIds.length === 0) {
      return { scanRuns: 0, findings: 0 };
    }

    const normalizedRuns = extractNormalizedScanRunsFromMessages(
      messages.map((current) => ({
        chatId: current.chatId,
        id: current.id,
        parts: current.parts,
        createdAt: current.createdAt,
      }))
    );

    let insertedRunsCount = 0;
    let insertedFindingsCount = 0;

    await unitOfWork.run(async (repos) => {
      const existingRunIds = await repos.scanRuns.findIdsByMessageIds(
        uniqueMessageIds
      );
      if (existingRunIds.length > 0) {
        await repos.scanFindings.deleteByScanRunIds(existingRunIds);
      }
      await repos.scanRuns.deleteByMessageIds(uniqueMessageIds);

      if (normalizedRuns.length === 0) {
        return;
      }

      const insertedRuns = await repos.scanRuns.saveMany(
        normalizedRuns.map((currentRun) => {
          const normalizedScanMode: "repository" | "skills" | null =
            currentRun.scanMode === "repository" ||
            currentRun.scanMode === "skills"
              ? currentRun.scanMode
              : null;

          return {
            chatId: currentRun.chatId,
            messageId: currentRun.messageId,
            toolCallId: currentRun.toolCallId,
            toolName: currentRun.toolName,
            mode: currentRun.mode,
            scanMode: normalizedScanMode,
            repositoryUrl: currentRun.repositoryUrl,
            selectedSkill: currentRun.selectedSkill,
            guessedPath: currentRun.guessedPath,
            findingsTotal: currentRun.findingsTotal,
            summaryBySeverity: currentRun.summaryBySeverity,
            rawOutput: currentRun.rawOutput,
            rawReport: currentRun.rawReport,
            createdAt: currentRun.createdAt,
          };
        })
      );

      insertedRunsCount = insertedRuns.length;

      const runIdByMessageAndToolCall = new Map(
        insertedRuns.map((currentRun) => [
          `${currentRun.messageId}:${currentRun.toolCallId}`,
          currentRun.id,
        ])
      );

      const findingRows = normalizedRuns.flatMap((currentRun) => {
        const scanRunId = runIdByMessageAndToolCall.get(
          `${currentRun.messageId}:${currentRun.toolCallId}`
        );
        if (!scanRunId) {
          return [];
        }
        return currentRun.findings.map((finding) => ({
          scanRunId,
          findingId: finding.findingId,
          ruleId: finding.ruleId,
          severity: finding.severity,
          category: finding.category,
          layer: finding.layer,
          filePath: finding.filePath,
          description: finding.description,
          evidence: finding.evidence,
          owasp: finding.owasp,
          cwe: finding.cwe,
          confidence: finding.confidence,
          fixable: finding.fixable,
          rawFinding: finding.rawFinding,
          createdAt: currentRun.createdAt,
        }));
      });

      if (findingRows.length > 0) {
        insertedFindingsCount = findingRows.length;
        await repos.scanFindings.saveMany(findingRows);
      }
    });

    return { scanRuns: insertedRunsCount, findings: insertedFindingsCount };
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to sync scan reports for messages"
    );
  }
}

export async function voteMessage({
  chatId,
  messageId,
  type,
}: {
  chatId: string;
  messageId: string;
  type: "up" | "down";
}) {
  try {
    await voteRepository.cast({ chatId, messageId, type });
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to vote message");
  }
}

export async function getVotesByChatId({ id }: { id: string }) {
  try {
    return await voteRepository.listByChat(id);
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get votes by chat id"
    );
  }
}

export async function saveDocument({
  id,
  title,
  kind,
  content,
  userId,
}: {
  id: string;
  title: string;
  kind: ArtifactKind;
  content: string;
  userId: string;
}) {
  try {
    return await documentRepository.save({ id, title, kind, content, userId });
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to save document");
  }
}

export async function updateDocumentContent({
  id,
  content,
}: {
  id: string;
  content: string;
}) {
  try {
    return await documentRepository.updateLatestContent({ id, content });
  } catch (error) {
    if (error instanceof DocumentNotFoundError) {
      throw new ChatbotError("not_found:database", "Document not found");
    }
    throw new ChatbotError(
      "bad_request:database",
      "Failed to update document content"
    );
  }
}

export async function getDocumentsById({ id }: { id: string }) {
  try {
    return await documentRepository.listVersions(id);
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get documents by id"
    );
  }
}

export async function getDocumentById({ id }: { id: string }) {
  try {
    const latest = await documentRepository.getLatest(id);
    return latest ?? undefined;
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get document by id"
    );
  }
}

export async function deleteDocumentsByIdAfterTimestamp({
  id,
  timestamp,
}: {
  id: string;
  timestamp: Date;
}) {
  try {
    return await documentRepository.deleteAfter({ id, timestamp });
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to delete documents by id after timestamp"
    );
  }
}

export async function saveSuggestions({
  suggestions,
}: {
  suggestions: Suggestion[];
}) {
  try {
    await suggestionRepository.save(suggestions);
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to save suggestions"
    );
  }
}

export async function getSuggestionsByDocumentId({
  documentId,
}: {
  documentId: string;
}) {
  try {
    return await suggestionRepository.listByDocumentId(documentId);
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get suggestions by document id"
    );
  }
}

export async function getMessageById({ id }: { id: string }) {
  try {
    return await messageRepository.findById(id);
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get message by id"
    );
  }
}

export async function deleteMessagesByChatIdAfterTimestamp({
  chatId,
  timestamp,
}: {
  chatId: string;
  timestamp: Date;
}) {
  try {
    await messageRepository.deleteAfter({ chatId, timestamp });
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to delete messages by chat id after timestamp"
    );
  }
}

export async function updateChatVisibilityById({
  chatId,
  visibility,
}: {
  chatId: string;
  visibility: "private" | "public";
}) {
  try {
    await chatRepository.updateVisibility(chatId, visibility);
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to update chat visibility by id"
    );
  }
}

export async function updateChatTitleById({
  chatId,
  title,
}: {
  chatId: string;
  title: string;
}) {
  try {
    await chatRepository.updateTitle(chatId, title);
  } catch (_error) {
    return;
  }
}

export async function getMessageCountByUserId({
  id,
  differenceInHours,
}: {
  id: string;
  differenceInHours: number;
}) {
  try {
    return await messageRepository.countRecentUserMessages({
      userId: id,
      sinceHours: differenceInHours,
    });
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get message count by user id"
    );
  }
}

export async function createStreamId({
  streamId,
  chatId,
}: {
  streamId: string;
  chatId: string;
}) {
  try {
    await streamRepository.register({ streamId, chatId });
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to create stream id"
    );
  }
}

export async function getStreamIdsByChatId({ chatId }: { chatId: string }) {
  try {
    return await streamRepository.listByChat(chatId);
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get stream ids by chat id"
    );
  }
}

export async function getReportingOverviewByUserId({
  userId,
}: {
  userId?: string | null;
}): Promise<ReportingOverview> {
  try {
    const runs = userId
      ? await db
          .select({
            id: scanRun.id,
            chatId: scanRun.chatId,
            chatTitle: chat.title,
            createdAt: scanRun.createdAt,
            toolName: scanRun.toolName,
            scanMode: scanRun.scanMode,
            repositoryUrl: scanRun.repositoryUrl,
            selectedSkill: scanRun.selectedSkill,
            guessedPath: scanRun.guessedPath,
            findingsTotal: scanRun.findingsTotal,
          })
          .from(scanRun)
          .innerJoin(chat, eq(chat.id, scanRun.chatId))
          .where(eq(chat.userId, userId))
      : await db
          .select({
            id: scanRun.id,
            chatId: scanRun.chatId,
            chatTitle: chat.title,
            createdAt: scanRun.createdAt,
            toolName: scanRun.toolName,
            scanMode: scanRun.scanMode,
            repositoryUrl: scanRun.repositoryUrl,
            selectedSkill: scanRun.selectedSkill,
            guessedPath: scanRun.guessedPath,
            findingsTotal: scanRun.findingsTotal,
          })
          .from(scanRun)
          .innerJoin(chat, eq(chat.id, scanRun.chatId));

    const findingsRows = userId
      ? await db
          .select({
            id: scanFinding.id,
            scanRunId: scanFinding.scanRunId,
            chatId: scanRun.chatId,
            createdAt: scanFinding.createdAt,
            severity: scanFinding.severity,
            category: scanFinding.category,
            layer: scanFinding.layer,
            filePath: scanFinding.filePath,
            description: scanFinding.description,
            evidence: scanFinding.evidence,
            repositoryUrl: scanRun.repositoryUrl,
            selectedSkill: scanRun.selectedSkill,
          })
          .from(scanFinding)
          .innerJoin(scanRun, eq(scanRun.id, scanFinding.scanRunId))
          .innerJoin(chat, eq(chat.id, scanRun.chatId))
          .where(eq(chat.userId, userId))
      : await db
          .select({
            id: scanFinding.id,
            scanRunId: scanFinding.scanRunId,
            chatId: scanRun.chatId,
            createdAt: scanFinding.createdAt,
            severity: scanFinding.severity,
            category: scanFinding.category,
            layer: scanFinding.layer,
            filePath: scanFinding.filePath,
            description: scanFinding.description,
            evidence: scanFinding.evidence,
            repositoryUrl: scanRun.repositoryUrl,
            selectedSkill: scanRun.selectedSkill,
          })
          .from(scanFinding)
          .innerJoin(scanRun, eq(scanRun.id, scanFinding.scanRunId))
          .innerJoin(chat, eq(chat.id, scanRun.chatId));

    const findings = findingsRows
      .filter(
        (finding): finding is typeof finding & { severity: ReportSeverity } => {
          return (
            finding.severity === "CRITICAL" ||
            finding.severity === "HIGH" ||
            finding.severity === "MEDIUM" ||
            finding.severity === "LOW" ||
            finding.severity === "INFO"
          );
        }
      )
      .map((finding) => ({
        ...finding,
        severity: finding.severity,
      }));

    return buildReportingOverview({
      runs: runs.map((run) => ({
        ...run,
        scanMode:
          run.scanMode === "repository" || run.scanMode === "skills"
            ? run.scanMode
            : null,
      })),
      findings,
    });
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get reporting overview by user id"
    );
  }
}

export type ReportingFindingDetail = {
  id: string;
  findingId: string;
  scanRunId: string;
  chatId: string;
  createdAt: Date;
  severity: ReportSeverity;
  category: string | null;
  layer: string | null;
  ruleId: string | null;
  filePath: string | null;
  description: string;
  evidence: string | null;
  repositoryUrl: string | null;
  selectedSkill: string | null;
  scanMode: "repository" | "skills" | null;
  toolName: "analyzeConfig" | "scanGithubRepo";
  confidence: string | null;
  cwe: string | null;
  owasp: string[];
  fixable: boolean | null;
  primaryLocation: FindingLocation | null;
  affectedLocations: FindingLocation[];
  remediationActions: string[];
  affectedTools: string[];
};

function toReportSeverity(value: unknown): ReportSeverity | null {
  if (
    value === "CRITICAL" ||
    value === "HIGH" ||
    value === "MEDIUM" ||
    value === "LOW" ||
    value === "INFO"
  ) {
    return value;
  }

  return null;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

export async function getReportingFindingDetailById({
  id,
  userId,
}: {
  id: string;
  userId?: string | null;
}): Promise<ReportingFindingDetail | null> {
  try {
    const rows = userId
      ? await db
          .select({
            id: scanFinding.id,
            findingId: scanFinding.findingId,
            scanRunId: scanFinding.scanRunId,
            chatId: scanRun.chatId,
            createdAt: scanFinding.createdAt,
            severity: scanFinding.severity,
            category: scanFinding.category,
            layer: scanFinding.layer,
            ruleId: scanFinding.ruleId,
            filePath: scanFinding.filePath,
            description: scanFinding.description,
            evidence: scanFinding.evidence,
            confidence: scanFinding.confidence,
            cwe: scanFinding.cwe,
            owasp: scanFinding.owasp,
            fixable: scanFinding.fixable,
            rawFinding: scanFinding.rawFinding,
            repositoryUrl: scanRun.repositoryUrl,
            selectedSkill: scanRun.selectedSkill,
            scanMode: scanRun.scanMode,
            toolName: scanRun.toolName,
          })
          .from(scanFinding)
          .innerJoin(scanRun, eq(scanRun.id, scanFinding.scanRunId))
          .innerJoin(chat, eq(chat.id, scanRun.chatId))
          .where(and(eq(scanFinding.id, id), eq(chat.userId, userId)))
          .limit(1)
      : await db
          .select({
            id: scanFinding.id,
            findingId: scanFinding.findingId,
            scanRunId: scanFinding.scanRunId,
            chatId: scanRun.chatId,
            createdAt: scanFinding.createdAt,
            severity: scanFinding.severity,
            category: scanFinding.category,
            layer: scanFinding.layer,
            ruleId: scanFinding.ruleId,
            filePath: scanFinding.filePath,
            description: scanFinding.description,
            evidence: scanFinding.evidence,
            confidence: scanFinding.confidence,
            cwe: scanFinding.cwe,
            owasp: scanFinding.owasp,
            fixable: scanFinding.fixable,
            rawFinding: scanFinding.rawFinding,
            repositoryUrl: scanRun.repositoryUrl,
            selectedSkill: scanRun.selectedSkill,
            scanMode: scanRun.scanMode,
            toolName: scanRun.toolName,
          })
          .from(scanFinding)
          .innerJoin(scanRun, eq(scanRun.id, scanFinding.scanRunId))
          .innerJoin(chat, eq(chat.id, scanRun.chatId))
          .where(eq(scanFinding.id, id))
          .limit(1);

    const row = rows[0];
    if (!row) {
      return null;
    }

    const severity = toReportSeverity(row.severity);
    if (!severity) {
      return null;
    }

    const { primaryLocation, affectedLocations } = extractFindingLocations({
      filePath: row.filePath,
      evidence: row.evidence,
      rawFinding: row.rawFinding,
    });

    return {
      id: row.id,
      findingId: row.findingId,
      scanRunId: row.scanRunId,
      chatId: row.chatId,
      createdAt: row.createdAt,
      severity,
      category: row.category,
      layer: row.layer,
      ruleId: row.ruleId,
      filePath: row.filePath,
      description: row.description,
      evidence: row.evidence,
      repositoryUrl: row.repositoryUrl,
      selectedSkill: row.selectedSkill,
      scanMode:
        row.scanMode === "repository" || row.scanMode === "skills"
          ? row.scanMode
          : null,
      toolName: row.toolName,
      confidence: row.confidence,
      cwe: row.cwe,
      owasp: toStringArray(row.owasp),
      fixable: row.fixable,
      primaryLocation,
      affectedLocations,
      remediationActions: extractStringArrayField(
        row.rawFinding,
        "remediation_actions"
      ),
      affectedTools: extractStringArrayField(row.rawFinding, "affected_tools"),
    };
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get reporting finding detail by id"
    );
  }
}
