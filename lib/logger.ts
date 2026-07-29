type LogLevel = "info" | "warn" | "error" | "debug";

interface LogMeta {
  [key: string]: unknown;
}

class Logger {
  private formatMessage(level: LogLevel, message: string, meta?: LogMeta) {
    const timestamp = new Date().toISOString();
    const metaString = meta && Object.keys(meta).length > 0 ? ` | Meta: ${JSON.stringify(meta)}` : "";
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaString}`;
  }

  info(message: string, meta?: LogMeta) {
    console.log(this.formatMessage("info", message, meta));
  }

  warn(message: string, meta?: LogMeta) {
    console.warn(this.formatMessage("warn", message, meta));
  }

  error(message: string, error?: unknown, meta?: LogMeta) {
    const errObj = error instanceof Error ? error : null;
    const errDetails = errObj
      ? {
          name: errObj.name,
          message: errObj.message,
          stack: process.env.NODE_ENV === "development" ? errObj.stack : undefined,
          ...meta,
        }
      : meta;

    console.error(this.formatMessage("error", message, errDetails));
  }

  debug(message: string, meta?: LogMeta) {
    if (process.env.NODE_ENV === "development") {
      console.debug(this.formatMessage("debug", message, meta));
    }
  }
}

export const logger = new Logger();
