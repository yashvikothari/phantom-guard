import type { Finding, Severity } from '@phantomguard/core-engine';

/**
 * CVSS v3.1 base score, computed with the equations in the FIRST specification.
 *
 * PhantomGuard finds misconfigurations, and CVSS scores vulnerabilities in software, so the
 * numbers here are estimates: PhantomGuard chooses a vector for each rule and severity tier
 * (see VECTORS) and the equations do the arithmetic. They are not NVD ratings.
 */

export type Rating = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface CvssMetrics {
  readonly av: 'N' | 'A' | 'L' | 'P';
  readonly ac: 'L' | 'H';
  readonly pr: 'N' | 'L' | 'H';
  readonly ui: 'N' | 'R';
  readonly s: 'U' | 'C';
  readonly c: 'H' | 'L' | 'N';
  readonly i: 'H' | 'L' | 'N';
  readonly a: 'H' | 'L' | 'N';
}

export interface CvssEstimate {
  readonly vector: string;
  readonly score: number;
  readonly rating: Rating;
}

const ATTACK_VECTOR = { N: 0.85, A: 0.62, L: 0.55, P: 0.2 } as const;
const ATTACK_COMPLEXITY = { L: 0.77, H: 0.44 } as const;
const USER_INTERACTION = { N: 0.85, R: 0.62 } as const;
const IMPACT = { H: 0.56, L: 0.22, N: 0 } as const;

function privilegesRequired(level: CvssMetrics['pr'], scopeChanged: boolean): number {
  switch (level) {
    case 'N':
      return 0.85;
    case 'L':
      return scopeChanged ? 0.68 : 0.62;
    case 'H':
      return scopeChanged ? 0.5 : 0.27;
  }
}

/** The smallest number with one decimal that is at least `value` (CVSS v3.1, Appendix A). */
function roundUp(value: number): number {
  const scaled = Math.round(value * 100000);
  return scaled % 10000 === 0 ? scaled / 100000 : (Math.floor(scaled / 10000) + 1) / 10;
}

export function baseScore(metrics: CvssMetrics): number {
  const scopeChanged = metrics.s === 'C';
  const iss = 1 - (1 - IMPACT[metrics.c]) * (1 - IMPACT[metrics.i]) * (1 - IMPACT[metrics.a]);
  const impact = scopeChanged ? 7.52 * (iss - 0.029) - 3.25 * (iss - 0.02) ** 15 : 6.42 * iss;
  if (impact <= 0) {
    return 0;
  }
  const exploitability =
    8.22 *
    ATTACK_VECTOR[metrics.av] *
    ATTACK_COMPLEXITY[metrics.ac] *
    privilegesRequired(metrics.pr, scopeChanged) *
    USER_INTERACTION[metrics.ui];
  const total = impact + exploitability;
  return roundUp(Math.min(scopeChanged ? 1.08 * total : total, 10));
}

export function ratingOf(score: number): Rating {
  if (score === 0) {
    return 'NONE';
  }
  if (score < 4) {
    return 'LOW';
  }
  if (score < 7) {
    return 'MEDIUM';
  }
  return score < 9 ? 'HIGH' : 'CRITICAL';
}

const PREFIX = 'CVSS:3.1/';

/** Parse `CVSS:3.1/AV:N/AC:L/...`. Undefined when any base metric is missing or invalid. */
export function parseVector(vector: string): CvssMetrics | undefined {
  if (!vector.startsWith(PREFIX)) {
    return undefined;
  }
  const parts = new Map<string, string>();
  for (const part of vector.slice(PREFIX.length).split('/')) {
    const [key, value] = part.split(':');
    if (key === undefined || value === undefined || parts.has(key)) {
      return undefined;
    }
    parts.set(key, value);
  }
  const pick = <T extends string>(key: string, allowed: readonly T[]): T | undefined =>
    allowed.find((candidate) => candidate === parts.get(key));
  const av = pick('AV', ['N', 'A', 'L', 'P'] as const);
  const ac = pick('AC', ['L', 'H'] as const);
  const pr = pick('PR', ['N', 'L', 'H'] as const);
  const ui = pick('UI', ['N', 'R'] as const);
  const s = pick('S', ['U', 'C'] as const);
  const c = pick('C', ['H', 'L', 'N'] as const);
  const i = pick('I', ['H', 'L', 'N'] as const);
  const a = pick('A', ['H', 'L', 'N'] as const);
  if (
    av === undefined ||
    ac === undefined ||
    pr === undefined ||
    ui === undefined ||
    s === undefined ||
    c === undefined ||
    i === undefined ||
    a === undefined
  ) {
    return undefined;
  }
  return { av, ac, pr, ui, s, c, i, a };
}

