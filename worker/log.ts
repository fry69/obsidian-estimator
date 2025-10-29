type IngestLogLevel = "debug" | "info" | "error";

export interface IngestLogEntry {
  level: IngestLogLevel;
  message: string;
}

export function describeError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  if (typeof error === "string") {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch (serializationError) {
    console.error(
      "[Ingest] Failed to serialise error payload.",
      serializationError,
    );
    return String(error);
  }
}

export function createIngestLogger() {
  const entries: IngestLogEntry[] = [];

  const record = (level: IngestLogLevel, message: string): void => {
    entries.push({ level, message });
  };

  return {
    entries,
    debug(message: string): void {
      record("debug", message);
      console.debug(message);
    },
    info(message: string): void {
      record("info", message);
      console.info(message);
    },
    error(message: string, error?: unknown): void {
      const detail = error ? describeError(error) : null;
      record("error", detail ? `${message} - ${detail}` : message);
      if (error) {
        console.error(message, error);
      } else {
        console.error(message);
      }
    },
  };
}
