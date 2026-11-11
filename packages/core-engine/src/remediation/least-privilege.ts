/**
 * Least_Privilege_Format support for IAM patches (requirements.md, Requirement 10).
 *
 * Evidence precedence: observed usage on the resource, then this read-only
 * catalog, then no patch. The catalog deliberately lists READ-ONLY actions: a
 * wildcard replaced by write access would still be an over-grant that nobody
 * reviewed. Every IAM patch is marked reviewRequired.
 */

export type ActionSource = 'observed usage' | 'read-only catalog';

/** Read-only baseline per service prefix. Sorted, no wildcards. */
export const READ_ONLY_CATALOG: Readonly<Record<string, readonly string[]>> = {
  cloudwatch: ['cloudwatch:DescribeAlarms', 'cloudwatch:GetMetricData', 'cloudwatch:ListMetrics'],
  dynamodb: [
    'dynamodb:BatchGetItem',
    'dynamodb:DescribeTable',
    'dynamodb:GetItem',
    'dynamodb:Query',
    'dynamodb:Scan',
  ],
  ec2: ['ec2:DescribeInstances', 'ec2:DescribeSecurityGroups', 'ec2:DescribeVolumes'],
  kms: ['kms:Decrypt', 'kms:DescribeKey'],
  lambda: ['lambda:GetFunction', 'lambda:ListFunctions'],
  logs: ['logs:DescribeLogGroups', 'logs:DescribeLogStreams', 'logs:GetLogEvents'],
  s3: ['s3:GetObject', 's3:GetObjectVersion', 's3:ListBucket'],
  secretsmanager: ['secretsmanager:DescribeSecret', 'secretsmanager:GetSecretValue'],
  sns: ['sns:GetTopicAttributes', 'sns:ListTopics'],
  sqs: ['sqs:GetQueueAttributes', 'sqs:ReceiveMessage'],
  ssm: ['ssm:DescribeParameters', 'ssm:GetParameter', 'ssm:GetParameters'],
  sts: ['sts:GetCallerIdentity'],
};

export interface DerivedActions {
  readonly actions: readonly string[];
  readonly source: ActionSource;
}

/** Sorted, de-duplicated copy. Uses plain code-unit order so output is locale independent. */
export function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/** True when the action contains any wildcard character. */
export function hasWildcard(action: string): boolean {
  return action.includes('*') || action.includes('?');
}

/** Lower-cased service prefix of `s3:GetObject`, or undefined for `*` or a malformed action. */
export function servicePrefix(action: string): string | undefined {
  const separator = action.indexOf(':');
  if (separator <= 0) {
    return undefined;
  }
  return action.slice(0, separator).toLowerCase();
}

/** IAM action names are far shorter than this; longer input is hostile or malformed. */
const MAX_ACTION_LENGTH = 256;

/**
 * Case-insensitive glob match for IAM action patterns (`*` any run, `?` one character).
 * Iterative two-pointer algorithm with no regular expression, so hostile patterns
 * such as `*a*a*a*a*b` cannot cause catastrophic backtracking. Worst case is
 * O(pattern length x text length), and both are capped at MAX_ACTION_LENGTH.
 */
export function globMatch(pattern: string, text: string): boolean {
  if (pattern.length > MAX_ACTION_LENGTH || text.length > MAX_ACTION_LENGTH) {
    return false;
  }
  const glob = pattern.toLowerCase();
  const subject = text.toLowerCase();
  let p = 0;
  let t = 0;
  let starAt = -1;
  let resumeAt = 0;
  while (t < subject.length) {
    const token = glob[p];
    if (token !== undefined && (token === '?' || token === subject[t])) {
      p += 1;
      t += 1;
    } else if (token === '*') {
      starAt = p;
      resumeAt = t;
      p += 1;
    } else if (starAt !== -1) {
      p = starAt + 1;
      resumeAt += 1;
      t = resumeAt;
    } else {
      return false;
    }
  }
  while (glob[p] === '*') {
    p += 1;
  }
  return p === glob.length;
}

function actionMatcher(pattern: string): (action: string) => boolean {
  return (action) => globMatch(pattern, action);
}

/**
 * Derive an explicit action list that replaces `wildcards`, or undefined when
 * neither evidence nor the catalog can supply one.
 *
 * @param wildcards  the wildcard action patterns found in one statement
 * @param observed   actions seen in use for this principal (may be empty)
 */
export function deriveActions(
  wildcards: readonly string[],
  observed: readonly string[],
): DerivedActions | undefined {
  const matchers = wildcards.map(actionMatcher);
  const fromEvidence = sortedUnique(
    observed.filter(
      (action) => !hasWildcard(action) && matchers.some((matches) => matches(action)),
    ),
  );
  if (fromEvidence.length > 0) {
    return { actions: fromEvidence, source: 'observed usage' };
  }

  const services = new Set<string>();
  for (const pattern of wildcards) {
    if (pattern === '*' || pattern === '*:*') {
      return undefined; // a global wildcard cannot be narrowed without evidence
    }
    const service = servicePrefix(pattern);
    if (service === undefined || hasWildcard(service)) {
      return undefined;
    }
    services.add(service);
  }

  const fromCatalog: string[] = [];
  for (const service of services) {
    const entry = READ_ONLY_CATALOG[service];
    if (entry === undefined) {
      return undefined; // one unknown service makes the whole patch unsafe to guess
    }
    fromCatalog.push(...entry.filter((action) => matchers.some((matches) => matches(action))));
  }
  const actions = sortedUnique(fromCatalog);
  return actions.length > 0 ? { actions, source: 'read-only catalog' } : undefined;
}
