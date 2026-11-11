import type { JsonObject, JsonValue } from '../../contracts/json.js';

/** One IAM policy statement in a uniform shape. Every list is empty when the key is absent. */
export interface NormalizedStatement {
  /** Zero-based position in the policy's Statement list. */
  readonly index: number;
  readonly sid?: string;
  readonly effect: 'Allow' | 'Deny' | undefined;
  readonly actions: readonly string[];
  readonly notActions: readonly string[];
  readonly resources: readonly string[];
  readonly notResources: readonly string[];
  readonly hasCondition: boolean;
  /** Raw Principal value, if present. */
  readonly principal: JsonValue | undefined;
  readonly raw: JsonObject;
}

const hasOwn = (object: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(object, key);

function isObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** IAM allows a string or a list for Action, Resource and friends. Non-string items are ignored. */
function stringList(value: JsonValue | undefined): readonly string[] {
  if (typeof value === 'string') {
    return [value];
  }
  if (Array.isArray(value)) {
    return (value as readonly JsonValue[]).filter(
      (item): item is string => typeof item === 'string',
    );
  }
  return [];
}

function member(object: JsonObject, key: string): JsonValue | undefined {
  return hasOwn(object, key) ? object[key] : undefined;
}

/** True when the document keeps `Statement` as an array (patches rely on that). */
export function statementIsArray(document: JsonValue | undefined): boolean {
  return isObject(document) && Array.isArray(member(document, 'Statement'));
}

function normalizeStatement(
  item: JsonValue | undefined,
  index: number,
): NormalizedStatement | undefined {
  if (!isObject(item)) {
    return undefined;
  }
  const effect = member(item, 'Effect');
  const sid = member(item, 'Sid');
  const condition = member(item, 'Condition');
  return {
    index,
    ...(typeof sid === 'string' ? { sid } : {}),
    effect: effect === 'Allow' || effect === 'Deny' ? effect : undefined,
    actions: stringList(member(item, 'Action')),
    notActions: stringList(member(item, 'NotAction')),
    resources: stringList(member(item, 'Resource')),
    notResources: stringList(member(item, 'NotResource')),
    hasCondition: isObject(condition) && Object.keys(condition).length > 0,
    principal: member(item, 'Principal'),
    raw: item,
  };
}

/** `Statement` may be a single object or a list; always return a list. */
function statementList(document: JsonValue | undefined): readonly JsonValue[] {
  if (!isObject(document)) {
    return [];
  }
  const statement = member(document, 'Statement');
  if (Array.isArray(statement)) {
    return statement as readonly JsonValue[];
  }
  return statement === undefined ? [] : [statement];
}

/** Read the statements of a policy document. Accepts both `Statement: {...}` and `Statement: [...]`. */
export function readStatements(document: JsonValue | undefined): readonly NormalizedStatement[] {
  return statementList(document).flatMap((item, index) => {
    const statement = normalizeStatement(item, index);
    return statement === undefined ? [] : [statement];
  });
}

/**
 * Read one statement by its zero-based index in O(1). Use this instead of
 * `readStatements(...).find(...)` when handling many findings of one document,
 * which would otherwise re-normalize the whole policy once per finding.
 */
export function readStatementAt(
  document: JsonValue | undefined,
  index: number,
): NormalizedStatement | undefined {
  return normalizeStatement(statementList(document)[index], index);
}

/** True when a Principal grants access to everyone: `"*"`, `{"AWS": "*"}` or a list containing `"*"`. */
export function isPublicPrincipal(principal: JsonValue | undefined): boolean {
  if (principal === '*') {
    return true;
  }
  if (isObject(principal)) {
    return stringList(member(principal, 'AWS')).includes('*');
  }
  return false;
}

/** 1-based source line of statement `index`, when the parser recorded `statementLines`. */
export function statementLine(attributes: JsonObject, index: number): number | undefined {
  const lines = member(attributes, 'statementLines');
  if (!Array.isArray(lines)) {
    return undefined;
  }
  const line = (lines as readonly JsonValue[])[index];
  return typeof line === 'number' && Number.isInteger(line) && line > 0 ? line : undefined;
}

/** Short label for messages: `#2 (Sid "S3All")` or `#2`. */
export function describeStatement(statement: NormalizedStatement): string {
  const position = `#${String(statement.index + 1)}`;
  return statement.sid === undefined ? position : `${position} (Sid "${statement.sid}")`;
}
