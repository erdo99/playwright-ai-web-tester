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

/**
 * Navigate to `url`. Uses `load` (not `networkidle`) — modern SPAs and chat
 * sites keep long-lived connections open, so `networkidle` often never fires.
 */
export async function navigateTo(page: Page, url: string): Promise<void> {
  logger.step(`Navigating to: ${url}`);
  await page.goto(url, { waitUntil: "load", timeout: 60_000 });
  await dismissCommonCookieBanners(page);
  logger.success(`Page loaded: ${await page.title()}`);
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
  await el.click();
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
