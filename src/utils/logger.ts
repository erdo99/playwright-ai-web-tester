// ============================================================
//  utils/logger.ts  — Timestamped, coloured console logger
// ============================================================

import chalk from "chalk";
import fs from "fs";
import path from "path";

// ── Types ────────────────────────────────────────────────────
export type LogLevel = "info" | "success" | "warn" | "error" | "step" | "debug";

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
}

// ── Module state ─────────────────────────────────────────────
const logHistory: LogEntry[] = [];

// ── Helpers ──────────────────────────────────────────────────
function timestamp(): string {
  return new Date().toISOString();
}

function formatTime(): string {
  const now = new Date();
  return now.toTimeString().split(" ")[0]; // HH:MM:SS
}

const LEVEL_STYLES: Record<LogLevel, (msg: string) => string> = {
  info:    (m) => chalk.cyan(`ℹ  ${m}`),
  success: (m) => chalk.green(`✔  ${m}`),
  warn:    (m) => chalk.yellow(`⚠  ${m}`),
  error:   (m) => chalk.red(`✖  ${m}`),
  step:    (m) => chalk.magenta(`▶  ${m}`),
  debug:   (m) => chalk.gray(`·  ${m}`),
};

// ── Public API ───────────────────────────────────────────────

/**
 * Log a message at the given level.
 * All messages are stored in memory and can be flushed to disk.
 */
export function log(level: LogLevel, message: string): void {
  const ts = timestamp();
  const entry: LogEntry = { timestamp: ts, level, message };
  logHistory.push(entry);

  const timePrefix = chalk.gray(`[${formatTime()}]`);
  const styled = LEVEL_STYLES[level](message);
  console.log(`${timePrefix} ${styled}`);
}

// Convenience shortcuts
export const logger = {
  info:    (msg: string) => log("info", msg),
  success: (msg: string) => log("success", msg),
  warn:    (msg: string) => log("warn", msg),
  error:   (msg: string) => log("error", msg),
  step:    (msg: string) => log("step", msg),
  debug:   (msg: string) => log("debug", msg),

  /** Print a prominent section divider */
  section(title: string): void {
    const bar = "─".repeat(60);
    console.log("\n" + chalk.bold.blue(bar));
    console.log(chalk.bold.white(`  ${title}`));
    console.log(chalk.bold.blue(bar) + "\n");
  },

  /** Return a copy of every log entry recorded so far */
  getHistory(): LogEntry[] {
    return [...logHistory];
  },

  /** Save the log history to a JSON file */
  saveHistory(filePath: string): void {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(logHistory, null, 2), "utf-8");
    log("info", `Log history saved → ${filePath}`);
  },
};
