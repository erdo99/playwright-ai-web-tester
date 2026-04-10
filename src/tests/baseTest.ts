// ============================================================
//  tests/baseTest.ts  — Shared test runner skeleton
// ============================================================

import { Page } from "playwright";
import { AppConfig } from "../config/index.js";
import { logger } from "../utils/logger.js";
import { withRetry } from "../utils/retry.js";
import { Reporter, TestResult, TestStatus } from "../utils/reporter.js";
import { captureScreenshot } from "../utils/browser.js";

// ── Types ────────────────────────────────────────────────────
export interface TestContext {
  page: Page;
  config: AppConfig;
  reporter: Reporter;
}

export type TestFn = (ctx: TestContext, attempt: number) => Promise<void>;

export interface TestDefinition {
  /** Display name shown in logs and reports */
  name: string;
  /** Short description of what this test verifies */
  description: string;
  /** The test implementation */
  run: TestFn;
}

// ── Runner ───────────────────────────────────────────────────

/**
 * Execute a single test with the retry mechanism.
 * Captures a screenshot on failure and records the result in the reporter.
 */
export async function runTest(
  definition: TestDefinition,
  ctx: TestContext,
): Promise<TestResult> {
  const { name, description, run } = definition;
  const { page, config, reporter } = ctx;

  logger.section(`TEST: ${name}`);
  logger.info(description);

  const startedAt = new Date().toISOString();
  const startMs   = Date.now();
  let status: TestStatus = "passed";
  let errorMessage: string | undefined;
  let screenshotPath: string | undefined;
  let attempts = 0;

  try {
    await withRetry(
      async () => {
        attempts++;
        await run(ctx, attempts);
      },
      {
        maxAttempts: config.maxRetries,
        delayMs: config.retryDelayMs,
        label: name,
      },
    );
    logger.success(`Test "${name}" passed after ${attempts} attempt(s).`);
  } catch (err) {
    status = "error";
    errorMessage = err instanceof Error ? err.message : String(err);
    logger.error(`Test "${name}" failed after ${attempts} attempt(s): ${errorMessage}`);

    // Capture screenshot on failure for debugging
    try {
      screenshotPath = await captureScreenshot(page, name, config.screenshotsDir);
    } catch (ssErr) {
      logger.warn(`Could not capture screenshot: ${ssErr}`);
    }
  }

  const finishedAt = new Date().toISOString();
  const result: TestResult = {
    name,
    description,
    status,
    durationMs: Date.now() - startMs,
    attempts,
    screenshotPath,
    errorMessage,
    validations: [],        // individual tests populate this via reporter
    startedAt,
    finishedAt,
  };

  reporter.add(result);
  return result;
}
