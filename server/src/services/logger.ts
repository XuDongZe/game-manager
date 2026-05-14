import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";
import path from "path";

const LOG_DIR = process.env.LOG_DIR ?? "/var/log/game-manager";

const fmt = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.printf(({ timestamp, level, message }) => `${timestamp} [${level.toUpperCase()}] ${message}`)
);

const logger = winston.createLogger({
  level: "info",
  format: fmt,
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(winston.format.colorize(), fmt),
    }),
    new DailyRotateFile({
      dirname: LOG_DIR,
      filename: "deploy-%DATE%.log",
      datePattern: "YYYY-MM-DD",
      zippedArchive: true,
      maxFiles: "30d",
    }),
    new DailyRotateFile({
      dirname: LOG_DIR,
      filename: "error-%DATE%.log",
      datePattern: "YYYY-MM-DD",
      level: "error",
      zippedArchive: true,
      maxFiles: "30d",
    }),
  ],
});

export default logger;
