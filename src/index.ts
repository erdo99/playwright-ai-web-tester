#!/usr/bin/env node
// ============================================================
//  index.ts  — AI Web App Tester  |  Main entry point
//
//  Usage:
//    npm run test
//    npm run test -- --target https://yourapp.com
//    npm run test -- --target https://yourapp.com --headed
//    npm run test -- --help
//
//  Note: npm may treat --url / --tests as npm config (not forwarded). Prefer
//  --target / --cases, or: npm run build && node dist/index.js --target …
// ============================================================

import { Command } from "commander";
import chalk from "chalk";
import { config as defaultConfig, AppConfig } from "./config/index.js";
import { launchBrowser, navigateTo, closeBrowser } from "./utils/browser.js";
import { logger } from "./utils/logger.js";
import { Reporter } from "./utils/reporter.js";
import { runTest } from "./tests/baseTest.js";
import { validInputTest } from "./tests/validInputTest.js";
import { emptyInputTest } from "./tests/emptyInputTest.js";
import { longInputTest } from "./tests/longInputTest.js";
import { specialCharsTest } from "./tests/specialCharsTest.js";

const DEFAULT_CASES = "valid,empty,long,special";

/** When npm swallows --url/--tests, user may run: node dist/index.js https://… valid */
function looseTargetAndCases(argv: string[]): { url?: string; cases?: string } {
  const tokens: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("-")) {
      if (a === "-u" || a === "--url" || a === "--target") {
        i++;
        continue;
      }
      if (a.startsWith("--url=") || a.startsWith("--target=")) continue;
      if (a === "--tests" || a === "--cases") {
        i++;
        continue;
      }
      if (a.startsWith("--tests=") || a.startsWith("--cases=")) continue;
      if (a === "--headed") continue;
      if (a === "--retries") {
        i++;
        continue;
      }
      if (a.startsWith("--retries=")) continue;
      continue;
    }
    tokens.push(a);
  }
  const url = tokens.find((t) => /^https?:\/\//i.test(t));
  const rest = tokens.filter((t) => !/^https?:\/\//i.test(t));
  const cases = rest.length > 0 ? rest.join(",") : undefined;
  return { url, cases };
}

// ── CLI setup ────────────────────────────────────────────────
const program = new Command();

program
  .name("ai-tester")
  .description("AI Web App Tester — automated QA for prompt-based AI tools")
  .version("1.0.0")
  .option("-u, --target <url>", "Override the target URL from config")
  .option("--url <url>", "Alias for --target (prefer --target; npm may not forward --url)")
  .option("--headed", "Run browser in headed (visible) mode", false)
  .option(
    "-t, --cases <names>",
    `Comma-separated tests: valid, empty, long, special (default: ${DEFAULT_CASES})`,
  )
  .option(
    "--tests <names>",
    "Alias for --cases (prefer --cases; npm may not forward --tests)",
  )
  .option("--retries <n>", "Max attempts per test (includes first try)", String(defaultConfig.maxRetries))
  .parse(process.argv);

const opts = program.opts<{
  target?: string;
  url?: string;
  headed: boolean;
  cases?: string;
  tests?: string;
  retries: string;
}>();

const loose = looseTargetAndCases(process.argv.slice(2));
const resolvedUrl =
  opts.target ??
  opts.url ??
  loose.url ??
  process.env.AI_WEB_TESTER_URL ??
  defaultConfig.url;
const resolvedCases =
  opts.cases ??
  opts.tests ??
  loose.cases ??
  process.env.AI_WEB_TESTER_TESTS ??
  DEFAULT_CASES;

// ── Merge CLI options into config ────────────────────────────
const config: AppConfig = {
  ...defaultConfig,
  url: resolvedUrl,
  maxRetries: parseInt(opts.retries, 10) || defaultConfig.maxRetries,
};

// ── Test registry ────────────────────────────────────────────
const ALL_TESTS = {
  valid:   validInputTest,
  empty:   emptyInputTest,
  long:    longInputTest,
  special: specialCharsTest,
} as const;

// ── Banner ───────────────────────────────────────────────────
function printBanner(): void {
  console.log();
  console.log(chalk.bold.cyan("╔══════════════════════════════════════════════════╗"));
  console.log(chalk.bold.cyan("║") + chalk.bold.white("        🤖  AI Web App Tester  v1.0.0           ") + chalk.bold.cyan("║"));
  console.log(chalk.bold.cyan("╚══════════════════════════════════════════════════╝"));
  console.log(chalk.gray(`  Target : ${config.url}`));
  console.log(chalk.gray(`  Headed : ${opts.headed}`));
  console.log(chalk.gray(`  Retries: ${config.maxRetries}`));
  console.log(chalk.gray(`  Tests  : ${resolvedCases}`));
  console.log();
}

// ── Main ─────────────────────────────────────────────────────
async function main(): Promise<void> {
  printBanner();

  // Determine which tests to run
  const requestedKeys = resolvedCases
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t in ALL_TESTS) as Array<keyof typeof ALL_TESTS>;

  if (requestedKeys.length === 0) {
    logger.error("No valid test names provided. Available: valid, empty, long, special");
    process.exit(1);
  }

  const testsToRun = requestedKeys.map((k) => ALL_TESTS[k]);
  logger.info(`Running ${testsToRun.length} test(s): ${requestedKeys.join(", ")}`);

  const reporter = new Reporter(config.url);
  const bundle = await launchBrowser(!opts.headed);

  try {
    await navigateTo(bundle.page, config.url);

    // Execute each test in sequence
    for (const test of testsToRun) {
      await runTest(test, { page: bundle.page, config, reporter });

      // Navigate back to the start URL between tests to ensure a clean state
      if (test !== testsToRun[testsToRun.length - 1]) {
        logger.step("Resetting page to base URL for next test…");
        await navigateTo(bundle.page, config.url);
      }
    }
  } finally {
    await closeBrowser(bundle);
  }

  // ── Output results ──────────────────────────────────────────
  reporter.printSummary();

  const reportPath = reporter.save(config.resultsDir);
  logger.success(`Full JSON report saved → ${reportPath}`);

  const logPath = `${config.resultsDir}/logs-${Date.now()}.json`;
  logger.saveHistory(logPath);

  // Exit with non-zero code if any test failed
  const report = reporter.buildReport();
  const failed = report.summary.failed + report.summary.error;
  if (failed > 0) {
    logger.error(`${failed} test(s) did not pass.`);
    process.exit(1);
  } else {
    logger.success("All tests passed! 🎉");
    process.exit(0);
  }
}

main().catch((err) => {
  logger.error(`Unexpected error: ${err instanceof Error ? err.message : String(err)}`);
  console.error(err);
  process.exit(1);
});
