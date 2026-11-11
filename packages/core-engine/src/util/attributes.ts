import type { JsonObject, JsonValue } from '../contracts/json.js';

const hasOwn = (object: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(object, key);

export function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Own-property read. Prototype members (`constructor`, `__proto__`, ...) are never returned. */
export function member(object: JsonObject, key: string): JsonValue | undefined {
  return hasOwn(object, key) ? object[key] : undefined;
}

export function stringMember(object: JsonObject, key: string): string | undefined {
  const value = member(object, key);
  return typeof value === 'string' ? value : undefined;
}

export function booleanMember(object: JsonObject, key: string): boolean | undefined {
  const value = member(object, key);
  return typeof value === 'boolean' ? value : undefined;
}

export function numberMember(object: JsonObject, key: string): number | undefined {
  const value = member(object, key);
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function objectMember(object: JsonObject, key: string): JsonObject | undefined {
  const value = member(object, key);
  return isJsonObject(value) ? value : undefined;
}

/** The array at `key`, or an empty array when absent or not an array. */
export function arrayMember(object: JsonObject, key: string): readonly JsonValue[] {
  const value = member(object, key);
  return Array.isArray(value) ? (value as readonly JsonValue[]) : [];
}

/** Only the string items of the array at `key`. */
export function stringArrayMember(object: JsonObject, key: string): readonly string[] {
  return arrayMember(object, key).filter((item): item is string => typeof item === 'string');
}

/** The array at `key` as numbers; non-numbers become NaN so that indexes stay aligned. */
export function numberArrayMember(object: JsonObject, key: string): readonly number[] {
  return arrayMember(object, key).map((item) =>
    typeof item === 'number' && Number.isFinite(item) ? item : Number.NaN,
  );
}
