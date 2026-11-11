import * as fc from 'fast-check';
import type { HauntedResource, JsonObject, JsonValue } from '../../src/index.js';
import { makeResource } from '../support/resources.js';

const SERVICES = [
  's3',
  'ec2',
  'dynamodb',
  'sqs',
  'sns',
  'lambda',
  'logs',
  'kms',
  'secretsmanager',
  'ssm',
  'sts',
  'iam',
  'rds',
  'unknownsvc',
] as const;

const ACTION_NAMES = [
  'GetObject',
  'PutObject',
  'DeleteObject',
  'ListBucket',
  'DescribeInstances',
  'GetItem',
  'PutItem',
  'SendMessage',
  'ReceiveMessage',
  'CreateLogStream',
  'PutLogEvents',
  'Decrypt',
  'GetSecretValue',
  'GetParameter',
  'AssumeRole',
  'InvokeFunction',
] as const;

const PARTIAL_PREFIXES = ['Get', 'List', 'Describe', 'Put', 'Delete'] as const;

export const SCOPED_RESOURCES = [
  'arn:aws:s3:::bucket/*',
  'arn:aws:s3:::bucket',
  'arn:aws:dynamodb:us-east-1:123456789012:table/t',
  'arn:aws:sqs:us-east-1:123456789012:q',
  'arn:aws:logs:us-east-1:123456789012:log-group:/app/*',
] as const;

const service = fc.constantFrom(...SERVICES);

/** `s3:GetObject`: never contains a wildcard. */
export const explicitAction: fc.Arbitrary<string> = fc
  .tuple(service, fc.constantFrom(...ACTION_NAMES))
  .map(([name, action]) => `${name}:${action}`);

/** `*` or `*:*`. */
export const globalWildcard: fc.Arbitrary<string> = fc.constantFrom('*', '*:*');

/** `s3:*`. */
export const serviceWildcard: fc.Arbitrary<string> = service.map((name) => `${name}:*`);

/** `s3:Get*`. */
export const partialWildcard: fc.Arbitrary<string> = fc
  .tuple(service, fc.constantFrom(...PARTIAL_PREFIXES))
  .map(([name, prefix]) => `${name}:${prefix}*`);

export const anyAction: fc.Arbitrary<string> = fc.oneof(
  explicitAction,
  serviceWildcard,
  partialWildcard,
  globalWildcard,
);

/** A Resource list: a bare "*", scoped ARNs, or a mix that still contains "*". */
export const resourceList: fc.Arbitrary<string[]> = fc.oneof(
  fc.constant(['*']),
  fc.array(fc.constantFrom(...SCOPED_RESOURCES), { minLength: 1, maxLength: 3 }),
  fc
    .array(fc.constantFrom(...SCOPED_RESOURCES), { minLength: 1, maxLength: 2 })
    .map((list) => ['*', ...list]),
);

/** The generator's own model of a statement. The oracle in each test reads this, not the JSON. */
export interface GeneratedStatement {
  readonly effect: 'Allow' | 'Deny';
  readonly actions: readonly string[];
  readonly notActions: readonly string[];
  readonly resources: readonly string[];
  readonly sid: string | undefined;
  readonly hasCondition: boolean;
  /** Render single-element lists as a plain string, as IAM allows. */
  readonly scalar: boolean;
}

const sid = fc.constantFrom<string | undefined>(undefined, 'Alpha', 'Beta');

/** A statement that uses `Action`. */
export function actionStatement(
  actions: fc.Arbitrary<string[]> = fc.array(anyAction, { minLength: 1, maxLength: 4 }),
  effect: fc.Arbitrary<'Allow' | 'Deny'> = fc.constantFrom<'Allow' | 'Deny'>('Allow', 'Deny'),
): fc.Arbitrary<GeneratedStatement> {
  return fc
    .record({
      effect,
      actions,
      resources: resourceList,
      sid,
      hasCondition: fc.boolean(),
      scalar: fc.boolean(),
    })
    .map((statement) => ({ ...statement, notActions: [] }));
}

/** A statement that uses `NotAction` instead of `Action`. */
export function notActionStatement(
  effect: fc.Arbitrary<'Allow' | 'Deny'> = fc.constantFrom<'Allow' | 'Deny'>('Allow', 'Deny'),
): fc.Arbitrary<GeneratedStatement> {
  return fc
    .record({
      effect,
      notActions: fc.array(explicitAction, { minLength: 1, maxLength: 2 }),
      resources: resourceList,
      sid,
      hasCondition: fc.boolean(),
      scalar: fc.boolean(),
    })
    .map((statement) => ({ ...statement, actions: [] }));
}

/** Mostly Action statements, sometimes NotAction. */
export const anyStatement: fc.Arbitrary<GeneratedStatement> = fc.oneof(
  actionStatement(),
  actionStatement(),
  actionStatement(),
  notActionStatement(),
);

function listOrScalar(list: readonly string[], scalar: boolean): JsonValue {
  const [only] = list;
  return scalar && list.length === 1 && only !== undefined ? only : [...list];
}

export function statementToJson(statement: GeneratedStatement): JsonObject {
  return {
    ...(statement.sid === undefined ? {} : { Sid: statement.sid }),
    Effect: statement.effect,
    ...(statement.notActions.length > 0
      ? { NotAction: listOrScalar(statement.notActions, statement.scalar) }
      : { Action: listOrScalar(statement.actions, statement.scalar) }),
    Resource: listOrScalar(statement.resources, statement.scalar),
    ...(statement.hasCondition
      ? { Condition: { StringEquals: { 'aws:PrincipalOrgID': 'o-example' } } }
      : {}),
  };
}

// A type alias (not an interface) so that it is assignable to JSON data.
export type ObservedUsage = {
  readonly actions: string[];
  readonly resources: string[];
};

/** Optional usage evidence: what the principal was seen calling. */
export const observedUsage: fc.Arbitrary<ObservedUsage | undefined> = fc.oneof(
  fc.constant<ObservedUsage | undefined>(undefined),
  fc.record({
    actions: fc.array(explicitAction, { maxLength: 6 }),
    resources: fc.array(fc.constantFrom(...SCOPED_RESOURCES), { maxLength: 3 }),
  }),
);

export function toPolicyResource(
  statements: readonly GeneratedStatement[],
  usage?: ObservedUsage,
): HauntedResource {
  return makeResource('aws_iam_policy', {
    document: { Version: '2012-10-17', Statement: statements.map(statementToJson) },
    ...(usage === undefined ? {} : { observedUsage: usage }),
  });
}

/** A whole policy: its statements (the model) and the resource built from them. */
export const policy: fc.Arbitrary<{
  statements: GeneratedStatement[];
  resource: HauntedResource;
}> = fc
  .tuple(fc.array(anyStatement, { minLength: 1, maxLength: 5 }), observedUsage)
  .map(([statements, usage]) => ({ statements, resource: toPolicyResource(statements, usage) }));
