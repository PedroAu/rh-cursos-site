import { createHash } from "node:crypto";

import { log } from "./logging.js";
import type {
  Checkpoint,
  CheckpointStore,
  CollectorConfig,
  CollectorSummary,
  ImapMessageHeaders,
  MailSource,
  NormalizedImapEvent,
  EventSink,
} from "./types.js";

function subjectHash(subject: string | null): string | undefined {
  return subject ? createHash("sha256").update(subject, "utf8").digest("hex") : undefined;
}

function toEvent(message: ImapMessageHeaders, uidValidity: string, config: CollectorConfig): NormalizedImapEvent | null {
  if (!message.messageId || !message.from) return null;
  const recipients = message.to.length ? message.to : [config.fallbackRecipient];
  const hashedSubject = subjectHash(message.subject);
  return {
    messageId: message.messageId,
    ...(message.inReplyTo ? { inReplyTo: message.inReplyTo } : {}),
    references: message.references,
    from: message.from,
    to: recipients,
    occurredAt: message.occurredAt,
    imapUid: `${uidValidity}:${message.uid}`,
    mailbox: config.mailbox,
    ...(hashedSubject ? { subjectHash: hashedSubject } : {}),
  };
}

function initialCheckpoint(config: CollectorConfig, uidValidity: string, highestUid: number, now: Date): Checkpoint {
  const since = new Date(now.getTime() - config.initialLookbackDays * 24 * 60 * 60 * 1000);
  return {
    accountKey: config.accountKey,
    uidValidity,
    lastUid: 0,
    mode: "BOOTSTRAP",
    bootstrapSince: since.toISOString(),
    bootstrapHighWaterUid: highestUid,
    updatedAt: now.toISOString(),
  };
}

function nextCheckpoint(checkpoint: Checkpoint, lastUid: number, now: Date): Checkpoint {
  return { ...checkpoint, lastUid, updatedAt: now.toISOString() };
}

export async function runCollector(
  dependencies: { source: MailSource; store: CheckpointStore; sink: EventSink },
  config: CollectorConfig,
  now = new Date(),
): Promise<CollectorSummary> {
  const { source, store, sink } = dependencies;
  try {
    await source.connect();
    const snapshot = await source.snapshot(config.mailbox);
    const saved = await store.load(config.accountKey);
    let checkpoint = !saved || saved.uidValidity !== snapshot.uidValidity
      ? initialCheckpoint(config, snapshot.uidValidity, snapshot.highestUid, now)
      : saved;

    const bootstrapHighWater = checkpoint.bootstrapHighWaterUid ?? snapshot.highestUid;
    const highWaterUid = checkpoint.mode === "BOOTSTRAP" ? bootstrapHighWater : snapshot.highestUid;
    const candidates = await source.listCandidateUids({
      afterUid: checkpoint.lastUid,
      highWaterUid,
      ...(checkpoint.mode === "BOOTSTRAP" && checkpoint.bootstrapSince
        ? { since: new Date(checkpoint.bootstrapSince) }
        : {}),
      limit: config.batchSize,
    });
    const hasMore = candidates.length > config.batchSize;
    const selectedUids = candidates.slice(0, config.batchSize);
    const messages = await source.fetchHeaders(selectedUids);
    let accepted = 0;
    let rejected = 0;
    let invalid = 0;

    for (const message of messages) {
      const event = toEvent(message, snapshot.uidValidity, config);
      if (!event) {
        invalid += 1;
        log.warn("imap message skipped because required headers are missing", { uid: message.uid });
      } else {
        const result = await sink.deliver(event);
        if (result === "ACCEPTED") accepted += 1;
        else rejected += 1;
      }
      checkpoint = nextCheckpoint(checkpoint, message.uid, new Date());
      await store.save(checkpoint);
    }

    if (checkpoint.mode === "BOOTSTRAP" && !hasMore) {
      checkpoint = {
        accountKey: checkpoint.accountKey,
        uidValidity: checkpoint.uidValidity,
        lastUid: highWaterUid,
        mode: "LIVE",
        updatedAt: new Date().toISOString(),
      };
      await store.save(checkpoint);
    }

    return {
      scanned: messages.length,
      accepted,
      rejected,
      invalid,
      mode: checkpoint.mode,
      checkpointUid: checkpoint.lastUid,
    };
  } finally {
    try {
      await source.close();
    } catch (error) {
      log.warn("imap connection cleanup failed", {
        errorType: error instanceof Error ? error.name : "UnknownError",
      });
    }
  }
}

export const collectorInternals = { subjectHash, toEvent, initialCheckpoint };
