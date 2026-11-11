import * as fc from 'fast-check';
import type { HauntedResource, JsonObject, Severity } from '../../src/index.js';
import { makeResource } from '../support/resources.js';

export const ADMIN_PORTS: readonly number[] = [22, 3389];
export const DATASTORE_PORTS: readonly number[] = [
  1433, 1521, 2049, 3306, 5432, 5984, 6379, 9042, 9200, 11211, 27017,
];

export type Source = 'open4' | 'open6' | 'both' | 'private' | 'narrow' | 'security-group';

export interface GeneratedIngress {
  readonly protocol: 'tcp' | 'udp' | 'icmp' | '-1';
  readonly fromPort: number;
  readonly toPort: number;
  readonly source: Source;
  /** An extra source that survives removal of the public one. */
  readonly keepsOther: boolean;
}

const port = fc.oneof(
  fc.constantFrom(...ADMIN_PORTS, ...DATASTORE_PORTS, 80, 443, 8080, 8443, 0, 65535),
  fc.integer({ min: 0, max: 65535 }),
);

/** A port range with `from <= to`. */
const range = fc.tuple(port, port).map(([a, b]): [number, number] => (a <= b ? [a, b] : [b, a]));

const protocol = fc.constantFrom<GeneratedIngress['protocol']>(
  'tcp',
  'tcp',
  'tcp',
  'udp',
  'icmp',
  '-1',
);

export const source = fc.constantFrom<Source>(
  'open4',
  'open6',
  'both',
  'private',
  'narrow',
  'security-group',
);

export const ingress: fc.Arbitrary<GeneratedIngress> = fc
  .record({ protocol, range, source, keepsOther: fc.boolean() })
  .map(({ protocol: p, range: [fromPort, toPort], source: s, keepsOther }) => ({
    protocol: p,
    fromPort,
    toPort,
    source: s,
    keepsOther,
  }));

export const isOpen = (s: Source): boolean => s === 'open4' || s === 'open6' || s === 'both';

/**
 * Oracle written from Requirement 6, not from the rule:
 *  - CRITICAL: protocol -1, or the range includes 22 or 3389
 *  - HIGH: a data-store port is in the range
 *  - nothing: exactly TCP 80 or exactly TCP 443
 *  - MEDIUM: everything else
 * and only for sources that are 0.0.0.0/0 or ::/0.
 */
export function expectedSeverity(rule: GeneratedIngress): Severity | undefined {
  if (!isOpen(rule.source)) {
    return undefined;
  }
  if (rule.protocol === '-1') {
    return 'CRITICAL';
  }
  if (rule.protocol === 'tcp' || rule.protocol === 'udp') {
    const inRange = (p: number): boolean => rule.fromPort <= p && p <= rule.toPort;
    if (ADMIN_PORTS.some(inRange)) {
      return 'CRITICAL';
    }
    if (DATASTORE_PORTS.some(inRange)) {
      return 'HIGH';
    }
    if (
      rule.protocol === 'tcp' &&
      rule.fromPort === rule.toPort &&
      (rule.fromPort === 80 || rule.fromPort === 443)
    ) {
      return undefined;
    }
  }
  return 'MEDIUM';
}

export function ingressToJson(rule: GeneratedIngress): JsonObject {
  const cidrBlocks: string[] = [];
  const ipv6CidrBlocks: string[] = [];
  if (rule.source === 'open4' || rule.source === 'both') {
    cidrBlocks.push('0.0.0.0/0');
  }
  if (rule.source === 'open6' || rule.source === 'both') {
    ipv6CidrBlocks.push('::/0');
  }
  if (rule.source === 'private') {
    cidrBlocks.push('10.0.0.0/8');
  }
  if (rule.source === 'narrow') {
    cidrBlocks.push('0.0.0.0/1');
  }
  if (rule.keepsOther && isOpen(rule.source)) {
    cidrBlocks.push('192.168.0.0/16');
  }
  return {
    protocol: rule.protocol,
    fromPort: rule.protocol === '-1' ? 0 : rule.fromPort,
    toPort: rule.protocol === '-1' ? 0 : rule.toPort,
    cidrBlocks,
    ipv6CidrBlocks,
    ...(rule.source === 'security-group' ? { securityGroups: ['sg-0123456789abcdef0'] } : {}),
  };
}

export function toSecurityGroup(rules: readonly GeneratedIngress[]): HauntedResource {
  return makeResource('aws_security_group', { ingress: rules.map(ingressToJson) });
}

export const securityGroup: fc.Arbitrary<{
  rules: GeneratedIngress[];
  resource: HauntedResource;
}> = fc
  .array(ingress, { minLength: 1, maxLength: 6 })
  .map((rules) => ({ rules, resource: toSecurityGroup(rules) }));
