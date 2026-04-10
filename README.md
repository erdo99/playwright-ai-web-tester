# AI Web App Tester

QA automation for **prompt-based AI web apps**, built with **TypeScript**, **Node.js**, and **Playwright** (Chromium).

---

## Features

| Feature | Details |
|---|---|
| Browser automation | Headless or headed Chromium via Playwright |
| Navigation | `page.goto` waits for **`load`** (not `networkidle`) — works better on SPAs |
| Submit | Tries comma-separated submit selectors, then **Enter** and **Ctrl+Enter** on the input |
| Output wait | Waits until **any** comma-separated `outputArea` selector has enough text (not only the first) |
| Cookie banners | Best-effort dismiss (English + Turkish common labels) after navigation |
| Retries | Configurable attempts per test with delay between tries |
| Failure screenshots | Saved when a test fails |
| JSON reports | Timestamped run summary under `results/` |
| CLI | `commander` with aliases and **positional URL / test names** when npm swallows flags |
| Multi-site | **`--apps`** / **`--all-apps`** — run the same tests against many preset AI chat URLs (one browser session per site) |

---

## Project structure

```
ai-web-tester/
├── src/
│   ├── index.ts              ← CLI entry (URL, cases, retries, headed, multi-site)
│   ├── config/index.ts       ← Default URL, selectors, timeouts, test inputs
│   ├── config/targets.ts     ← Preset sites (Perplexity, ChatGPT, Mistral, …)
│   ├── tests/                ← valid, empty, long, special + baseTest runner
│   └── utils/                ← browser, logger, validator, reporter, retry
├── screenshots/              ← Created on failure (gitignored)
├── results/                  ← JSON reports + logs (gitignored)
├── dist/                     ← `npm run build` output (gitignored)
├── package.json
└── tsconfig.json
```

---

## Installation

**Prerequisites:** Node.js 18+, npm 8+.

```bash
git clone <your-repo-url> ai-web-tester
cd ai-web-tester
npm install
npx playwright install chromium
npm run build
```

---

## Running tests

Build first if you changed TypeScript:

```bash
npm run build
```

### Recommended: call Node directly (avoids npm flag quirks)

On some npm versions, flags like `--url`, `--target`, or `--tests` are interpreted as **npm** config and are not passed to the script. The CLI therefore supports **positional** arguments: `https://…` and a comma-separated or single test name.

```bash
# All default tests from config URL
node dist/index.js

# Custom URL + only the "valid" scenario
node dist/index.js https://perplexity.ai valid

# Multiple scenarios
node dist/index.js https://example.com valid,empty,special
```

### Using npm scripts

```bash
# Build + run with config default URL
npm test

# Run compiled entry without rebuilding (you must build first)
npm run test:run -- https://perplexity.ai valid
```

### CLI flags (when forwarded correctly)

| Option | Short | Meaning |
|---|---|---|
| `--target <url>` | `-u` | Override base URL |
| `--url <url>` | — | Alias of `--target` (may be eaten by npm) |
| `--cases <names>` | `-t` | Tests: `valid`, `empty`, `long`, `special` (comma-separated) |
| `--tests <names>` | — | Alias of `--cases` |
| `--headed` | — | Visible browser |
| `--retries <n>` | — | Max **attempts** per test (includes the first try) |
| `--apps <ids>` | — | Comma-separated **preset** ids (see `--list-apps`) |
| `--all-apps` | — | Run **every** preset in `config/targets.ts` (long run) |
| `--list-apps` | — | Print preset ids, URLs, notes, exit |

```bash
node dist/index.js --target https://myapp.ai --cases valid --headed
node dist/index.js -u https://myapp.ai -t valid,long --retries 5
```

### Multi-site (several AI web UIs in one go)

Presets live in **`src/config/targets.ts`** (Perplexity, ChatGPT, Mistral, DeepSeek, Kimi, Claude, Gemini, Groq, Copilot, Meta AI, Phind, …). Each site gets a **fresh browser**, the selected tests, and its own JSON report: `results/report-<preset-id>-<runId>.json`.

