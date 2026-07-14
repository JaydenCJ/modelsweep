/**
 * Parameter linting. Each rule family describes the request surface a group
 * of models shares: which parameters exist at all, their numeric ranges, and
 * which combinations the vendor rejects or advises against. The checker maps
 * a model entry to its family and evaluates the parameters extracted next to
 * the reference.
 *
 * Severity contract: anything the vendor's API rejects outright is an error
 * (E103/E104/E105); anything that degrades or is advised against is a
 * warning (W203/W204/W205). Codes are stable API — see docs/rules.md.
 */
import type { ExtractedParam, Family, Finding, ModelEntry } from "./types.js";

/** A finding before file/model context is attached. */
export type ParamFinding = Omit<Finding, "file" | "model">;

interface FamilyRuleSet {
  /** Short label used by `modelsweep explain`. */
  label: string;
  /** Params the API rejects outright: param -> fix text. */
  unsupported: Record<string, string>;
  /** Inclusive numeric ranges: param -> [min, max]. */
  ranges: Record<string, [number, number]>;
  /** Integer params with a minimum: param -> min. */
  intMin: Record<string, number>;
  /** How setting temperature AND top_p together is treated. */
  pair?: "error" | "warning";
  /** Deprecated-but-accepted params: param -> fix text (W204). */
  deprecatedParams: Record<string, string>;
  /** Params the API requires on every request (W205 when absent). */
  requiredParams: string[];
  /** Whether extended-thinking budget_tokens constraints apply. */
  budgetTokens: boolean;
  /** Allowed values for reasoning_effort, when the family supports it. */
  effortEnum?: string[];
}

const REJECTS_SAMPLING = "remove it — this model family rejects sampling and penalty controls (steer with prompting instead)";

export const FAMILY_RULES: Record<Family, FamilyRuleSet> = {
  "openai-chat": {
    label: "OpenAI Chat Completions",
    unsupported: {},
    ranges: { temperature: [0, 2], top_p: [0, 1], presence_penalty: [-2, 2], frequency_penalty: [-2, 2] },
    intMin: { n: 1 },
    pair: "warning",
    deprecatedParams: {
      max_tokens: "use max_completion_tokens — max_tokens is deprecated in the Chat Completions API",
    },
    requiredParams: [],
    budgetTokens: false,
  },
  "openai-reasoning": {
    label: "OpenAI reasoning models",
    unsupported: {
      temperature: REJECTS_SAMPLING,
      top_p: REJECTS_SAMPLING,
      presence_penalty: REJECTS_SAMPLING,
      frequency_penalty: REJECTS_SAMPLING,
      logprobs: REJECTS_SAMPLING,
      logit_bias: REJECTS_SAMPLING,
      max_tokens: "use max_completion_tokens — reasoning models reject max_tokens",
    },
    ranges: {},
    intMin: {},
    deprecatedParams: {},
    requiredParams: [],
    budgetTokens: false,
    effortEnum: ["minimal", "low", "medium", "high"],
  },
  "openai-completions": {
    label: "OpenAI legacy Completions",
    unsupported: {},
    ranges: { temperature: [0, 2], top_p: [0, 1] },
    intMin: { n: 1 },
    pair: "warning",
    deprecatedParams: {},
    requiredParams: [],
    budgetTokens: false,
  },
  "anthropic-legacy": {
    label: "Anthropic Messages (Claude 3.x and earlier)",
    unsupported: {},
    ranges: { temperature: [0, 1], top_p: [0, 1] },
    intMin: { top_k: 0 },
    pair: "warning",
    deprecatedParams: {},
    requiredParams: ["max_tokens"],
    budgetTokens: true,
  },
  "anthropic-4": {
    label: "Anthropic Messages (Claude 4.0-4.6)",
    unsupported: {},
    ranges: { temperature: [0, 1], top_p: [0, 1] },
    intMin: { top_k: 0 },
    pair: "error",
    deprecatedParams: {},
    requiredParams: ["max_tokens"],
    budgetTokens: true,
  },
  "anthropic-adaptive": {
    label: "Anthropic Messages (adaptive-thinking family)",
    unsupported: {
      temperature: REJECTS_SAMPLING,
      top_p: REJECTS_SAMPLING,
      top_k: REJECTS_SAMPLING,
      budget_tokens: "switch to adaptive thinking — budget_tokens was removed on this family",
    },
    ranges: {},
    intMin: {},
    deprecatedParams: {},
    requiredParams: ["max_tokens"],
    budgetTokens: false,
  },
  google: {
    label: "Google Gemini generateContent",
    unsupported: {},
    ranges: { temperature: [0, 2], top_p: [0, 1] },
    intMin: { top_k: 1 },
    pair: "warning",
    deprecatedParams: {},
    requiredParams: [],
    budgetTokens: false,
  },
  mistral: {
    label: "Mistral chat completions",
    unsupported: {},
    ranges: { temperature: [0, 1], top_p: [0, 1] },
    intMin: {},
    pair: "warning",
    deprecatedParams: {},
    requiredParams: [],
    budgetTokens: false,
  },
  cohere: {
    label: "Cohere chat",
    unsupported: {},
    ranges: { temperature: [0, 1] },
    intMin: {},
    pair: "warning",
    deprecatedParams: {},
    requiredParams: [],
    budgetTokens: false,
  },
};

function formatRange([min, max]: [number, number]): string {
  return `${min}..${max}`;
}

