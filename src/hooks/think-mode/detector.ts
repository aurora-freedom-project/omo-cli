const ENGLISH_PATTERNS = [/\bultrathink\b/i, /\bthink\b/i]

const MULTILINGUAL_KEYWORDS = [
  "생각", "고민", "검토", "제대로",
  "思考", "考虑", "考慮",
  "思考", "考え", "熟考",
  "सोच", "विचार",
  "تفكير", "تأمل",
  "চিন্তা", "ভাবনা",
  "думать", "думай", "размышлять", "размышляй",
  "pensar", "pense", "refletir", "reflita",
  "pensar", "piensa", "reflexionar", "reflexiona",
  "penser", "pense", "réfléchir", "réfléchis",
  "denken", "denk", "nachdenken",
  "suy nghĩ", "cân nhắc",
  "düşün", "düşünmek",
  "pensare", "pensa", "riflettere", "rifletti",
  "คิด", "พิจารณา",
  "myśl", "myśleć", "zastanów",
  "denken", "denk", "nadenken",
  "berpikir", "pikir", "pertimbangkan",
  "думати", "думай", "роздумувати",
  "σκέψου", "σκέφτομαι",
  "myslet", "mysli", "přemýšlet",
  "gândește", "gândi", "reflectă",
  "tänka", "tänk", "fundera",
  "gondolkodj", "gondolkodni",
  "ajattele", "ajatella", "pohdi",
  "tænk", "tænke", "overvej",
  "tenk", "tenke", "gruble",
  "חשוב", "לחשוב", "להרהר",
  "fikir", "berfikir",
]

const MULTILINGUAL_PATTERNS = MULTILINGUAL_KEYWORDS.map((kw) => new RegExp(kw, "i"))
const THINK_PATTERNS = [...ENGLISH_PATTERNS, ...MULTILINGUAL_PATTERNS]

import { removeCodeBlocks, extractPromptText as _extractPromptText } from "../../shared/prompt-text"

export function detectThinkKeyword(text: string): boolean {
  const textWithoutCode = removeCodeBlocks(text)
  return THINK_PATTERNS.some((pattern) => pattern.test(textWithoutCode))
}

/** Re-export with empty separator for tight concatenation (think-mode behavior). */
export function extractPromptText(
  parts: Array<{ type: string; text?: string }>
): string {
  return _extractPromptText(parts, "")
}
