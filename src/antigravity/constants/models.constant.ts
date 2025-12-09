// Available models from Antigravity API
// Based on: https://github.com/Mirrowel/LLM-API-Key-Proxy
export const AVAILABLE_MODELS = [
  // Gemini 3
  'gemini-3-pro-preview', // Uses thinkingLevel: low/high based on reasoning_effort

  // Claude via Antigravity
  'claude-sonnet-4-5', // Non-thinking variant
  'claude-sonnet-4-5-thinking', // Thinking variant (when reasoning_effort provided)
  'claude-opus-4-5', // ALWAYS uses -thinking variant internally
] as const;

export type AvailableModel = (typeof AVAILABLE_MODELS)[number];

// Models that ALWAYS require thinking variant (no non-thinking option exists)
export const THINKING_ONLY_MODELS = ['claude-opus-4-5'] as const;

// Model aliases for internal Antigravity API mapping
export const MODEL_ALIAS_MAP: Record<string, string> = {
  // Gemini 3 maps to -low or -high internally based on thinkingLevel
  'gemini-3-pro-low': 'gemini-3-pro-preview',
  'gemini-3-pro-high': 'gemini-3-pro-preview',
  // Claude opus always uses thinking variant
  'claude-opus-4-5': 'claude-opus-4-5-thinking',
};

// Models that use thinkingLevel (string: "low"/"high") instead of thinkingBudget (integer)
export const THINKING_LEVEL_MODELS = ['gemini-3-pro-preview'];

// Thinking budget values for Claude and Gemini 2.5
export const THINKING_BUDGETS: Record<string, number> = {
  low: 8192,
  medium: 16384,
  high: 32768,
};

// Default max output tokens per model (including thinking tokens)
export const DEFAULT_MAX_TOKENS: Record<string, number> = {
  'claude-opus-4-5': 64000,
  'claude-sonnet-4-5': 64000,
  'claude-sonnet-4-5-thinking': 64000,
  'gemini-3-pro-preview': 65536,
};

// Model ownership for /v1/models endpoint
export const MODEL_OWNERS: Record<string, string> = {
  'gemini-3-pro-preview': 'google',
  'claude-sonnet-4-5': 'anthropic',
  'claude-sonnet-4-5-thinking': 'anthropic',
  'claude-opus-4-5': 'anthropic',
};
