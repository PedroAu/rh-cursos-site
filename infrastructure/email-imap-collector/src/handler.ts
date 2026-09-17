import type { EventBridgeEvent, Handler } from "aws-lambda";

import { DynamoCheckpointStore } from "./checkpoint-store.js";
import { runCollector } from "./collector.js";
import { loadCollectorConfig } from "./config.js";
import { HttpEventSink } from "./crm-event-sink.js";
import { ImapFlowMailSource } from "./imap-source.js";
import { errorFields, log } from "./logging.js";
import { loadCollectorSecret } from "./secrets.js";

type ScheduleDetail = { reason?: string };

export const handler: Handler<EventBridgeEvent<"Scheduled Event", ScheduleDetail>> = async (event, context) => {
  const config = loadCollectorConfig();
  log.info("imap collection started", { requestId: context.awsRequestId, eventId: event.id });

  try {
    const secret = await loadCollectorSecret(config.secretArn);
    const summary = await runCollector(
      {
        source: new ImapFlowMailSource(secret),
        store: new DynamoCheckpointStore(config.checkpointTable),
        sink: new HttpEventSink(secret.endpointUrl, secret.webhookSecret, config.requestTimeoutMs),
      },
      config,
    );
    log.info("imap collection completed", { requestId: context.awsRequestId, ...summary });
    return summary;
  } catch (error) {
    log.error("imap collection failed", { requestId: context.awsRequestId, ...errorFields(error) });
    throw error;
  }
};
