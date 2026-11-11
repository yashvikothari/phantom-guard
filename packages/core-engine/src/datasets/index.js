import { cloneFrozen } from '../util/clone.js';
import { hauntedMansion } from './haunted-mansion.js';
import { sanctifiedSanctuary } from './sanctified-sanctuary.js';
const DATASETS = [
  {
    info: {
      id: 'haunted-mansion',
      name: 'Haunted Mansion',
      tagline: 'Every guardrail broken at least once.',
      description:
        'A fictional AWS account with wildcard IAM grants, public SSH and database ports, unencrypted storage and root or privileged containers.',
    },
    resources: hauntedMansion,
  },
  {
    info: {
      id: 'sanctified-sanctuary',
      name: 'Sanctified Sanctuary',
      tagline: 'Nothing lurks here.',
      description:
        'A fictional AWS account that follows every guardrail. A scan finds nothing, which proves the rules do not cry wolf.',
    },
    resources: sanctifiedSanctuary,
  },
];
export function listDatasets() {
  return DATASETS.map((entry) => entry.info);
}
/**
 * Load a dataset as a fresh, deeply frozen copy, so callers cannot change the
 * shared source and repeated loads are deeply equal. Returns undefined for an unknown id.
 */
export function loadDataset(id) {
  const entry = DATASETS.find((candidate) => candidate.info.id === id);
  return entry === undefined ? undefined : cloneFrozen(entry.resources);
}
