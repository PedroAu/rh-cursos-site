import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

import type { Checkpoint, CheckpointStore } from "./types.js";

const baseClient = new DynamoDBClient({ maxAttempts: 3 });
const documentClient = DynamoDBDocumentClient.from(baseClient, {
  marshallOptions: { removeUndefinedValues: true },
});

export class DynamoCheckpointStore implements CheckpointStore {
  constructor(private readonly tableName: string) {}

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
