import type { EventBridgeEvent, Handler } from "aws-lambda";

import { DynamoCheckpointStore } from "./checkpoint-store.js";
import { runCollector } from "./collector.js";
import { loadCollectorConfig } from "./config.js";
import { HttpEventSink } from "./crm-event-sink.js";
import { ImapFlowMailSource } from "./imap-source.js";
import { runWithLease } from "./lease.js";
import { errorFields, log } from "./logging.js";
import { loadCollectorSecret } from "./secrets.js";

type ScheduleDetail = { reason?: string };

export const handler: Handler<EventBridgeEvent<"Scheduled Event", ScheduleDetail>> = async (event, context) => {
  const config = loadCollectorConfig();
  log.info("imap collection started", { requestId: context.awsRequestId, eventId: event.id });

  try {
    const store = new DynamoCheckpointStore(config.checkpointTable);
    const nowEpochSeconds = Math.floor(Date.now() / 1000);
    const leaseDurationSeconds = Math.max(90, Math.ceil(context.getRemainingTimeInMillis() / 1000) + 15);
    const result = await runWithLease(
      store,
      config.accountKey,
      context.awsRequestId,
      nowEpochSeconds,
      leaseDurationSeconds,
      async () => {
        const secret = await loadCollectorSecret(config.secretArn);
        return runCollector(
          {
            source: new ImapFlowMailSource(secret),
            store,
            sink: new HttpEventSink(secret.endpointUrl, secret.webhookSecret, config.requestTimeoutMs),
          },
          config,
        );
      },
    );
    if (!result.acquired) {
      log.info("imap collection skipped because another invocation owns the lease", {
        requestId: context.awsRequestId,
      });
      return { skipped: true, reason: "lease_not_acquired" };
    }
    log.info("imap collection completed", { requestId: context.awsRequestId, ...result.value });
    return result.value;
  } catch (error) {
    log.error("imap collection failed", { requestId: context.awsRequestId, ...errorFields(error) });
    throw error;
  }
};
