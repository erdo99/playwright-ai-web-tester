// ============================================================
//  tests/specialCharsTest.ts  — Emoji, symbols & Unicode test
// ============================================================

import { TestDefinition, TestContext } from "./baseTest.js";
import { fillInput, submitPrompt, waitForOutput } from "../utils/browser.js";
import {
  validateNotEmpty,
  validateNotContains,
  runValidations,
} from "../utils/validator.js";
import { logger } from "../utils/logger.js";

export const specialCharsTest: TestDefinition = {
  name: "Special Characters Test",
  description:
    "Submits a prompt containing emoji 🤖🎉, HTML injection attempts, " +
    "special symbols, and multi-language Unicode (Chinese, Arabic, Japanese). " +
    "Verifies the output is safe and non-empty.",

  async run({ page, config }: TestContext): Promise<void> {
    const { selectors, testInputs, outputTimeoutMs } = config;
    const input = testInputs.specialChars.value;

    logger.info(`Prompt: "${input.slice(0, 100)}…"`);

    // ── Step 1: Fill ──────────────────────────────────────────
    logger.step("Filling input with special characters…");
    await fillInput(page, selectors.inputBox, input);

    // ── Step 2: Submit ────────────────────────────────────────
    await submitPrompt(page, selectors.submitButton, selectors.inputBox);

    // ── Step 3: Wait for output ───────────────────────────────
    const outputText = await waitForOutput(page, selectors.outputArea, outputTimeoutMs);

    // ── Step 4: Validate ──────────────────────────────────────
    logger.step("Validating output for safety and content…");

    // The output must be non-empty — the AI should still respond.
    // The output must NOT contain raw un-escaped HTML tags that indicate XSS.
    const allPassed = runValidations(
      [
        validateNotEmpty(outputText),
        // Basic XSS safety check: the <script> tag injected in input
        // should NEVER appear literally in the rendered output text
        validateNotContains(outputText, ["<script>alert"], false),
      ],
      "specialCharsTest",
    );

    if (!allPassed) {
      throw new Error("Validation failed for special characters test.");
    }

    logger.success(
      `Special characters test passed. Output length: ${outputText.trim().length} chars.`,
    );
  },
};
