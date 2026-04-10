// ============================================================
//  utils/validator.ts  — Output validation helpers
// ============================================================

import { logger } from "./logger.js";

// ── Types ────────────────────────────────────────────────────
export interface ValidationResult {
  passed: boolean;
  message: string;
  details?: string;
}

// ── Validators ───────────────────────────────────────────────

/**
 * Checks that `text` is non-empty after trimming whitespace.
 */
export function validateNotEmpty(text: string | null | undefined): ValidationResult {
  if (!text || text.trim().length === 0) {
    return {
      passed: false,
      message: "Output is empty — expected non-empty response.",
      details: `Received: ${JSON.stringify(text)}`,
    };
  }
  return {
    passed: true,
    message: `Output is non-empty (${text.trim().length} chars).`,
    details: `Preview: "${text.trim().slice(0, 120)}…"`,
  };
}

/**
 * Checks that `text` contains at least one of the provided substrings.
 */
export function validateContains(
  text: string | null | undefined,
  substrings: string[],
  caseSensitive = false,
): ValidationResult {
  const haystack = caseSensitive ? (text ?? "") : (text ?? "").toLowerCase();
  const needles  = caseSensitive ? substrings : substrings.map((s) => s.toLowerCase());

  const found = needles.find((n) => haystack.includes(n));
  if (!found) {
    return {
      passed: false,
      message: `None of the expected strings were found in the output.`,
      details: `Expected one of: ${JSON.stringify(substrings)}`,
    };
  }
  return {
    passed: true,
    message: `Output contains expected string: "${found}".`,
  };
}

/**
 * Checks that `text` does NOT contain any of the provided substrings.
 */
export function validateNotContains(
  text: string | null | undefined,
  substrings: string[],
  caseSensitive = false,
): ValidationResult {
  const haystack = caseSensitive ? (text ?? "") : (text ?? "").toLowerCase();
  const needles  = caseSensitive ? substrings : substrings.map((s) => s.toLowerCase());

  const found = needles.find((n) => haystack.includes(n));
  if (found) {
    return {
      passed: false,
      message: `Forbidden string found in output: "${found}".`,
      details: `Checked against: ${JSON.stringify(substrings)}`,
    };
  }
  return {
    passed: true,
    message: `None of the forbidden strings were found in the output.`,
  };
}

/**
 * Checks that `text` is at least `minLength` characters long (after trim).
 */
export function validateMinLength(
  text: string | null | undefined,
  minLength: number,
): ValidationResult {
  const trimmed = (text ?? "").trim();
  if (trimmed.length < minLength) {
    return {
      passed: false,
      message: `Output too short — expected ≥ ${minLength} chars, got ${trimmed.length}.`,
    };
  }
  return {
    passed: true,
    message: `Output length OK (${trimmed.length} chars ≥ ${minLength}).`,
  };
}

// ── Runner ───────────────────────────────────────────────────

/**
 * Run a list of validators in sequence and log each result.
 * Returns `true` only when ALL validators pass.
 */
export function runValidations(
  results: ValidationResult[],
  context: string,
): boolean {
  let allPassed = true;

  for (const result of results) {
    if (result.passed) {
      logger.success(`[${context}] ${result.message}`);
      if (result.details) logger.debug(`  └─ ${result.details}`);
    } else {
      logger.error(`[${context}] ${result.message}`);
      if (result.details) logger.debug(`  └─ ${result.details}`);
      allPassed = false;
    }
  }

  return allPassed;
}
