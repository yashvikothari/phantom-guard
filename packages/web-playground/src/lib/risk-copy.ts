/**
 * Plain-language "why this matters" text for each rule. Playground copy only: the engine's
 * messages stay factual and technical.
 */
const RISK_BY_RULE: ReadonlyMap<string, string> = new Map([
  [
    'PG-IAM-001',
    'Anyone who gets this identity\u2019s credentials, or any bug in code that runs with it, can use every permission the wildcard covers. Wildcards also widen on their own: new AWS actions are included automatically, so the grant grows without anyone reviewing it.',
  ],
  [
    'PG-IAM-002',
    'Any principal can use this grant, including other AWS accounts, not only the ones you trust. Without a Condition, nothing limits who that is.',
  ],
  [
    'PG-NET-001',
    '0.0.0.0/0 and ::/0 mean the whole internet. Automated scanners find open ports within minutes, and exposed administration or database ports are a common way in.',
  ],
  [
    'PG-STO-001',
    'Data at rest can be read by anyone who obtains a snapshot, a backup or the underlying storage. Encryption at rest limits that to holders of the key. For S3, new objects are already encrypted by default, so the gap there is an undeclared setting, not plaintext data.',
  ],
  [
    'PG-STO-002',
    'Public ACLs and policies let anonymous users read, and sometimes write, your objects. Block Public Access is a safety net that overrides both, so having it off removes the last guard against a mistake.',
  ],
  [
    'PG-CTR-001',
    'A process that runs as root inside a container starts with the most privilege the container offers. If an attacker takes over that process, escaping the container or reading mounted secrets is easier. A privileged container removes most of the isolation.',
  ],
]);

const GENERIC_RISK =
  'This configuration departs from a security guardrail. Read the finding and its references to judge how it applies to your environment.';

export function riskExplanation(ruleId: string): string {
  return RISK_BY_RULE.get(ruleId) ?? GENERIC_RISK;
}
