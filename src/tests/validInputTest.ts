// ============================================================
//  tests/validInputTest.ts  — Happy-path test with valid input
// ============================================================

import { TestDefinition, TestContext } from "./baseTest.js";
import { fillInput, submitPrompt, waitForOutput } from "../utils/browser.js";
import { validateNotEmpty, validateMinLength, runValidations } from "../utils/validator.js";
import { logger } from "../utils/logger.js";

export const validInputTest: TestDefinition = {
  name: "Valid Input Test",
  description:
    "Submits a well-formed question and validates that the app returns a non-empty response.",

  async run({ page, config }: TestContext): Promise<void> {
    const { selectors, testInputs, outputTimeoutMs } = config;
    const input = testInputs.valid.value;

    // ── Step 1: Fill the input ────────────────────────────────
    logger.step("Filling input field with valid prompt…");
    await fillInput(page, selectors.inputBox, input);

    // ── Step 2: Submit ────────────────────────────────────────
    await submitPrompt(page, selectors.submitButton, selectors.inputBox);

    // ── Step 3: Wait for output ───────────────────────────────
    const outputText = await waitForOutput(
      page,
      selectors.outputArea,
      outputTimeoutMs,
    );

    // ── Step 4: Validate ──────────────────────────────────────
    logger.step("Validating output…");
    const allPassed = runValidations(
      [
        validateNotEmpty(outputText),
        validateMinLength(outputText, 20),
      ],
      "validInputTest",
    );

    if (!allPassed) {
      throw new Error("Validation failed for valid input test.");
    }

    logger.success(`Valid input test passed. Output: "${outputText.trim().slice(0, 100)}…"`);
  },
};
