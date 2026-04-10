#!/usr/bin/env node
// ============================================================
//  index.ts  — AI Web App Tester  |  Main entry point
// ============================================================

import { Command } from "commander";
import chalk from "chalk";
import { config as defaultConfig, AppConfig } from "./config/index.js";
import {
  TARGET_PRESETS,
  applyPreset,
  getPreset,
  listPresetIds,
  type TargetPreset,
} from "./config/targets.js";
import {
  launchBrowser,
  navigateTo,
  closeBrowser,
  type NavigatePrepareOptions,
} from "./utils/browser.js";
import { logger } from "./utils/logger.js";
import { Reporter } from "./utils/reporter.js";
import { runTest, type TestDefinition } from "./tests/baseTest.js";
import { validInputTest } from "./tests/validInputTest.js";
import { emptyInputTest } from "./tests/emptyInputTest.js";
import { longInputTest } from "./tests/longInputTest.js";
import { specialCharsTest } from "./tests/specialCharsTest.js";

const DEFAULT_CASES = "valid,empty,long,special";

/** When npm swallows flags, user may run: node dist/index.js https://… valid */
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
      if (a === "--apps") {
        i++;
        continue;
      }
      if (a.startsWith("--apps=")) continue;
      if (a === "--headed" || a === "--all-apps" || a === "--list-apps") continue;
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

const program = new Command();

program
  .name("ai-tester")
  .description("AI Web App Tester — automated QA for prompt-based AI tools")
  .version("1.1.0")
  .option("-u, --target <url>", "Override the target URL from config")
  .option("--url <url>", "Alias for --target")
  .option("--headed", "Run browser in headed (visible) mode", false)
  .option(
    "-t, --cases <names>",
    `Comma-separated tests: valid, empty, long, special (default: ${DEFAULT_CASES})`,
  )
  .option("--tests <names>", "Alias for --cases")
  .option("--retries <n>", "Max attempts per test (includes first try)", String(defaultConfig.maxRetries))
  .option(
    "--apps <ids>",
    "Comma-separated preset site ids (perplexity, chatgpt, mistral, …); use --list-apps",
  )
  .option("--all-apps", "Run every preset in the registry (one after another)", false)
  .option("--list-apps", "Print preset ids, URLs, notes, and exit", false)
  .parse(process.argv);