```bash
npm run build

# List presets
node dist/index.js --list-apps

# Only a few (recommended: start with valid only)
node dist/index.js --apps perplexity,mistral,deepseek --cases valid

# Everything registered (can take a long time; many sites need login)
node dist/index.js --all-apps --cases valid
```

Shortcut after build:

```bash
npm run test:all-apps
```

Many commercial chat UIs require **sign-in**, block **headless** traffic, or use different DOMs — expect failures until you tune selectors or use a saved [Playwright storage state](https://playwright.dev/docs/auth) for logged-in sessions.

### Environment variables

If you prefer not to pass flags:

| Variable | Purpose |
|---|---|
| `AI_WEB_TESTER_URL` | Base URL (same as `--target`; single-site mode) |
| `AI_WEB_TESTER_TESTS` | Comma-separated test names (same as `--cases`) |
| `AI_WEB_TESTER_APPS` | Comma-separated preset ids (same as `--apps`) |

### Help

```bash
node dist/index.js --help
```

---

## Configuration

Edit **`src/config/index.ts`** for your product under test.

- **`url`** — Default site when you do not pass `--target` or positional URL.
- **`selectors`** — Comma-separated CSS lists are tried **in order** for input and submit; **output** waits until **any** listed selector has enough text.
- **`outputTimeoutMs`** — Default **60s** wait for model output (raise for slow models).
- **`maxRetries` / `retryDelayMs`** — Flake handling.
- **`extraDismissSelectors`** (optional) — Comma-separated CSS for extra clicks after load when you discover a site needs a specific “Continue” / banner control.
- **`settleAfterNavigateMs`** (optional) — Extra wait after navigation + dismiss (helps slow SPAs).

### When a site behaves differently

Each product uses its own modals, cookies, and DOM. The runner applies a **generic prepare** step after every navigation: cookie-style buttons, **visible `[role="dialog"]` dismiss** (Continue / Accept / OK / …), **Escape**, then optional **per-site** fields above.

Preset-specific tuning lives in **`src/config/targets.ts`** (e.g. `settleAfterNavigateMs` for DeepSeek, Mistral). When a new site fails:

1. Run with `--headed` and inspect what blocks the input.
2. Add selectors to that preset’s `selectors` or `extraDismissSelectors`, or increase `settleAfterNavigateMs`.
3. Rebuild (`npm run build`) and run again.

`fillInput` also falls back to **`force` click** and **focus** if a normal click hits an overlay (common with Radix/modals).

Example shape:

```typescript
export const config: AppConfig = {
  url: "https://your-ai-app.com",
  selectors: {
    inputBox:
      "textarea, input[type='text'], [contenteditable='true']",
    submitButton:
      "button[type='submit'], button:has-text('Send'), " +
      "button[aria-label*='Submit' i]",
    outputArea:
      "[data-testid*='answer' i], article, .response, .output",
  },
  outputTimeoutMs: 60_000,
  maxRetries: 3,
  retryDelayMs: 2_000,
  screenshotsDir: "./screenshots",
  resultsDir: "./results",
  // …testInputs — see file
};
```

**Finding selectors:** Inspect the real app (DevTools), prefer stable attributes (`data-testid`, `aria-label`). Third-party sites change often; you may need site-specific selectors or a logged-in **storage state** in Playwright for gated apps.

---

## Test scenarios

| Key | What it checks |
|---|---|
| `valid` | Normal prompt → non-empty response (min length) |
| `empty` | Empty submit → disabled button, validation, or no crash |
| `long` | Long prompt → still returns output |
| `special` | Emoji / symbols / Unicode → non-empty, basic XSS string checks |

---

## Outputs

- **Console** — Step logs and summary.
- **`results/report-run-<timestamp>.json`** — Run metadata and per-test results.
- **`screenshots/<test>-<timestamp>.png`** — On failure.

---

## Development

```bash
npm run dev      # tsc --watch
npm run build    # compile to dist/
```

---

## Dependencies

| Package | Role |
|---|---|
| `playwright` | Browser automation |
| `chalk` | Terminal colours |
| `commander` | CLI parsing |
| `typescript` | Types + build |

---

## License

MIT
