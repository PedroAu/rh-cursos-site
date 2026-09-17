import { ImapFlow, type FetchMessageObject } from "imapflow";

import type {
  CandidateQuery,
  CollectorSecret,
  ImapMessageHeaders,
  MailboxSnapshot,
  MailSource,
} from "./types.js";

function numberValue(value: unknown, fallback = 0): number {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  return fallback;
}

function parseHeaderBlock(headers: Buffer | undefined): Map<string, string> {
  const map = new Map<string, string>();
  if (!headers) return map;
  const unfolded = headers.toString("utf8").replace(/\r?\n[ \t]+/g, " ");
  for (const line of unfolded.split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator < 1) continue;
    const name = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (name && value && !map.has(name)) map.set(name, value);
  }
  return map;
}

function messageIds(value: string | undefined): string[] {
  if (!value) return [];
  const bracketed = value.match(/<[^<>]+>/g);
  return (bracketed ?? value.split(/\s+/)).map((item) => item.trim()).filter(Boolean).slice(0, 30);
}

function addresses(entries: Array<{ address?: string }> | undefined): string[] {
  return (entries ?? []).map((entry) => entry.address?.trim()).filter((value): value is string => Boolean(value));
}

function toHeaders(message: FetchMessageObject): ImapMessageHeaders {
  const headers = parseHeaderBlock(message.headers);
  const envelope = message.envelope;
  const rawDate = envelope?.date ?? message.internalDate ?? new Date();
  const date = rawDate instanceof Date ? rawDate : new Date(rawDate);
  return {
    uid: message.uid,
    messageId: envelope?.messageId?.trim() || headers.get("message-id") || null,
    inReplyTo: headers.get("in-reply-to") ?? null,
    references: messageIds(headers.get("references")),
    from: addresses(envelope?.from)[0] ?? null,
    to: addresses(envelope?.to),
    occurredAt: date.toISOString(),
    subject: envelope?.subject?.trim() || null,
  };
}

export class ImapFlowMailSource implements MailSource {
  private readonly client: ImapFlow;
  private mailboxName = "INBOX";
  private releaseLock: (() => void) | null = null;

  constructor(secret: CollectorSecret) {
    this.client = new ImapFlow({
      host: secret.host,
      port: secret.port,
      secure: secret.secure,
      auth: { user: secret.user, pass: secret.password },
      logger: false,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 40_000,
      tls: {
        rejectUnauthorized: secret.rejectUnauthorized,
        ...(secret.servername ? { servername: secret.servername } : {}),
      },
    });
  }

  async connect(): Promise<void> {
    await this.client.connect();
  }

  async snapshot(mailbox: string): Promise<MailboxSnapshot> {
    this.mailboxName = mailbox;
    const lock = await this.client.getMailboxLock(mailbox);
    this.releaseLock = () => lock.release();
    const selected = this.client.mailbox;
    if (!selected) throw new Error("IMAP mailbox was not selected.");
    const uidValidity = String(selected.uidValidity);
    const uidNext = numberValue(selected.uidNext, 1);
    return { uidValidity, highestUid: Math.max(0, uidNext - 1) };
  }

  async listCandidateUids(query: CandidateQuery): Promise<number[]> {
    if (query.highWaterUid <= query.afterUid) return [];
    const search = {
      uid: `${query.afterUid + 1}:${query.highWaterUid}`,
      ...(query.since ? { since: query.since } : {}),
    };
    const uids = await this.client.search(search, { uid: true });
    if (!uids) return [];
    return [...uids].sort((left, right) => left - right).slice(0, query.limit + 1);
  }

  async fetchHeaders(uids: number[]): Promise<ImapMessageHeaders[]> {
    if (!uids.length) return [];
    const messages = await this.client.fetchAll(
      uids,
      {
        envelope: true,
        internalDate: true,
        headers: ["Message-ID", "In-Reply-To", "References"],
      },
      { uid: true },
    );
    return messages.map(toHeaders).sort((left, right) => left.uid - right.uid);
  }

  async close(): Promise<void> {
    this.releaseLock?.();
    this.releaseLock = null;
    if (this.client.usable) await this.client.logout();
    else this.client.close();
  }
}

export const imapInternals = { parseHeaderBlock, messageIds, toHeaders };
