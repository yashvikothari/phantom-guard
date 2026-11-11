import * as fc from 'fast-check';
import type { HauntedResource, JsonObject, JsonValue, Severity } from '../../src/index.js';
import { makeResource } from '../support/resources.js';

export const SETTINGS = [
  'blockPublicAcls',
  'blockPublicPolicy',
  'ignorePublicAcls',
  'restrictPublicBuckets',
] as const;
export type Setting = (typeof SETTINGS)[number];

export type PolicyStatementKind =
  | 'allow-star'
  | 'allow-aws-star'
  | 'allow-aws-list'
  | 'allow-star-conditioned'
  | 'deny-star'
  | 'allow-named';

export interface GeneratedBucket {
  readonly acl: string | undefined;
  /** Undefined means the bucket declares no Block Public Access configuration. */
  readonly block: Readonly<Record<Setting, JsonValue | undefined>> | undefined;
  /** Undefined means the bucket has no policy. */
  readonly policy: readonly PolicyStatementKind[] | undefined;
}

/** Values a Block Public Access flag can hold, including look-alikes that are not boolean true. */
const flag = fc.constantFrom<JsonValue | undefined>(true, false, undefined, 'true', 1, null);

const acl = fc.constantFrom<string | undefined>(
  undefined,
  'private',
  'public-read',
  'public-read-write',
  'authenticated-read',
  'bucket-owner-full-control',
  'log-delivery-write',
  'PUBLIC-READ',
  '',
);

const statementKind = fc.constantFrom<PolicyStatementKind>(
  'allow-star',
  'allow-aws-star',
  'allow-aws-list',
  'allow-star-conditioned',
  'deny-star',
  'allow-named',
);

export const bucket: fc.Arbitrary<GeneratedBucket> = fc.record({
  acl,
  block: fc.option(
    fc.record({
      blockPublicAcls: flag,
      blockPublicPolicy: flag,
      ignorePublicAcls: flag,
      restrictPublicBuckets: flag,
    }),
    { nil: undefined },
  ),
  policy: fc.option(fc.array(statementKind, { maxLength: 4 }), { nil: undefined }),
});

const READ = { Action: 's3:GetObject', Resource: 'arn:aws:s3:::subject/*' } as const;

const STATEMENTS: Readonly<Record<PolicyStatementKind, JsonObject>> = {
  'allow-star': { Effect: 'Allow', Principal: '*', ...READ },
  'allow-aws-star': { Effect: 'Allow', Principal: { AWS: '*' }, ...READ },
  'allow-aws-list': {
    Effect: 'Allow',
    Principal: { AWS: ['arn:aws:iam::123456789012:root', '*'] },
    ...READ,
  },
  'allow-star-conditioned': {
    Effect: 'Allow',
    Principal: '*',
    ...READ,
    Condition: { StringEquals: { 'aws:PrincipalOrgID': 'o-example' } },
  },
  'deny-star': {
    Effect: 'Deny',
    Principal: '*',
    Action: 's3:*',
    Resource: 'arn:aws:s3:::subject/*',
    Condition: { Bool: { 'aws:SecureTransport': 'false' } },
  },
  'allow-named': {
    Effect: 'Allow',
    Principal: { AWS: 'arn:aws:iam::123456789012:root' },
    ...READ,
  },
};

export function toBucketResource(item: GeneratedBucket): HauntedResource {
  const block = item.block;
  const declared =
    block === undefined
      ? undefined
      : Object.fromEntries(
          SETTINGS.flatMap((setting): Array<[string, JsonValue]> => {
            const value = block[setting];
            return value === undefined ? [] : [[setting, value]];
          }),
        );
  return makeResource('aws_s3_bucket', {
    ...(item.acl === undefined ? {} : { acl: item.acl }),
    ...(declared === undefined ? {} : { publicAccessBlock: declared }),
    ...(item.policy === undefined
      ? {}
      : {
          policy: {
            Version: '2012-10-17',
            Statement: item.policy.map((kind) => STATEMENTS[kind]),
          },
        }),
  });
}

// Oracle, written from Requirement 7.6 to 7.10 and not from the rule's code.

function aclSeverity(value: string | undefined): Severity | undefined {
  switch (value) {
    case 'public-read-write':
    case 'public-read':
      return 'CRITICAL';
    case 'authenticated-read':
      return 'HIGH';
    default:
      return undefined;
  }
}

const PUBLIC_ALLOW: ReadonlySet<PolicyStatementKind> = new Set<PolicyStatementKind>([
  'allow-star',
  'allow-aws-star',
  'allow-aws-list',
  'allow-star-conditioned',
]);

export interface ExpectedFinding {
  readonly locationKey: string;
  readonly severity: Severity;
}

function enabled(item: GeneratedBucket, setting: Setting): boolean {
  return item.block?.[setting] === true;
}

export function expectedFindings(item: GeneratedBucket): ExpectedFinding[] {
  const expected: ExpectedFinding[] = [];
  const exposure = aclSeverity(item.acl);
  if (exposure !== undefined) {
    expected.push({
      locationKey: 'acl',
      severity: enabled(item, 'ignorePublicAcls') ? 'MEDIUM' : exposure,
    });
  }
  (item.policy ?? []).forEach((kind, index) => {
    if (PUBLIC_ALLOW.has(kind)) {
      expected.push({
        locationKey: `policy:statement:${String(index)}`,
        severity:
          kind === 'allow-star-conditioned' || enabled(item, 'restrictPublicBuckets')
            ? 'MEDIUM'
            : 'CRITICAL',
      });
    }
  });
  if (SETTINGS.some((setting) => !enabled(item, setting))) {
    expected.push({ locationKey: 'public-access-block', severity: 'MEDIUM' });
  }
  return expected;
}

/** True when the bucket is open today, so turning Block Public Access on would cut off access. */
export function opensAccess(item: GeneratedBucket): boolean {
  return (
    aclSeverity(item.acl) !== undefined ||
    (item.policy ?? []).some((kind) => PUBLIC_ALLOW.has(kind))
  );
}
