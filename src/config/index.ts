// ============================================================
//  config/index.ts  — Central configuration for AI Web Tester
// ============================================================

export interface Selectors {
  /** CSS selector for the prompt / input textarea */
  inputBox: string;
  /** CSS selector for the submit / generate button */
  submitButton: string;
  /** CSS selector for the output / response area */
  outputArea: string;
}

export interface TestInput {
  name: string;
  value: string;
  description: string;
}

export interface AppConfig {
  /** Target URL to test */
  url: string;
  /** Page selectors (customise to match your target app) */
  selectors: Selectors;
  /** Inputs used by each test scenario */
  testInputs: {
    valid: TestInput;
    empty: TestInput;
    longStress: TestInput;
    specialChars: TestInput;
  };
  /** How long (ms) to wait for output after clicking submit */
  outputTimeoutMs: number;
  /** Maximum retry attempts for a flaky test */
  maxRetries: number;
  /** Delay (ms) between retries */
  retryDelayMs: number;
  /** Directory where screenshots are saved */
  screenshotsDir: string;
  /** Directory where JSON results are saved */
  resultsDir: string;

  /**
   * Comma-separated CSS — extra clicks after load (site-specific banners, “Continue”, etc.).
   * Presets in `targets.ts` can set these per site as you discover needs.
   */
  extraDismissSelectors?: string;
  /**
   * Extra wait (ms) after navigation + dismiss steps — helps slow SPAs (e.g. chat shell hydration).
   */
  settleAfterNavigateMs?: number;
}

// ─────────────────────────────────────────────
//  Default configuration  (edit to match your app)
// ─────────────────────────────────────────────
export const config: AppConfig = {
  // The web app you want to test.
  // Override with --url flag:  npm run test -- --url https://myapp.com
  url: "https://www.phind.com",

  selectors: {
    // These selectors are examples for a generic "prompt-box" AI app.
    // Change them to match the actual selectors of your target app.
    inputBox:
      "textarea, input[type='text'], [contenteditable='true'], div.ProseMirror, [role='textbox']",
    submitButton:
      "button[type='submit'], " +
      "button:has-text('Generate'), button:has-text('Send'), button:has-text('Ask'), " +
      "button[aria-label*='Ask' i], button[aria-label*='Search' i], button[aria-label*='Submit' i]",
    outputArea:
      "[data-testid*='answer' i], [data-testid*='response' i], " +
      "[class*='prose' i], [class*='markdown' i], " +
      "article, " +
      ".response, .output, .answer, [data-testid='response']",
  },

  testInputs: {
    valid: {
      name: "Valid Input",
      value: "What is the capital of France?",
      description: "A simple, well-formed question to verify basic functionality.",
    },
    empty: {
      name: "Empty Input",
      value: "",
      description: "Submit with no text — the app should handle this gracefully.",
    },
    longStress: {
      name: "Long Input (Stress Test)",
      value:
        "Explain the concept of artificial intelligence in extreme detail, covering its history from the 1950s Turing test to modern large language models, including machine learning, deep learning, neural networks, transformers, attention mechanisms, RLHF, Constitutional AI, and the societal implications of AGI. Please also compare the leading AI companies (OpenAI, Anthropic, Google DeepMind, Meta AI) and their flagship models as of 2024, while discussing the technical differences between GPT-4, Claude 3, Gemini Ultra, and Llama 3. Finally, provide a detailed roadmap of what AI might look like in 2030. This is a comprehensive stress test of maximum token input handling.",
      description: "Extremely long prompt to stress-test input handling and response generation.",
    },
    specialChars: {
      name: "Special Characters",
      value: "Hello! 🤖 Can you handle: <script>alert('xss')</script>, emoji 🎉🔥💡, & symbols © ™ ® — and Unicode: 你好, مرحبا, こんにちは?",
      description: "Tests emoji, HTML injection attempts, special symbols, and multi-language Unicode.",
    },
  },

  outputTimeoutMs: 60_000,  // slow models / cold start — increase if needed
  maxRetries: 3,
  retryDelayMs: 2_000,
  screenshotsDir: "./screenshots",
  resultsDir: "./results",
};
