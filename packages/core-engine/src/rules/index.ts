import type { DetectionRule } from '../contracts/detection-rule.js';
import { rootContainer } from './container/root-container.js';
import { publicPrincipal } from './iam/public-principal.js';
import { wildcardPermissions } from './iam/wildcard-permissions.js';
import { unrestrictedIngress } from './network/unrestricted-ingress.js';
import { s3PublicAccess } from './storage/s3-public-access.js';
import { unencryptedStorage } from './storage/unencrypted-storage.js';

/**
 * Every built-in rule, grouped by ruleset: iam/, network/, storage/, container/.
 * Add a rule by creating its file in the matching folder and listing it here.
 */
export const ALL_RULES: readonly DetectionRule[] = [
  wildcardPermissions,
  publicPrincipal,
  unrestrictedIngress,
  unencryptedStorage,
  s3PublicAccess,
  rootContainer,
];

export {
  publicPrincipal,
  rootContainer,
  s3PublicAccess,
  unencryptedStorage,
  unrestrictedIngress,
  wildcardPermissions,
};
