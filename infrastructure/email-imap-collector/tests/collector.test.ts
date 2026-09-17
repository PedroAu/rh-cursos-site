import { describe, expect, it } from "vitest";

import { runCollector } from "../src/collector.js";
import type {
  CandidateQuery,
  Checkpoint,
  CheckpointStore,
  CollectorConfig,
  DeliveryResult,
  EventSink,
  ImapMessageHeaders,
  MailSource,
  NormalizedImapEvent,
} from "../src/types.js";

const config: CollectorConfig = {
  checkpointTable: "checkpoint-table",
  secretArn: "secret-arn",
  mailbox: "INBOX",
  accountKey: "locaweb:pedro:INBOX",
  fallbackRecipient: "pedro@rhcursos.com.br",
  initialLookbackDays: 15,
  batchSize: 50,
  requestTimeoutMs: 8000,
};

function message(uid: number, overrides: Partial<ImapMessageHeaders> = {}): ImapMessageHeaders {
  return {
    uid,
    messageId: `<reply-${uid}@example.test>`,
    inReplyTo: "<outbound@example.test>",
    references: ["<outbound@example.test>"],
    from: "pessoa@example.test",
    to: ["pedro@rhcursos.com.br"],
    occurredAt: "2026-09-16T12:00:00.000Z",
    subject: "Re: Curso",
    ...overrides,
  };
}

class MemoryStore implements CheckpointStore {
  saves: Checkpoint[] = [];

  constructor(public value: Checkpoint | null = null) {}

  async load() { return this.value; }

  async save(checkpoint: Checkpoint) {
    this.value = structuredClone(checkpoint);
    this.saves.push(structuredClone(checkpoint));
  }
}

class FakeSource implements MailSource {
  queries: CandidateQuery[] = [];
  closed = false;

  constructor(
    private readonly uids: number[],
    private readonly messages: ImapMessageHeaders[],
    private readonly uidValidity = "9001",
    private readonly highestUid = 20,
  ) {}

  async connect() {}
  async snapshot() { return { uidValidity: this.uidValidity, highestUid: this.highestUid }; }
  async listCandidateUids(query: CandidateQuery) {
    this.queries.push(query);
    return this.uids;
  }
  async fetchHeaders() { return this.messages; }
  async close() { this.closed = true; }
}

class FakeSink implements EventSink {
  events: NormalizedImapEvent[] = [];

  constructor(private readonly results: Array<DeliveryResult | Error> = []) {}

  async deliver(event: NormalizedImapEvent): Promise<DeliveryResult> {
    this.events.push(event);
    const result = this.results.shift() ?? "ACCEPTED";
    if (result instanceof Error) throw result;
    return result;
  }
}

describe("runCollector", () => {
  it("faz bootstrap de 15 dias, normaliza cabeçalhos e converge para modo LIVE", async () => {
    const store = new MemoryStore();
    const source = new FakeSource([10, 15], [message(10), message(15)]);
    const sink = new FakeSink();

    const summary = await runCollector({ source, store, sink }, config, new Date("2026-09-16T12:00:00.000Z"));

    expect(source.queries[0]).toMatchObject({ afterUid: 0, highWaterUid: 20, limit: 50 });
    expect(source.queries[0].since?.toISOString()).toBe("2026-09-01T12:00:00.000Z");
    expect(summary).toMatchObject({ scanned: 2, accepted: 2, mode: "LIVE", checkpointUid: 20 });
    expect(store.value).toMatchObject({ uidValidity: "9001", lastUid: 20, mode: "LIVE" });
    expect(sink.events[0]).toMatchObject({
      messageId: "<reply-10@example.test>",
      imapUid: "9001:10",
      mailbox: "INBOX",
    });
    expect(sink.events[0].subjectHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(sink.events[0])).not.toContain("Re: Curso");
    expect(source.closed).toBe(true);
  });

  it("mantém o último checkpoint confirmado quando uma entrega temporária falha", async () => {
    const store = new MemoryStore({
      accountKey: config.accountKey,
      uidValidity: "9001",
      lastUid: 10,
      mode: "LIVE",
      updatedAt: "2026-09-16T10:00:00.000Z",
    });
    const source = new FakeSource([11, 12], [message(11), message(12)]);
    const sink = new FakeSink(["ACCEPTED", new Error("temporary")]);

    await expect(runCollector({ source, store, sink }, config)).rejects.toThrow("temporary");
    expect(store.value?.lastUid).toBe(11);
    expect(source.closed).toBe(true);
  });

  it("avança por rejeições definitivas e mensagens estruturalmente inválidas", async () => {
    const store = new MemoryStore();
    const source = new FakeSource([4, 5], [message(4), message(5, { messageId: null })], "33", 5);
    const sink = new FakeSink(["REJECTED"]);

    const summary = await runCollector({ source, store, sink }, config);

    expect(summary).toMatchObject({ rejected: 1, invalid: 1, checkpointUid: 5, mode: "LIVE" });
    expect(store.value?.lastUid).toBe(5);
  });

  it("reinicia em bootstrap quando UIDVALIDITY muda", async () => {
    const store = new MemoryStore({
      accountKey: config.accountKey,
      uidValidity: "old",
      lastUid: 500,
      mode: "LIVE",
      updatedAt: "2026-09-01T00:00:00.000Z",
    });
    const source = new FakeSource([], [], "new", 7);

    await runCollector({ source, store, sink: new FakeSink() }, config, new Date("2026-09-16T00:00:00.000Z"));

    expect(source.queries[0]).toMatchObject({ afterUid: 0, highWaterUid: 7 });
    expect(store.value).toMatchObject({ uidValidity: "new", lastUid: 7, mode: "LIVE" });
  });

  it("mantém bootstrap quando o lote possui mais candidatos", async () => {
    const smallBatch = { ...config, batchSize: 2 };
    const store = new MemoryStore();
    const source = new FakeSource([1, 2, 3], [message(1), message(2)], "1", 10);

    const summary = await runCollector({ source, store, sink: new FakeSink() }, smallBatch);

    expect(summary).toMatchObject({ mode: "BOOTSTRAP", checkpointUid: 2 });
    expect(store.value?.bootstrapHighWaterUid).toBe(10);
  });

  it("tenta limpar a conexão mesmo quando o connect falha", async () => {
    const source = new FakeSource([], []);
    source.connect = async () => { throw new Error("connection failed"); };

    await expect(runCollector({ source, store: new MemoryStore(), sink: new FakeSink() }, config))
      .rejects.toThrow("connection failed");
    expect(source.closed).toBe(true);
  });
});
