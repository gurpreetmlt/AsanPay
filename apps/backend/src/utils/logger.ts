import pino from "pino";
import { env } from "../config/env";
import { LOG_REDACT_PATHS, REDACTED } from "./redact";

export const logger = pino({
  level: env.NODE_ENV === "production" ? "info" : "debug",
  redact: { paths: LOG_REDACT_PATHS, censor: REDACTED },
  transport:
    env.NODE_ENV === "development"
      ? { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss" } }
      : undefined,
});