export function estimateFromVector(vector: string): CvssEstimate | undefined {
  const metrics = parseVector(vector);
  if (metrics === undefined) {
    return undefined;
  }
  const score = baseScore(metrics);
  return { vector, score, rating: ratingOf(score) };
}

/**
 * The vector PhantomGuard assumes for each rule and severity tier. The reasoning, in short:
 * a world-open network path needs no privileges (PR:N); an over-broad IAM grant needs a
 * principal that holds it (PR:L); unencrypted storage needs a foothold and a hard-to-meet
 * condition (AC:H); a container escape starts on the host (AV:L).
 */
const VECTORS: ReadonlyMap<string, string> = new Map([
  ['PG-IAM-001|CRITICAL', 'CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:C/C:H/I:H/A:H'],
  ['PG-IAM-001|HIGH', 'CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:H'],
  ['PG-IAM-001|MEDIUM', 'CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:L/I:L/A:L'],
  ['PG-IAM-001|LOW', 'CVSS:3.1/AV:N/AC:H/PR:L/UI:N/S:U/C:L/I:N/A:N'],
  ['PG-IAM-002|CRITICAL', 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N'],
  ['PG-IAM-002|MEDIUM', 'CVSS:3.1/AV:N/AC:H/PR:L/UI:N/S:U/C:L/I:L/A:N'],
  ['PG-NET-001|CRITICAL', 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H'],
  ['PG-NET-001|HIGH', 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:L/A:N'],
  ['PG-NET-001|MEDIUM', 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N'],
  ['PG-STO-001|HIGH', 'CVSS:3.1/AV:N/AC:H/PR:L/UI:N/S:U/C:H/I:N/A:N'],
  ['PG-STO-001|MEDIUM', 'CVSS:3.1/AV:N/AC:H/PR:L/UI:N/S:U/C:L/I:N/A:N'],
  ['PG-STO-002|CRITICAL', 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N'],
  ['PG-STO-002|HIGH', 'CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:N/A:N'],
  ['PG-STO-002|MEDIUM', 'CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:L/I:N/A:N'],
  ['PG-CTR-001|CRITICAL', 'CVSS:3.1/AV:L/AC:L/PR:L/UI:N/S:C/C:H/I:H/A:H'],
  ['PG-CTR-001|HIGH', 'CVSS:3.1/AV:L/AC:H/PR:L/UI:N/S:U/C:H/I:H/A:H'],
]);

/** Used for a rule PhantomGuard has no specific vector for, for example one added later. */
const FALLBACK: Readonly<Record<Severity, string | undefined>> = {
  CRITICAL: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H',
  HIGH: 'CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:H',
  MEDIUM: 'CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:L/I:L/A:L',
  LOW: 'CVSS:3.1/AV:N/AC:H/PR:L/UI:N/S:U/C:L/I:N/A:N',
  INFO: undefined,
};

/** A world-writable bucket also lets an attacker change data, which the read-only tier does not. */
const WORLD_WRITABLE = 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N';

function vectorFor(finding: Finding): string | undefined {
  if (
    finding.ruleId === 'PG-STO-002' &&
    finding.severity === 'CRITICAL' &&
    finding.evidence['acl'] === 'public-read-write'
  ) {
    return WORLD_WRITABLE;
  }
  return VECTORS.get(`${finding.ruleId}|${finding.severity}`) ?? FALLBACK[finding.severity];
}

/** The estimate for one finding. Undefined for INFO findings, which carry no score. */
export function estimateFor(finding: Finding): CvssEstimate | undefined {
  const vector = vectorFor(finding);
  return vector === undefined ? undefined : estimateFromVector(vector);
}

/** The highest estimate among the findings, or undefined when none has one. */
export function highestEstimate(findings: readonly Finding[]): CvssEstimate | undefined {
  let best: CvssEstimate | undefined;
  for (const finding of findings) {
    const estimate = estimateFor(finding);
    if (estimate !== undefined && (best === undefined || estimate.score > best.score)) {
      best = estimate;
    }
  }
  return best;
}
