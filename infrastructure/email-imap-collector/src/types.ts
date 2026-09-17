export type CollectorSecret = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  endpointUrl: string;
  webhookSecret: string;
  rejectUnauthorized: boolean;
  servername?: string;
};

export type CollectorConfig = {
  checkpointTable: string;
  secretArn: string;
  mailbox: string;
  accountKey: string;
  fallbackRecipient: string;
  initialLookbackDays: number;
  batchSize: number;
  requestTimeoutMs: number;
};

export type Checkpoint = {
  accountKey: string;
  uidValidity: string;
  lastUid: number;
  mode: "BOOTSTRAP" | "LIVE";
  bootstrapSince?: string;
  bootstrapHighWaterUid?: number;
  updatedAt: string;
};

export type MailboxSnapshot = {
  uidValidity: string;
  highestUid: number;
};

export type ImapMessageHeaders = {
  uid: number;
  messageId: string | null;
  inReplyTo: string | null;
  references: string[];
  from: string | null;
  to: string[];
  occurredAt: string;
  subject: string | null;
};

export type NormalizedImapEvent = {
  messageId: string;
  inReplyTo?: string;
  references: string[];
  from: string;
  to: string[];
  occurredAt: string;
  imapUid: string;
  mailbox: string;
  subjectHash?: string;
};

export type CandidateQuery = {
  afterUid: number;
  highWaterUid: number;
  since?: Date;
  limit: number;
};

export interface MailSource {
  connect(): Promise<void>;
  snapshot(mailbox: string): Promise<MailboxSnapshot>;
  listCandidateUids(query: CandidateQuery): Promise<number[]>;
  fetchHeaders(uids: number[]): Promise<ImapMessageHeaders[]>;
  close(): Promise<void>;
}

export interface CheckpointStore {
  load(accountKey: string): Promise<Checkpoint | null>;
  save(checkpoint: Checkpoint): Promise<void>;
}

export type DeliveryResult = "ACCEPTED" | "REJECTED";

export interface EventSink {
  deliver(event: NormalizedImapEvent): Promise<DeliveryResult>;
}

export type CollectorSummary = {
  scanned: number;
  accepted: number;
  rejected: number;
  invalid: number;
  mode: "BOOTSTRAP" | "LIVE";
  checkpointUid: number;
};
