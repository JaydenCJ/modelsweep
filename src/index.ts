/**
 * Public programmatic API. Everything the CLI does is reachable here:
 *
 *   import { checkContent, buildReport } from "modelsweep";
 *
 * All exported functions are pure except `collectFiles` (filesystem walk).
 */
export { checkContent } from "./check.js";
export { extractReferences, findKnownIds, extOf } from "./extract.js";
export {
  DATA_SNAPSHOT,
  MODELS,
  findModel,
  resolveAlias,
  statusAt,
  suggestModel,
  validateDataset,
} from "./registry.js";
export { evaluateParams, describeFamilyRules, FAMILY_RULES } from "./rules.js";
export { buildReport, renderJson, renderText } from "./report.js";
export { collectFiles, MAX_FILE_BYTES, ScanError } from "./scanner.js";
export { parseIsoDate, isValidIsoDate, daysBetween, todayIso } from "./dates.js";
export { VERSION } from "./version.js";
export type {
  CheckOptions,
  ExtractedParam,
  Family,
  FileReport,
  Finding,
  ModelEntry,
  ModelReference,
  ModelStatus,
  ParamValue,
  Provider,
  ReferenceSource,
  ScanReport,
  Severity,
} from "./types.js";
