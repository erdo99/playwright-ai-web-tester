// ============================================================
//  utils/browser.ts  — Playwright browser / page helpers
// ============================================================

import { Browser, BrowserContext, Page, chromium } from "playwright";
import fs from "fs";
import path from "path";
import { setTimeout as sleepMs } from "node:timers/promises";
import { logger } from "./logger.js";
import { AppConfig } from "../config/index.js";

// ── Browser lifecycle ────────────────────────────────────────

export interface BrowserBundle {
  browser: Browser;
  context: BrowserContext;
  page: Page;
}

/**
 * Launch a headless Chromium browser and return the bundle.
 * Pass `{ headless: false }` during local debugging.
 */
export async function launchBrowser(headless = true): Promise<BrowserBundle> {
  logger.step("Launching browser (Chromium, headless=" + headless + ")…");

  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    // Accept all cookies / permissions so pop-ups don't block selectors
    permissions: [],
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();

  logger.success("Browser launched.");
  return { browser, context, page };
}

/** Optional steps after `goto` — cookies, dialogs, site-specific clicks, settle time. */
export interface NavigatePrepareOptions {
  extraDismissSelectors?: string;
  settleAfterNavigateMs?: number;
}

/**
 * Navigate to `url`. Uses **`domcontentloaded`** (not `load`): the `load` event
 * waits for all subresources; ads/analytics can delay or stall it and cause
 * flaky 60s timeouts. `networkidle` is avoided — many SPAs never go idle.
 */
export async function navigateTo(
  page: Page,
  url: string,
  prepare?: NavigatePrepareOptions,
): Promise<void> {
  logger.step(`Navigating to: ${url}`);
  const maxAttempts = 2;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90_000 });
      break;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const retryable =
        /ERR_TIMED_OUT|ERR_CONNECTION|ETIMEDOUT|Timeout|timed out/i.test(msg);
      if (attempt < maxAttempts && retryable) {
        logger.warn(`Navigation failed (attempt ${attempt}/${maxAttempts}): ${msg.slice(0, 160)}…`);
        await sleepMs(2_500);
        continue;
      }
      throw err;
    }
  }

  await preparePageAfterLoad(page, prepare);
  logger.success(`Page loaded: ${await page.title()}`);
}

async function preparePageAfterLoad(
  page: Page,
  prepare?: NavigatePrepareOptions,
): Promise<void> {
  await dismissCommonCookieBanners(page);
  await dismissBlockingDialogs(page);
  await page.keyboard.press("Escape");
  await sleepMs(200);
  await page.keyboard.press("Escape");
  await sleepMs(200);
  await dismissBlockingDialogs(page);
  await attemptHumanVerificationAffordances(page);

  if (prepare?.extraDismissSelectors) {
    const sels = prepare.extraDismissSelectors
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const sel of sels) {
      try {
        const loc = page.locator(sel).first();
        if (await loc.isVisible({ timeout: 1_200 }).catch(() => false)) {
          await loc.click({ timeout: 2_500 });
          logger.debug(`Extra dismiss click: ${sel}`);
          await sleepMs(350);
        }
      } catch {
        /* ignore */
      }
    }
  }

  const settle = prepare?.settleAfterNavigateMs ?? 0;
  if (settle > 0) {
    logger.debug(`Settling UI (${settle}ms)…`);
    await sleepMs(settle);
  }
}

/**
 * Best-effort interaction with lightweight “human verification” UI.
 * May click reCAPTCHA/hCaptcha/Turnstile **checkbox iframes** or obvious **Verify** buttons.
 * Does **not** solve image/audio challenges; headless browsers often still fail token checks.
 */
