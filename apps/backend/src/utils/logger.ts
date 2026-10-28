import pino from "pino";
import { env } from "../config/env";
import { censorLogValue, LOG_REDACT_PATHS } from "./redact";

export const logger = pino({
  level: env.NODE_ENV === "production" ? "info" : "debug",
  redact: { paths: LOG_REDACT_PATHS, censor: censorLogValue },
  transport:
    env.NODE_ENV === "development"
      ? { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss" } }
      : undefined,
});
