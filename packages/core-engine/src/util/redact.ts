import type { JsonValue } from '../contracts/json.js';

export const REDACTED = '[REDACTED]';

const SENSITIVE_KEY = /password|secret|token|access[_-]?key/i;

/** True for attribute names whose values must never appear in messages, previews or diffs. */
export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY.test(key);
}

/** Keys that name the entry in a name/value pair: ECS `environment`, CloudFormation tags, and similar. */
const PAIR_NAME_KEYS: readonly string[] = ['name', 'Name', 'key', 'Key'];
const PAIR_VALUE_KEYS: readonly string[] = ['value', 'Value'];

/** True for `{ "name": "DB_PASSWORD", "value": "..." }`: the secret sits under a harmless key. */
function namesSensitiveEntry(object: { readonly [key: string]: JsonValue }): boolean {
  return PAIR_NAME_KEYS.some((key) => {
    const name = Object.prototype.hasOwnProperty.call(object, key) ? object[key] : undefined;
    return typeof name === 'string' && isSensitiveKey(name);
  });
}

/**
 * Copy of `value` in which every value stored under a sensitive key is replaced by `[REDACTED]`.
 * Also masks the `value` of a name/value pair whose name is sensitive, for example the ECS
 * environment entry `{ "name": "DB_PASSWORD", "value": "hunter2" }`.
 */
export function redactSecrets(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return (value as readonly JsonValue[]).map((item) => redactSecrets(item));
  }
  if (typeof value === 'object' && value !== null) {
    const record = value as { readonly [key: string]: JsonValue };
    const pair = namesSensitiveEntry(record);
    return Object.fromEntries(
      Object.entries(record).map(([key, item]) => [
        key,
        isSensitiveKey(key) || (pair && PAIR_VALUE_KEYS.includes(key))
          ? REDACTED
          : redactSecrets(item),
      ]),
    );
  }
  return value;
}