async function attemptHumanVerificationAffordances(page: Page): Promise<void> {
  const buttonRes = [
    /verify you are human/i,
    /^verify$/i,
    /^continue$/i,
    /human verification/i,
  ];
  for (const re of buttonRes) {
    try {
      const btn = page.getByRole("button", { name: re });
      if (await btn.first().isVisible({ timeout: 500 }).catch(() => false)) {
        await btn.first().click({ timeout: 2_500 });
        logger.warn(`Human-gate: clicked main-document button (${re})`);
        await sleepMs(2_000);
        return;
      }
    } catch {
      /* ignore */
    }
  }

  try {
    const frame = page
      .frameLocator('iframe[src*="recaptcha/anchor"], iframe[title*="reCAPTCHA" i]')
      .first();
    const anchor = frame.locator("#recaptcha-anchor, .recaptcha-checkbox-border");
    if (await anchor.first().isVisible({ timeout: 1_200 }).catch(() => false)) {
      await anchor.first().click({ timeout: 3_000 });
      logger.warn(
        "Human-gate: clicked reCAPTCHA anchor — token / headless checks may still block.",
      );
      await sleepMs(3_000);
    }
  } catch {
    /* ignore */
  }

  try {
    const frame = page.frameLocator('iframe[src*="hcaptcha.com"]').first();
    const box = frame.locator("#checkbox, [role='checkbox']").first();
    if (await box.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await box.click({ timeout: 3_000 });
      logger.warn("Human-gate: clicked hCaptcha control — challenge may still appear.");
      await sleepMs(2_000);
    }
  } catch {
    /* ignore */
  }

  try {
    const frame = page
      .frameLocator(
        'iframe[src*="challenges.cloudflare.com"], iframe[src*="turnstile"], iframe[src*="cloudflare" i]',
      )
      .first();
    const mark = frame.locator(
      "input[type='checkbox'], [role='checkbox'], label, .ctp-checkbox-label",
    ).first();
    if (await mark.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await mark.click({ timeout: 2_500 });
      logger.warn("Human-gate: clicked Cloudflare / Turnstile control.");
      await sleepMs(2_000);
    }
  } catch {
    /* ignore */
  }
}

/** Try to close Radix/modal dialogs that intercept pointer events. */
async function dismissBlockingDialogs(page: Page): Promise<void> {
  const buttonPatterns = [
    /^Continue$/i,
    /^Next$/i,
    /^Accept( all)?$/i,
    /^OK$/i,
    /^Got it$/i,
    /^I agree$/i,
    /^Allow( all)?$/i,
    /^Close$/i,
    /^Dismiss$/i,
    /^Kabul/i,
    /^Devam/i,
    /^Compris/i,
    /^J'accepte/i,
  ];

  for (let round = 0; round < 4; round++) {
    const dialog = page.locator('[role="dialog"]:visible').first();
    if (!(await dialog.isVisible({ timeout: 600 }).catch(() => false))) {
      break;
    }

    let clicked = false;
    for (const pattern of buttonPatterns) {
      try {
        const btn = dialog.getByRole("button", { name: pattern });
        if (await btn.first().isVisible({ timeout: 500 }).catch(() => false)) {
          await btn.first().click({ timeout: 2_500 });
          logger.debug(`Closed dialog via button matching ${pattern}`);
          clicked = true;
          await sleepMs(400);
          break;
        }
      } catch {
        /* try next pattern */
      }
    }

    if (!clicked) {
      try {
        const anyBtn = dialog.getByRole("button").first();
        if (await anyBtn.isVisible({ timeout: 400 }).catch(() => false)) {
          await anyBtn.click({ timeout: 2_000 });
          logger.debug("Closed dialog via first button in dialog");
          await sleepMs(400);
        } else {
          break;
        }
      } catch {
        break;
      }
    }
  }
}

/** Best-effort; does not throw — many sites block automation until consent. */
async function dismissCommonCookieBanners(page: Page): Promise<void> {
  const buttonNamePatterns: RegExp[] = [
    /^Accept( all)?$/i,
    /^I agree$/i,
    /^Agree$/i,
    /^Allow all$/i,
    /^Got it$/i,
    /Tüm Çerezleri Kabul Et/i,
    /Tümünü kabul et/i,
    /^Kabul et$/i,
    /Alle akzeptieren/i,
    /^OK$/i,
  ];

  for (const pattern of buttonNamePatterns) {
    try {
      const btn = page.getByRole("button", { name: pattern });
      if (await btn.first().isVisible({ timeout: 800 }).catch(() => false)) {
        await btn.first().click({ timeout: 2_000 });
        logger.debug(`Dismissed cookie/consent (matched ${pattern})`);
        await sleepMs(400);
        return;
      }
    } catch {
      /* ignore */
    }
  }
}

// ── Interaction helpers ──────────────────────────────────────

/**
 * Find the first visible element matching one of the provided selectors.
 * Tries each selector in turn; throws if none is found within the timeout.
 */
export async function findElement(
  page: Page,
  selectors: string,
  timeoutMs = 10_000,
): Promise<ReturnType<Page["locator"]>> {
  // selectors can be a comma-separated list — split and try each
  const candidates = selectors.split(",").map((s) => s.trim());

  for (const sel of candidates) {
    try {
      const locator = page.locator(sel).first();
      await locator.waitFor({ state: "visible", timeout: timeoutMs / candidates.length });
      logger.debug(`Element found with selector: "${sel}"`);
      return locator;
    } catch {
      // not found with this selector — try next
    }
  }
  throw new Error(`No visible element found for selectors: "${selectors}"`);
}