/** Evaluate the extracted parameters against one model's family rules. */
export function evaluateParams(
  entry: ModelEntry,
  params: readonly ExtractedParam[],
  reference: { line: number; col: number }
): ParamFinding[] {
  const rules = FAMILY_RULES[entry.family];
  const findings: ParamFinding[] = [];
  const byKey = new Map(params.map((p) => [p.key, p]));

  for (const param of params) {
    const fix = rules.unsupported[param.key];
    if (fix !== undefined) {
      findings.push({
        code: "E103",
        severity: "error",
        line: param.line,
        col: param.col,
        message: `"${param.raw}" is not supported by ${entry.id}`,
        fix,
      });
      continue;
    }

    const range = rules.ranges[param.key];
    if (range && param.value.kind === "number") {
      const v = param.value.value;
      if (v < range[0] || v > range[1]) {
        findings.push({
          code: "E104",
          severity: "error",
          line: param.line,
          col: param.col,
          message: `${param.key} ${v} is outside the supported range ${formatRange(range)} for ${entry.id}`,
          fix: `use a value within ${formatRange(range)}`,
        });
      }
    }

    const intMin = rules.intMin[param.key];
    if (intMin !== undefined && param.value.kind === "number") {
      const v = param.value.value;
      if (!Number.isInteger(v) || v < intMin) {
        findings.push({
          code: "E104",
          severity: "error",
          line: param.line,
          col: param.col,
          message: `${param.key} ${v} is invalid for ${entry.id} — expected an integer >= ${intMin}`,
          fix: `use an integer >= ${intMin}`,
        });
      }
    }

    if (rules.effortEnum && param.key === "reasoning_effort" && param.value.kind === "string") {
      if (!rules.effortEnum.includes(param.value.value)) {
        findings.push({
          code: "E104",
          severity: "error",
          line: param.line,
          col: param.col,
          message: `reasoning_effort "${param.value.value}" is not one of ${rules.effortEnum.join(", ")}`,
          fix: `use one of: ${rules.effortEnum.join(", ")}`,
        });
      }
    }

    const deprecatedFix = rules.deprecatedParams[param.key];
    if (deprecatedFix !== undefined) {
      findings.push({
        code: "W204",
        severity: "warning",
        line: param.line,
        col: param.col,
        message: `${param.key} is deprecated for ${entry.id}`,
        fix: deprecatedFix,
      });
    }
  }

  if (rules.budgetTokens) {
    const budget = byKey.get("budget_tokens");
    if (budget && budget.value.kind === "number") {
      if (budget.value.value < 1024) {
        findings.push({
          code: "E104",
          severity: "error",
          line: budget.line,
          col: budget.col,
          message: `budget_tokens ${budget.value.value} is below the minimum 1024 for ${entry.id}`,
          fix: "use at least 1024 thinking tokens",
        });
      }
      const maxTokens = byKey.get("max_tokens");
      if (maxTokens && maxTokens.value.kind === "number" && budget.value.value >= maxTokens.value.value) {
        findings.push({
          code: "E105",
          severity: "error",
          line: budget.line,
          col: budget.col,
          message: `budget_tokens (${budget.value.value}) must be less than max_tokens (${maxTokens.value.value}) for ${entry.id}`,
          fix: "raise max_tokens or lower budget_tokens",
        });
      }
    }
  }

  if (rules.pair) {
    const temperature = byKey.get("temperature");
    const topP = byKey.get("top_p");
    if (temperature && topP) {
      findings.push(
        rules.pair === "error"
          ? {
              code: "E105",
              severity: "error",
              line: temperature.line,
              col: temperature.col,
              message: `temperature and top_p are both set — ${entry.id} rejects requests that set both`,
              fix: "keep one of them",
            }
          : {
              code: "W203",
              severity: "warning",
              line: temperature.line,
              col: temperature.col,
              message: `temperature and top_p are both set — ${entry.provider} advises tuning one, not both`,
              fix: "drop one of them",
            }
      );
    }
  }

  if (params.length > 0) {
    for (const required of rules.requiredParams) {
      if (!byKey.has(required)) {
        findings.push({
          code: "W205",
          severity: "warning",
          line: reference.line,
          col: reference.col,
          message: `${required} is required by the ${entry.provider} API but is not set in this call`,
          fix: `add ${required}`,
        });
      }
    }
  }

  return findings;
}

/** Human-readable rule summary for `modelsweep explain`. */
export function describeFamilyRules(family: Family): string[] {
  const rules = FAMILY_RULES[family];
  const lines: string[] = [];
  for (const [param, [min, max]] of Object.entries(rules.ranges)) {
    lines.push(`${param} must be within ${min}..${max}`);
  }
  for (const [param, min] of Object.entries(rules.intMin)) {
    lines.push(`${param} must be an integer >= ${min}`);
  }
  for (const param of Object.keys(rules.unsupported)) {
    lines.push(`${param} is not supported (rejected by the API)`);
  }
  for (const param of Object.keys(rules.deprecatedParams)) {
    lines.push(`${param} is deprecated (${rules.deprecatedParams[param]})`);
  }
  for (const param of rules.requiredParams) {
    lines.push(`${param} is required on every request`);
  }
  if (rules.pair === "error") lines.push("temperature and top_p must not be set together");
  if (rules.pair === "warning") lines.push("temperature and top_p together draws a warning");
  if (rules.budgetTokens) lines.push("budget_tokens needs >= 1024 and < max_tokens");
  if (rules.effortEnum) lines.push(`reasoning_effort must be one of ${rules.effortEnum.join(", ")}`);
  return lines;
}
