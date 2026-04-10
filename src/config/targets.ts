// ============================================================
//  config/targets.ts  — Preset URLs for popular AI web chat UIs
//  Many require login or block automation; defaults use shared selectors.
// ============================================================

import type { AppConfig, Selectors } from "./index.js";

export interface TargetPreset {
  /** CLI key, e.g. perplexity */
  id: string;
  /** Human-readable name */
  label: string;
  url: string;
  /** Merged over default selectors when set */
  selectors?: Partial<Selectors>;
  /** Shown in --list-apps */
  notes?: string;
  /** Merged into config — comma-separated CSS to click after load */
  extraDismissSelectors?: string;
  /** Merged into config — ms to wait for UI to settle */
  settleAfterNavigateMs?: number;
}

/**
 * Public chat entry points (URLs may change; verify in browser).
 * Login-gated sites often fail in headless until you add Playwright storageState.
 */
export const TARGET_PRESETS: Record<string, TargetPreset> = {
  perplexity: {
    id: "perplexity",
    label: "Perplexity",
    url: "https://perplexity.ai",
    notes: "Usually works headless with default selectors.",
  },
  chatgpt: {
    id: "chatgpt",
    label: "ChatGPT",
    url: "https://chatgpt.com",
    notes: "Often requires sign-in; may fail without auth.",
  },
  mistral: {
    id: "mistral",
    label: "Mistral (Le Chat)",
    url: "https://chat.mistral.ai/chat",
    notes: "Radix dialogs may block input until dismissed — generic prepare steps try to close them.",
    settleAfterNavigateMs: 600,
  },
  deepseek: {
    id: "deepseek",
    label: "DeepSeek",
    url: "https://chat.deepseek.com",
    notes: "Extra settle time; selectors may need tuning if UI changes.",
    settleAfterNavigateMs: 3_000,
    selectors: {
      inputBox:
        "textarea, [contenteditable='true'], div.ProseMirror, [role='textbox'], input[placeholder*='Message' i]",
    },
  },
  kimi: {
    id: "kimi",
    label: "Kimi (Moonshot)",
    url: "https://www.kimi.com",
    notes: "Verify URL for your region.",
  },
  claude: {
    id: "claude",
    label: "Claude",
    url: "https://claude.ai",
    notes: "Usually requires login.",
  },
  gemini: {
    id: "gemini",
    label: "Google Gemini",
    url: "https://gemini.google.com/app",
    notes: "Requires Google session in most cases.",
  },
  groq: {
    id: "groq",
    label: "Groq",
    url: "https://groq.com",
    notes: "Landing may differ from chat; adjust selectors if needed.",
  },
  copilot: {
    id: "copilot",
    label: "Microsoft Copilot",
    url: "https://copilot.microsoft.com",
    notes: "Often Microsoft account / Edge quirks.",
  },
  meta_ai: {
    id: "meta_ai",
    label: "Meta AI",
    url: "https://www.meta.ai",
    notes: "Region and login dependent.",
  },
  phind: {
    id: "phind",
    label: "Phind",
    url: "https://www.phind.com",
    notes: "Site availability varies.",
  },
};

export function listPresetIds(): string[] {
  return Object.keys(TARGET_PRESETS).sort();
}

export function getPreset(id: string): TargetPreset | undefined {
  return TARGET_PRESETS[id.trim().toLowerCase()];
}

/** Merge base config with a preset (URL + optional selector overrides). */
export function applyPreset(base: AppConfig, preset: TargetPreset): AppConfig {
  return {
    ...base,
    url: preset.url,
    selectors: {
      ...base.selectors,
      ...(preset.selectors ?? {}),
    },
    extraDismissSelectors: preset.extraDismissSelectors ?? base.extraDismissSelectors,
    settleAfterNavigateMs: preset.settleAfterNavigateMs ?? base.settleAfterNavigateMs,
  };
}