/**
 * Clear the input, then type `text` character-by-character.
 * If `text` is empty the field is cleared and left empty.
 */
export async function fillInput(
  page: Page,
  selector: string,
  text: string,
): Promise<void> {
  const el = await findElement(page, selector);
  try {
    await el.click({ timeout: 10_000 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(`Click on input failed (${msg.slice(0, 120)}…) — trying force / focus…`);
    try {
      await el.click({ force: true, timeout: 5_000 });
    } catch {
      await el.focus();
    }
  }
  await el.fill("");          // clear any existing content
  if (text.length > 0) {
    await el.fill(text);      // bulk-fill (faster than typewrite)
  }
  logger.debug(`Input filled with ${text.length} chars.`);
}

/** Click the first visible element matching `selector`. */
export async function clickElement(
  page: Page,
  selector: string,
): Promise<void> {
  const el = await findElement(page, selector);
  await el.click();
  logger.debug(`Clicked element: "${selector}"`);
}

/**
 * Tries visible submit controls (comma-separated CSS), then **Enter** on the input.
 * Many chat UIs (e.g. Perplexity) use an icon button or only keyboard submit.
 */
export async function submitPrompt(
  page: Page,
  submitSelector: string,
  inputSelector: string,
): Promise<void> {
  logger.step("Submitting (button or Enter)…");
  const candidates = submitSelector.split(",").map((s) => s.trim());
  const quickMs = 2_500;

  for (const sel of candidates) {
    try {
      const locator = page.locator(sel).first();
      await locator.waitFor({ state: "visible", timeout: quickMs });
      await locator.click();
      logger.debug(`Clicked submit: "${sel}"`);
      return;
    } catch {
      // try next candidate
    }
  }

  logger.warn("No submit button matched — keyboard submit (Enter, then Ctrl+Enter)…");
  const input = await findElement(page, inputSelector);
  await input.focus();
  await input.press("Enter");
  await sleepMs(250);
  await input.press("Control+Enter");
  logger.debug("Keyboard submit sequence sent (Enter + Ctrl+Enter).");
}

function splitSelectorList(selectors: string): string[] {
  return selectors
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Wait up to `timeoutMs` until **any** comma-separated selector has enough text,
 * then return the longest matching text (avoids only checking the first pattern).
 */
export async function waitForOutput(
  page: Page,
  selector: string,
  timeoutMs: number,
): Promise<string> {
  logger.step(`Waiting up to ${timeoutMs / 1000}s for output…`);

  const candidates = splitSelectorList(selector);
  if (candidates.length === 0) {
    throw new Error("waitForOutput: no output selectors configured.");
  }

  const minLen = 5;

  await page.waitForFunction(
    ({ selectors: sels, minText }: { selectors: string[]; minText: number }) => {
      for (const sel of sels) {
        try {
          const el = document.querySelector(sel);
          if (el && (el.textContent ?? "").trim().length > minText) return true;
        } catch {
          /* invalid selector */
        }
      }
      return false;
    },
    { selectors: candidates, minText: minLen },
    { timeout: timeoutMs, polling: 500 },
  );

  let bestText = "";
  let bestLen = 0;
  for (const sel of candidates) {
    try {
      const loc = page.locator(sel).first();
      if (!(await loc.isVisible().catch(() => false))) continue;
      const t = ((await loc.textContent()) ?? "").trim();
      if (t.length > bestLen) {
        bestLen = t.length;
        bestText = t;
      }
    } catch {
      continue;
    }
  }

  if (bestText.length < minLen) {
    throw new Error(
      `Output appeared in wait but text could not be read from selectors: "${selector}"`,
    );
  }

  logger.debug(`Output received (${bestText.length} chars).`);
  return bestText;
}

// ── Screenshot helper ────────────────────────────────────────

/**
 * Capture a screenshot and save it in `screenshotsDir`.
 * Returns the saved file path.
 */
export async function captureScreenshot(
  page: Page,
  label: string,
  screenshotsDir: string,
): Promise<string> {
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  const safeName = label.replace(/[^a-z0-9]/gi, "_").toLowerCase();
  const filePath = path.resolve(screenshotsDir, `${safeName}-${Date.now()}.png`);

  await page.screenshot({ path: filePath, fullPage: true });
  logger.warn(`Screenshot saved → ${filePath}`);
  return filePath;
}

/** Gracefully close browser + context. */
export async function closeBrowser(bundle: BrowserBundle): Promise<void> {
  logger.step("Closing browser…");
  await bundle.context.close();
  await bundle.browser.close();
  logger.success("Browser closed.");
}