const opts = program.opts<{
  target?: string;
  url?: string;
  headed: boolean;
  cases?: string;
  tests?: string;
  retries: string;
  apps?: string;
  allApps: boolean;
  listApps: boolean;
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

const maxRetries = parseInt(opts.retries, 10) || defaultConfig.maxRetries;

const baseConfig: AppConfig = {
  ...defaultConfig,
  url: resolvedUrl,
  maxRetries,
};

const ALL_TESTS = {
  valid: validInputTest,
  empty: emptyInputTest,
  long: longInputTest,
  special: specialCharsTest,
} as const;

function navigatePrepare(cfg: AppConfig): NavigatePrepareOptions {
  return {
    extraDismissSelectors: cfg.extraDismissSelectors,
    settleAfterNavigateMs: cfg.settleAfterNavigateMs,
  };
}

function resolvePresetList(): TargetPreset[] | null {
  if (opts.allApps) {
    return Object.values(TARGET_PRESETS);
  }
  const fromCli = opts.apps
    ?.split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const fromEnv = process.env.AI_WEB_TESTER_APPS?.split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const ids = fromCli?.length ? fromCli : fromEnv;
  if (!ids?.length) return null;

  const out: TargetPreset[] = [];
  for (const id of ids) {
    const p = getPreset(id);
    if (p) out.push(p);
    else logger.warn(`Unknown preset "${id}" — skipped. Use --list-apps.`);
  }
  return out.length ? out : null;
}

function printBannerSingle(cfg: AppConfig, cases: string): void {
  console.log();
  console.log(chalk.bold.cyan("╔══════════════════════════════════════════════════╗"));
  console.log(
    chalk.bold.cyan("║") + chalk.bold.white("        🤖  AI Web App Tester  v1.1.0           ") + chalk.bold.cyan("║"),
  );
  console.log(chalk.bold.cyan("╚══════════════════════════════════════════════════╝"));
  console.log(chalk.gray(`  Mode   : single URL`));
  console.log(chalk.gray(`  Target : ${cfg.url}`));
  console.log(chalk.gray(`  Headed : ${opts.headed}`));
  console.log(chalk.gray(`  Retries: ${cfg.maxRetries}`));
  console.log(chalk.gray(`  Tests  : ${cases}`));
  console.log();
}

function printBannerMulti(presets: TargetPreset[], cases: string): void {
  console.log();
  console.log(chalk.bold.cyan("╔══════════════════════════════════════════════════╗"));
  console.log(
    chalk.bold.cyan("║") + chalk.bold.white("        🤖  AI Web App Tester  v1.1.0           ") + chalk.bold.cyan("║"),
  );
  console.log(chalk.bold.cyan("╚══════════════════════════════════════════════════╝"));
  console.log(chalk.gray(`  Mode   : multi-site (${presets.length} presets)`));
  console.log(chalk.gray(`  Sites  : ${presets.map((p) => p.id).join(", ")}`));
  console.log(chalk.gray(`  Headed : ${opts.headed}`));
  console.log(chalk.gray(`  Retries: ${baseConfig.maxRetries}`));
  console.log(chalk.gray(`  Tests  : ${cases}`));
  console.log();
}

async function executeTestsForConfig(
  cfg: AppConfig,
  headed: boolean,
  testsToRun: TestDefinition[],
): Promise<Reporter> {
  const reporter = new Reporter(cfg.url);
  const bundle = await launchBrowser(!headed);
  try {
    await navigateTo(bundle.page, cfg.url, navigatePrepare(cfg));
    for (let i = 0; i < testsToRun.length; i++) {
      const test = testsToRun[i];
      await runTest(test, { page: bundle.page, config: cfg, reporter });
      if (i < testsToRun.length - 1) {
        logger.step("Resetting page to base URL for next test…");
        await navigateTo(bundle.page, cfg.url, navigatePrepare(cfg));
      }
    }
  } finally {
    await closeBrowser(bundle);
  }
  return reporter;
}

async function main(): Promise<void> {
  if (opts.listApps) {
    logger.section("AVAILABLE SITE PRESETS (--apps / --all-apps)");
    for (const id of listPresetIds()) {
      const p = getPreset(id)!;
      console.log(`  ${chalk.cyan(p.id.padEnd(12))} ${chalk.bold(p.label)}`);
      console.log(chalk.gray(`             ${p.url}`));
      if (p.notes) console.log(chalk.gray(`             ${p.notes}`));
      console.log();
    }
    process.exit(0);
  }

  const requestedKeys = resolvedCases
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t in ALL_TESTS) as Array<keyof typeof ALL_TESTS>;

  if (requestedKeys.length === 0) {
    logger.error("No valid test names. Available: valid, empty, long, special");
    process.exit(1);
  }

  const testsToRun = requestedKeys.map((k) => ALL_TESTS[k]);
  const presets = resolvePresetList();

  if (presets && presets.length > 0) {
    printBannerMulti(presets, resolvedCases);
    logger.info(`Running ${testsToRun.length} test(s) per site: ${requestedKeys.join(", ")}`);

    let totalFailed = 0;
    for (const preset of presets) {
      const cfg = applyPreset(baseConfig, preset);
      logger.section(`${preset.label} — ${cfg.url}`);
      try {
        const reporter = await executeTestsForConfig(cfg, opts.headed, testsToRun);
        reporter.printSummary();
        const reportPath = reporter.save(cfg.resultsDir, preset.id);
        logger.success(`JSON report → ${reportPath}`);
        const rep = reporter.buildReport();
        totalFailed += rep.summary.failed + rep.summary.error;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error(`${preset.label}: run aborted — ${msg}`);
        totalFailed += 1;
      }
    }

    const logPath = `${baseConfig.resultsDir}/logs-${Date.now()}.json`;
    logger.saveHistory(logPath);
    logger.section("MULTI-SITE SUMMARY");
    console.log(
      chalk.gray(
        `  Finished ${presets.length} site(s). Failed/error tests (all sites): ${totalFailed}`,
      ),
    );
    console.log();

    if (totalFailed > 0) {
      logger.error("One or more site runs had failures.");
      process.exit(1);
    }
    logger.success("All sites passed for the selected tests.");
    process.exit(0);
  }

  // ── Single URL mode ───────────────────────────────────────
  printBannerSingle(baseConfig, resolvedCases);
  logger.info(`Running ${testsToRun.length} test(s): ${requestedKeys.join(", ")}`);

  const reporter = await executeTestsForConfig(baseConfig, opts.headed, testsToRun);

  reporter.printSummary();
  const reportPath = reporter.save(baseConfig.resultsDir);
  logger.success(`Full JSON report saved → ${reportPath}`);

  const logPath = `${baseConfig.resultsDir}/logs-${Date.now()}.json`;
  logger.saveHistory(logPath);

  const report = reporter.buildReport();
  const failed = report.summary.failed + report.summary.error;
  if (failed > 0) {
    logger.error(`${failed} test(s) did not pass.`);
    process.exit(1);
  }
  logger.success("All tests passed!");
  process.exit(0);
}

main().catch((err) => {
  logger.error(`Unexpected error: ${err instanceof Error ? err.message : String(err)}`);
  console.error(err);
  process.exit(1);
});
