// ============================================================
//  tests/longInputTest.ts  — Stress test with a very long prompt
// ============================================================

import { TestDefinition, TestContext } from "./baseTest.js";
import { fillInput, submitPrompt, waitForOutput } from "../utils/browser.js";
import { validateNotEmpty, runValidations } from "../utils/validator.js";
import { logger } from "../utils/logger.js";

export const longInputTest: TestDefinition = {
  name: "Long Input Stress Test",
  description:
    "Submits an extra-long prompt (~800 chars) to stress-test input handling and " +
    "verify the app still returns a meaningful response within the timeout.",

  async run({ page, config }: TestContext): Promise<void> {
    const { selectors, testInputs, outputTimeoutMs } = config;
    const input = testInputs.longStress.value;

    logger.info(`Prompt length: ${input.length} characters.`);

    // ── Step 1: Fill ──────────────────────────────────────────
    logger.step("Filling input with long prompt…");
    await fillInput(page, selectors.inputBox, input);

    // Verify the full text was accepted
    const actualValue = await page
      .locator(selectors.inputBox.split(",")[0].trim())
      .first()
      .inputValue()
      .catch(() => "");

    if (actualValue.length < input.length * 0.9) {
      logger.warn(
        `Input may have been truncated: expected ${input.length} chars, got ${actualValue.length}.`,
      );
    } else {
      logger.debug(`Input verified (${actualValue.length} chars accepted).`);
    }

    // ── Step 2: Submit ────────────────────────────────────────
    await submitPrompt(page, selectors.submitButton, selectors.inputBox);

    // ── Step 3: Wait (longer timeout for heavy AI inference) ──
    const extendedTimeout = Math.max(outputTimeoutMs, 60_000);
    logger.info(`Waiting up to ${extendedTimeout / 1000}s for response (extended for long input)…`);
    const outputText = await waitForOutput(page, selectors.outputArea, extendedTimeout);

    // ── Step 4: Validate ──────────────────────────────────────
    logger.step("Validating output…");
    const allPassed = runValidations(
      [validateNotEmpty(outputText)],
      "longInputTest",
    );

    if (!allPassed) {
      throw new Error("Validation failed for long input stress test.");
    }

    logger.success(`Long input test passed. Output length: ${outputText.trim().length} chars.`);
  },
};
