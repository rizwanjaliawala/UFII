import pino from "pino";
import { config } from "../config/index.js";

/**
 * Centralised logging (doc 01 §Logging, doc 10 §Logging).
 *
 * Named child loggers keep each subsystem's output attributable:
 * synchronization, Outlook, OCR, invoices, AI, errors, performance.
 *
 * Redaction is explicit — credentials must never reach a log file
 * (doc 09 §Security Rules).
 */
export const logger = pino({
  level: config.logLevel,
  redact: {
    paths: [
      "privateKey",
      "apiKey",
      "password",
      "passwordHash",
      "token",
      "*.privateKey",
      "*.apiKey",
      "*.password",
      "*.passwordHash",
      "req.headers.authorization",
      "req.headers.cookie",
    ],
    censor: "[redacted]",
  },
  transport:
    config.env === "development"
      ? {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "HH:MM:ss", ignore: "pid,hostname" },
        }
      : undefined,
});

export const syncLogger = logger.child({ module: "sync" });
export const googleLogger = logger.child({ module: "google" });
export const outlookLogger = logger.child({ module: "outlook" });
export const ocrLogger = logger.child({ module: "ocr" });
export const invoiceLogger = logger.child({ module: "invoice" });
export const aiLogger = logger.child({ module: "ai" });
export const authLogger = logger.child({ module: "auth" });
export const apiLogger = logger.child({ module: "api" });
