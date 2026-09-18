import type { EventBridgeEvent, Handler } from "aws-lambda";

import { errorFields, log } from "./logging.js";
import { runConfiguredMode } from "./runtime.js";

type ScheduleDetail = { reason?: string };

export const handler: Handler<EventBridgeEvent<"Scheduled Event", ScheduleDetail>> = async (event, context) => {
  log.info("orchestrator invocation started", { requestId: context.awsRequestId, eventId: event.id });
  try {
    const result = await runConfiguredMode();
    log.info("orchestrator invocation completed", { requestId: context.awsRequestId, ...result });
    return result;
  } catch (error) {
    log.error("orchestrator invocation failed", { requestId: context.awsRequestId, ...errorFields(error) });
    throw error;
  }
};
