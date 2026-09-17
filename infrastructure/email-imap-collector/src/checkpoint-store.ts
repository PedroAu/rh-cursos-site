import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DeleteCommand, DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

import type { LeaseStore } from "./lease.js";
import type { Checkpoint, CheckpointStore } from "./types.js";

const baseClient = new DynamoDBClient({ maxAttempts: 3 });
const documentClient = DynamoDBDocumentClient.from(baseClient, {
  marshallOptions: { removeUndefinedValues: true },
});

export class DynamoCheckpointStore implements CheckpointStore, LeaseStore {
  constructor(private readonly tableName: string) {}

  async acquireLease(
    accountKey: string,
    owner: string,
    nowEpochSeconds: number,
    leaseUntilEpochSeconds: number,
  ): Promise<boolean> {
    try {
      await documentClient.send(new PutCommand({
        TableName: this.tableName,
        Item: {
          accountKey: `${accountKey}#collector-lock`,
          kind: "COLLECTOR_LEASE",
          leaseOwner: owner,
          leaseUntil: leaseUntilEpochSeconds,
          updatedAt: new Date(nowEpochSeconds * 1000).toISOString(),
        },
        ConditionExpression: "attribute_not_exists(accountKey) OR leaseUntil < :now",
        ExpressionAttributeValues: { ":now": nowEpochSeconds },
      }));
      return true;
    } catch (error) {
      if (error instanceof Error && error.name === "ConditionalCheckFailedException") return false;
      throw error;
    }
  }

  async releaseLease(accountKey: string, owner: string): Promise<boolean> {
    try {
      await documentClient.send(new DeleteCommand({
        TableName: this.tableName,
        Key: { accountKey: `${accountKey}#collector-lock` },
        ConditionExpression: "leaseOwner = :owner",
        ExpressionAttributeValues: { ":owner": owner },
      }));
      return true;
    } catch (error) {
      if (error instanceof Error && error.name === "ConditionalCheckFailedException") return false;
      throw error;
    }
  }

  async load(accountKey: string): Promise<Checkpoint | null> {
    const { Item } = await documentClient.send(new GetCommand({
      TableName: this.tableName,
      Key: { accountKey },
      ConsistentRead: true,
    }));
    return Item ? (Item as Checkpoint) : null;
  }

  async save(checkpoint: Checkpoint): Promise<void> {
    await documentClient.send(new UpdateCommand({
      TableName: this.tableName,
      Key: { accountKey: checkpoint.accountKey },
      UpdateExpression: [
        "SET uidValidity = :uidValidity",
        "lastUid = :lastUid",
        "#mode = :mode",
        "bootstrapSince = :bootstrapSince",
        "bootstrapHighWaterUid = :bootstrapHighWaterUid",
        "updatedAt = :updatedAt",
      ].join(", "),
      ConditionExpression: "attribute_not_exists(lastUid) OR uidValidity <> :uidValidity OR lastUid <= :lastUid",
      ExpressionAttributeNames: { "#mode": "mode" },
      ExpressionAttributeValues: {
        ":uidValidity": checkpoint.uidValidity,
        ":lastUid": checkpoint.lastUid,
        ":mode": checkpoint.mode,
        ":bootstrapSince": checkpoint.bootstrapSince ?? null,
        ":bootstrapHighWaterUid": checkpoint.bootstrapHighWaterUid ?? null,
        ":updatedAt": checkpoint.updatedAt,
      },
    }));
  }
}
