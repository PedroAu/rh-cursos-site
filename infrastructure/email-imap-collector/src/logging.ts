type LogLevel = "INFO" | "WARN" | "ERROR";

function write(level: LogLevel, message: string, fields: Record<string, unknown> = {}) {
  const entry = JSON.stringify({
    level,
    timestamp: new Date().toISOString(),
    service: "email-imap-collector",
    message,
    ...fields,
  });
  if (level === "ERROR") console.error(entry);
  else if (level === "WARN") console.warn(entry);
  else console.info(entry);
}

export const log = {
  info: (message: string, fields?: Record<string, unknown>) => write("INFO", message, fields),
  warn: (message: string, fields?: Record<string, unknown>) => write("WARN", message, fields),
  error: (message: string, fields?: Record<string, unknown>) => write("ERROR", message, fields),
};

export function errorFields(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) return { errorType: "UnknownError" };
  return { errorType: error.name, errorMessage: error.message.slice(0, 240) };
}
