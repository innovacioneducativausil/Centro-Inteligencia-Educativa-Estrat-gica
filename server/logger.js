import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

function resolveLogDir() {
  const configuredDir = process.env.LOG_DIR || './logs';
  return path.isAbsolute(configuredDir)
    ? configuredDir
    : path.resolve(__dirname, configuredDir);
}

function getRetentionDays() {
  const parsed = Number.parseInt(process.env.LOG_RETENTION_DAYS || '30', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30;
}

const logFormat = winston.format.printf(({ timestamp, level, message, context, stack, ...meta }) => {
  const contextText = context ? ` [${context}]` : '';
  const metaText = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  const stackText = stack ? `\n${stack}` : '';
  return `${timestamp} ${level.toUpperCase()}${contextText}: ${message}${metaText}${stackText}`;
});

const transports = [
  new DailyRotateFile({
    dirname: resolveLogDir(),
    filename: 'server-%DATE%',
    datePattern: 'YYYY-MM-DD',
    maxFiles: `${getRetentionDays()}d`,
    level: 'info',
    extension: '.txt',
  }),
];

if (!IS_PRODUCTION) {
  transports.push(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        logFormat
      ),
    })
  );
}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    logFormat
  ),
  transports,
  exitOnError: false,
});

export default logger;
