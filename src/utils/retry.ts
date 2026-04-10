// ============================================================
//  utils/retry.ts  — Retry mechanism for flaky test steps
// ============================================================

import { logger } from "./logger.js";

export interface RetryOptions {
  /** Maximum number of attempts (first try + retries) */
  maxAttempts: number;
  /** Milliseconds to wait between attempts */
  delayMs: number;
  /** Human-readable label shown in logs */
  label?: string;
}

/**
 * Execute `fn` up to `maxAttempts` times.
 *
 * - If `fn` resolves, the result is returned immediately.
 * - If `fn` throws, we wait `delayMs` ms and try again.
 * - After the final failed attempt the last error is re-thrown.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const { maxAttempts, delayMs, label = "operation" } = options;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      if (attempt > 1) {
        logger.warn(`[Retry] "${label}" — attempt ${attempt}/${maxAttempts}`);
      }
      return await fn();
    } catch (err) {
      lastError = err;
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.warn(`[Retry] "${label}" failed (attempt ${attempt}/${maxAttempts}): ${errMsg}`);

      if (attempt < maxAttempts) {
        logger.debug(`[Retry] Waiting ${delayMs}ms before next attempt…`);
        await sleep(delayMs);
      }
    }
  }

  throw lastError;
}

/** Simple promise-based sleep */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
