import { buildPatch, renderJson } from '../../remediation/build-patch.js';
import {
  arrayMember,
  booleanMember,
  isJsonObject,
  member,
  numberMember,
  stringArrayMember,
} from '../../util/attributes.js';
import { printable } from '../../util/text.js';
import { CIS_SG_IPV4_ADMIN_PORTS, CIS_SG_IPV6_ADMIN_PORTS, FSBP_EC2_18 } from '../references.js';
const OPEN_IPV4 = '0.0.0.0/0';
const OPEN_IPV6 = '::/0';
const MAX_PORT = 65535;
/** Remote administration: SSH and RDP. CIS AWS Foundations 5.2 / 5.3. */
const ADMIN_PORTS = [22, 3389];
/** Common data stores: SQL Server, Oracle, NFS, MySQL, PostgreSQL, CouchDB, Redis, Cassandra, Elasticsearch, Memcached, MongoDB. */
const DATASTORE_PORTS = [1433, 1521, 2049, 3306, 5432, 5984, 6379, 9042, 9200, 11211, 27017];
function protocolName(value) {
  const raw = typeof value === 'number' ? String(value) : typeof value === 'string' ? value : '';
  switch (raw.trim().toLowerCase()) {
    case '-1':
    case 'all':
      return '-1';
    case '6':
    case 'tcp':
      return 'tcp';
    case '17':
    case 'udp':
      return 'udp';
    case '1':
    case 'icmp':
      return 'icmp';
    default:
      return raw.trim().toLowerCase();
  }
}
/** A missing or invalid range is treated as every port: the conservative reading. */
function portRange(rule) {
  const from = numberMember(rule, 'fromPort');
  const to = numberMember(rule, 'toPort');
  if (from === undefined || to === undefined) {
    return { from: 0, to: MAX_PORT };
  }
  return { from: Math.min(from, to), to: Math.max(from, to) };
}
function assess(protocol, from, to) {
  if (protocol === '-1') {
    return { severity: 'CRITICAL', sensitivePorts: [], range: 'all' };
  }
  if (protocol === 'tcp' || protocol === 'udp') {
    const inRange = (port) => from <= port && port <= to;
    const admin = ADMIN_PORTS.filter(inRange);
    const stores = DATASTORE_PORTS.filter(inRange);
    const range = from === to ? String(from) : `${String(from)}-${String(to)}`;
    if (admin.length > 0) {
      return {
        severity: 'CRITICAL',
        sensitivePorts: [...admin, ...stores].sort((a, b) => a - b),
        range,
      };
    }
    if (stores.length > 0) {
      return { severity: 'HIGH', sensitivePorts: stores, range };
    }
    if (protocol === 'tcp' && from === to && (from === 80 || from === 443)) {
      return { severity: undefined, sensitivePorts: [], range }; // public web ports are allowed
    }
    return { severity: 'MEDIUM', sensitivePorts: [], range };
  }
  return { severity: 'MEDIUM', sensitivePorts: [], range: protocol };
}
function describeExposure(protocol, exposure) {
  if (protocol === '-1') {
    return 'every port over every protocol';
  }
  if (protocol === 'tcp' || protocol === 'udp') {
    const noun = exposure.range.includes('-') ? 'ports' : 'port';
    const sensitive =
      exposure.sensitivePorts.length > 0 ? ` (includes ${exposure.sensitivePorts.join(', ')})` : '';
    return `${protocol.toUpperCase()} ${noun} ${exposure.range}${sensitive}`;
  }
  return `protocol "${printable(protocol, 24)}"`;
}
function evaluate(resource) {
  const violations = [];
  arrayMember(resource.attributes, 'ingress').forEach((entry, index) => {
    if (!isJsonObject(entry)) {
      return;
    }
    const openIpv4 = stringArrayMember(entry, 'cidrBlocks').includes(OPEN_IPV4);
    const openIpv6 = stringArrayMember(entry, 'ipv6CidrBlocks').includes(OPEN_IPV6);
    if (!openIpv4 && !openIpv6) {
      return; // sources narrower than /0 are not flagged
    }
    const protocol = protocolName(member(entry, 'protocol'));
    const { from, to } = portRange(entry);
    const exposure = assess(protocol, from, to);
    if (exposure.severity === undefined) {
      return;
    }
    const openSources = [...(openIpv4 ? [OPEN_IPV4] : []), ...(openIpv6 ? [OPEN_IPV6] : [])];
    const references = [];
    if (exposure.severity === 'CRITICAL') {
      if (openIpv4) {
        references.push(CIS_SG_IPV4_ADMIN_PORTS);
      }
      if (openIpv6) {
        references.push(CIS_SG_IPV6_ADMIN_PORTS);
      }
    }
    references.push(FSBP_EC2_18);
    const line = numberMember(entry, 'line');
    violations.push({
      severity: exposure.severity,
      message: `Ingress rule #${String(index + 1)} allows ${openSources.join(' and ')} to reach ${describeExposure(protocol, exposure)}.`,
      locationKey: `ingress:${String(index)}`,
      evidence: {
        ruleIndex: index,
        protocol,
        portRange: exposure.range,
        sensitivePorts: [...exposure.sensitivePorts],
        openSources,
      },
      ...(line === undefined ? {} : { line }),
      references,
    });
  });
  return violations;
}
function remediate(resource, violation) {
  const index = numberMember(violation.evidence, 'ruleIndex');
  const rules = arrayMember(resource.attributes, 'ingress');
  const rule = index === undefined ? undefined : rules[index];
  if (index === undefined || !isJsonObject(rule)) {
    return {
      kind: 'guidance',
      guidance:
        'Remove the public source and allow only the specific CIDR, prefix list or security group that needs access.',
    };
  }
  const cidrBlocks = stringArrayMember(rule, 'cidrBlocks').filter((cidr) => cidr !== OPEN_IPV4);
  const ipv6CidrBlocks = stringArrayMember(rule, 'ipv6CidrBlocks').filter(
    (cidr) => cidr !== OPEN_IPV6,
  );
  const hasOtherSources =
    cidrBlocks.length > 0 ||
    ipv6CidrBlocks.length > 0 ||
    stringArrayMember(rule, 'securityGroups').length > 0 ||
    stringArrayMember(rule, 'prefixListIds').length > 0 ||
    booleanMember(rule, 'self') === true;
  // Only keys that exist are rewritten, so the patch never adds attributes the author did not use.
  const narrowed = {
    ...rule,
    ...(member(rule, 'cidrBlocks') === undefined ? {} : { cidrBlocks }),
    ...(member(rule, 'ipv6CidrBlocks') === undefined ? {} : { ipv6CidrBlocks }),
  };
  const nextIngress = hasOtherSources
    ? rules.map((item, position) => (position === index ? narrowed : item))
    : rules.filter((_item, position) => position !== index);
  return {
    kind: 'patch',
    patch: buildPatch({
      ruleId: 'PG-NET-001',
      resource,
      locationKey: violation.locationKey,
      title: hasOtherSources
        ? 'Remove the public source from the ingress rule'
        : 'Remove the ingress rule that is open to the internet',
      rationale:
        'Public access is removed and nothing is added. If the traffic is still needed, allow only the narrowest CIDR, prefix list or security group that requires it. For administrative access prefer AWS Systems Manager Session Manager over opening ports 22 or 3389. Review first: clients that relied on the public path will lose connectivity.',
      reviewRequired: true,
      anchor: '/ingress',
      operations: [{ op: 'set', path: '/ingress', value: nextIngress }],
      before: renderJson(rule),
      after: hasOtherSources ? renderJson(narrowed) : '',
    }),
  };
}
export const unrestrictedIngress = {
  id: 'PG-NET-001',
  category: 'NET',
  title: 'Security group allows unrestricted ingress from the internet',
  description:
    'An ingress rule allows 0.0.0.0/0 or ::/0 to reach a port other than TCP 80 or 443. Administrative ports (22, 3389) and all-traffic rules are critical, common data-store ports are high, anything else is medium.',
  ward: 'Ward of the Open Gate',
  defaultSeverity: 'CRITICAL',
  appliesTo: ['aws_security_group'],
  references: [CIS_SG_IPV4_ADMIN_PORTS, CIS_SG_IPV6_ADMIN_PORTS, FSBP_EC2_18],
  evaluate,
  remediate,
};
