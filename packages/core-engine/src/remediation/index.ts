export { applyPatch, applyPatches } from './apply-patch.js';
export type { ApplyPatchResult } from './apply-patch.js';
export { buildPatch, renderJson } from './build-patch.js';
export type { BuildPatchInput } from './build-patch.js';
export {
  READ_ONLY_CATALOG,
  deriveActions,
  globMatch,
  hasWildcard,
  servicePrefix,
  sortedUnique,
} from './least-privilege.js';
export type { ActionSource, DerivedActions } from './least-privilege.js';
