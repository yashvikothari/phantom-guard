const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
/** IAM allows a string or a list for Action, Resource and friends. Non-string items are ignored. */
function stringList(value) {
  if (typeof value === 'string') {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.filter((item) => typeof item === 'string');
  }
  return [];
}
function member(object, key) {
  return hasOwn(object, key) ? object[key] : undefined;
}
/** True when the document keeps `Statement` as an array (patches rely on that). */
export function statementIsArray(document) {
  return isObject(document) && Array.isArray(member(document, 'Statement'));
}
function normalizeStatement(item, index) {
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
function statementList(document) {
  if (!isObject(document)) {
    return [];
  }
  const statement = member(document, 'Statement');
  if (Array.isArray(statement)) {
    return statement;
  }
  return statement === undefined ? [] : [statement];
}
/** Read the statements of a policy document. Accepts both `Statement: {...}` and `Statement: [...]`. */
export function readStatements(document) {
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
export function readStatementAt(document, index) {
  return normalizeStatement(statementList(document)[index], index);
}
/** True when a Principal grants access to everyone: `"*"`, `{"AWS": "*"}` or a list containing `"*"`. */
export function isPublicPrincipal(principal) {
  if (principal === '*') {
    return true;
  }
  if (isObject(principal)) {
    return stringList(member(principal, 'AWS')).includes('*');
  }
  return false;
}
/** 1-based source line of statement `index`, when the parser recorded `statementLines`. */
export function statementLine(attributes, index) {
  const lines = member(attributes, 'statementLines');
  if (!Array.isArray(lines)) {
    return undefined;
  }
  const line = lines[index];
  return typeof line === 'number' && Number.isInteger(line) && line > 0 ? line : undefined;
}
/** Short label for messages: `#2 (Sid "S3All")` or `#2`. */
export function describeStatement(statement) {
  const position = `#${String(statement.index + 1)}`;
  return statement.sid === undefined ? position : `${position} (Sid "${statement.sid}")`;
}
