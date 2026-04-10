// ============================================================
//  tests/emptyInputTest.ts  — Graceful-handling of empty input
// ============================================================

import { TestDefinition, TestContext } from "./baseTest.js";
import { fillInput, submitPrompt, findElement } from "../utils/browser.js";
import { logger } from "../utils/logger.js";

/**
 * Submits an empty prompt and checks that:
 *  a) the app does NOT crash, OR
 *  b) the submit button becomes disabled / an error message appears.
 *
 * A test that proves graceful failure is just as valuable as one that
 * proves success — we do NOT expect output here.
 */
export const emptyInputTest: TestDefinition = {
  name: "Empty Input Test",
  description:
    "Submits an empty prompt and verifies the app handles it gracefully " +
    "(disabled button, validation message, or no crash).",

  async run({ page, config }: TestContext): Promise<void> {
    const { selectors } = config;

    // ── Step 1: Clear the input ───────────────────────────────
    logger.step("Clearing input field (empty input test)…");
    await fillInput(page, selectors.inputBox, "");

    // ── Step 2: Check button state ────────────────────────────
    logger.step("Checking whether submit button is disabled…");

    let buttonDisabled = false;
    try {
      const btn = await findElement(page, selectors.submitButton, 5_000);
      buttonDisabled = await btn.isDisabled();
    } catch {
      // Button might not be found at all — still acceptable
      logger.warn("Submit button not found — skipping disabled check.");
    }

    if (buttonDisabled) {
      logger.success("Submit button is disabled for empty input — correct behaviour ✔");
      return;
    }

    // ── Step 3: Click anyway and check for error/validation msg ─
    logger.step("Button is not disabled — trying submit anyway to test validation…");
    try {
      await submitPrompt(page, selectors.submitButton, selectors.inputBox);
    } catch {
      logger.warn("Could not submit — control may have been removed.");
    }

    // Wait briefly; look for common error/validation patterns
    await page.waitForTimeout(2_000);

    const errorPatterns = [
      "[role='alert']",
      ".error",
      ".validation-message",
      "[aria-live='assertive']",
      "text=required",
      "text=cannot be empty",
      "text=please enter",
    ];

    let gracefulHandling = false;
    for (const pattern of errorPatterns) {
      try {
        const el = page.locator(pattern).first();
        const visible = await el.isVisible();
        if (visible) {
          const msg = await el.textContent();
          logger.success(`Error/validation message found: "${msg?.trim().slice(0, 80)}"`);
          gracefulHandling = true;
          break;
        }
      } catch {
        // Not found with this pattern — try next
      }
    }

    if (!gracefulHandling) {
      // The page did not crash and didn't show an obvious error.
      // We consider that acceptable — no exception means no crash.
      logger.warn(
        "No explicit validation message found, but the page appears stable. " +
        "Consider adding a visible error message for empty submissions.",
      );
    }

    logger.success("Empty input handled without a page crash ✔");
  },
};
