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

---

## Project structure

```
ai-web-tester/
├── src/
│   ├── index.ts              ← CLI entry (URL, cases, retries, headed)
│   ├── config/index.ts       ← Default URL, selectors, timeouts, test inputs
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

```bash
node dist/index.js --target https://myapp.ai --cases valid --headed
node dist/index.js -u https://myapp.ai -t valid,long --retries 5
```

### Environment variables

If you prefer not to pass flags:

| Variable | Purpose |
|---|---|
| `AI_WEB_TESTER_URL` | Base URL (same as `--target`) |
| `AI_WEB_TESTER_TESTS` | Comma-separated test names (same as `--cases`) |

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
