import { ALL_RULES } from '@phantomguard/core-engine';
import type { HauntedResource, ResourceKind } from '@phantomguard/core-engine';

/**
 * The costume. Spooky wording lives here and in components only; the engine, the CLI and
 * all machine-readable output keep the technical terms (see .kiro/steering/product.md).
 */

const ADJECTIVES = [
  'Wailing',
  'Moldering',
  'Hollow',
  'Grim',
  'Pale',
  'Restless',
  'Veiled',
  'Cursed',
  'Forsaken',
  'Whispering',
] as const;

const NOUNS = [
  'Banshee',
  'Wraith',
  'Poltergeist',
  'Specter',
  'Ghoul',
  'Revenant',
  'Phantom',
  'Shade',
  'Lantern',
  'Crypt',
] as const;

/** FNV-1a, 32-bit: tiny, fast and identical on every platform. */
function hash(text: string): number {
  let value = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 0x01000193) >>> 0;
  }
  return value >>> 0;
}

/** A spooky alias for a resource. Deterministic: the same resource id always gets the same name. */
export function ghostName(resource: HauntedResource): string {
  const seed = hash(resource.id);
  const adjective = ADJECTIVES[seed % ADJECTIVES.length] ?? 'Pale';
  const noun = NOUNS[Math.floor(seed / ADJECTIVES.length) % NOUNS.length] ?? 'Shade';
  return `The ${adjective} ${noun}`;
}

export const KIND_LABEL: Readonly<Record<ResourceKind, string>> = {
  aws_iam_policy: 'IAM policy',
  aws_iam_role: 'IAM role',
  aws_security_group: 'Security group',
  aws_s3_bucket: 'S3 bucket',
  aws_ebs_volume: 'EBS volume',
  aws_db_instance: 'RDS instance',
  aws_ecs_task_definition: 'ECS task definition',
  container_image: 'Container image',
};

const WARD_BY_RULE: ReadonlyMap<string, string> = new Map(
  ALL_RULES.map((rule) => [rule.id, rule.ward] as const),
);

/** The spooky name of a rule, or undefined for an unknown id. */
export function wardFor(ruleId: string): string | undefined {
  return WARD_BY_RULE.get(ruleId);
}

/** "1 poltergeist", "3 poltergeists": the Playground's word for Findings. */
export function poltergeists(count: number): string {
  return `${String(count)} ${count === 1 ? 'poltergeist' : 'poltergeists'}`;
}

/** "1 zombie resource", "2 zombie resources": resources that still run with a Finding on them. */
export function zombieResources(count: number): string {
  return `${String(count)} ${count === 1 ? 'zombie resource' : 'zombie resources'}`;
}

/** The Playground's word for the engine's Risk_Score. */
export function hauntingVerdict(score: number): string {
  if (score === 0) {
    return 'Sanctified';
  }
  if (score < 40) {
    return 'Uneasy';
  }
  if (score < 100) {
    return 'Haunted';
  }
  return 'Thoroughly haunted';
}
