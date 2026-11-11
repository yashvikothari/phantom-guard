/**
 * @phantomguard/core-engine
 *
 * Pure, environment-agnostic security analysis: parse -> normalize -> evaluate -> remediate.
 * No DOM API, no Node API, no network, no runtime dependency.
 */
export { SEVERITY_ORDER, SEVERITY_WEIGHT } from './contracts/index.js';
// Scanning
export { MAX_RESOURCES, scan } from './scanner/scan.js';
export { scanText } from './scanner/scan-text.js';
export { redactReport } from './scanner/redact-report.js';
export { createRuleRegistry } from './scanner/registry.js';
// Rules
export {
  ALL_RULES,
  publicPrincipal,
  rootContainer,
  s3PublicAccess,
  unencryptedStorage,
  unrestrictedIngress,
  wildcardPermissions,
} from './rules/index.js';
// Parsing
export {
  MAX_INPUT_BYTES,
  MAX_JSON_DEPTH,
  PARSERS,
  detectFormat,
  parseConfig,
  supportedFormats,
} from './parsers/index.js';
// Remediation
export { applyPatch, applyPatches, buildPatch, renderJson } from './remediation/index.js';
// Datasets (Mode 1)
export { listDatasets, loadDataset } from './datasets/index.js';
// Utilities that front ends also need
export { unifiedDiff } from './util/unified-diff.js';
export { printable } from './util/text.js';
