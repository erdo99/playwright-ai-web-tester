// ============================================================
//  utils/reporter.ts  — JSON result file builder
// ============================================================

import fs from "fs";
import path from "path";
import { logger } from "./logger.js";

// ── Types ────────────────────────────────────────────────────
export type TestStatus = "passed" | "failed" | "skipped" | "error";

export interface TestResult {
  name: string;
  description: string;
  status: TestStatus;
  durationMs: number;
  attempts: number;
  screenshotPath?: string;
  errorMessage?: string;
  validations: Array<{ rule: string; passed: boolean; message: string }>;
  startedAt: string;
  finishedAt: string;
}

export interface RunReport {
  runId: string;
  targetUrl: string;
  startedAt: string;
  finishedAt: string;
  totalDurationMs: number;
  summary: {
    total: number;
    passed: number;
    failed: number;
    error: number;
    skipped: number;
  };
  tests: TestResult[];
}

// ── Reporter class ───────────────────────────────────────────
export class Reporter {
  private results: TestResult[] = [];
  private startTime: Date;
  private runId: string;

  constructor(private targetUrl: string) {
    this.startTime = new Date();
    this.runId = `run-${Date.now()}`;
  }

  /** Add a completed test result */
  add(result: TestResult): void {
    this.results.push(result);
  }

  /** Build and return the final report object */
  buildReport(): RunReport {
    const finishedAt = new Date();
    const summary = this.results.reduce(
      (acc, r) => {
        acc.total++;
        acc[r.status]++;
        return acc;
      },
      { total: 0, passed: 0, failed: 0, error: 0, skipped: 0 },
    );

    return {
      runId: this.runId,
      targetUrl: this.targetUrl,
      startedAt: this.startTime.toISOString(),
      finishedAt: finishedAt.toISOString(),
      totalDurationMs: finishedAt.getTime() - this.startTime.getTime(),
      summary,
      tests: this.results,
    };
  }

  /**
   * Save the report to `resultsDir`.
   * @param filePrefix — optional slug (e.g. preset id) → `report-<prefix>-<runId>.json`
   */
  save(resultsDir: string, filePrefix?: string): string {
    if (!fs.existsSync(resultsDir)) {
      fs.mkdirSync(resultsDir, { recursive: true });
    }
    const report = this.buildReport();
    const name = filePrefix
      ? `report-${filePrefix}-${this.runId}.json`
      : `report-${this.runId}.json`;
    const filePath = path.resolve(resultsDir, name);
    fs.writeFileSync(filePath, JSON.stringify(report, null, 2), "utf-8");
    return filePath;
  }

  /** Print a human-readable summary table to the console */
  printSummary(): void {
    const report = this.buildReport();
    const { summary } = report;

    logger.section("TEST RUN SUMMARY");

    console.log(`  Run ID      : ${report.runId}`);
    console.log(`  Target URL  : ${report.targetUrl}`);
    console.log(`  Duration    : ${(report.totalDurationMs / 1000).toFixed(2)}s`);
    console.log(`  Total tests : ${summary.total}`);
    console.log(`  ✔ Passed    : ${summary.passed}`);
    console.log(`  ✖ Failed    : ${summary.failed}`);
    console.log(`  ⚡ Errors   : ${summary.error}`);
    console.log(`  – Skipped   : ${summary.skipped}`);
    console.log();

    for (const test of report.tests) {
      const icon =
        test.status === "passed" ? "✔" :
        test.status === "failed" ? "✖" :
        test.status === "error"  ? "⚡" : "–";
      const duration = `${(test.durationMs / 1000).toFixed(2)}s`;
      console.log(`  ${icon}  [${test.status.toUpperCase().padEnd(7)}]  ${test.name}  (${duration}, ${test.attempts} attempt(s))`);
      if (test.errorMessage) {
        console.log(`       └─ ${test.errorMessage}`);
      }
      if (test.screenshotPath) {
        console.log(`       └─ Screenshot: ${test.screenshotPath}`);
      }
    }

    console.log();
  }
}
