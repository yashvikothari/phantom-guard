const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
export function isJsonObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
/** Own-property read. Prototype members (`constructor`, `__proto__`, ...) are never returned. */
export function member(object, key) {
  return hasOwn(object, key) ? object[key] : undefined;
}
export function stringMember(object, key) {
  const value = member(object, key);
  return typeof value === 'string' ? value : undefined;
}
export function booleanMember(object, key) {
  const value = member(object, key);
  return typeof value === 'boolean' ? value : undefined;
}
export function numberMember(object, key) {
  const value = member(object, key);
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
export function objectMember(object, key) {
  const value = member(object, key);
  return isJsonObject(value) ? value : undefined;
}
/** The array at `key`, or an empty array when absent or not an array. */
export function arrayMember(object, key) {
  const value = member(object, key);
  return Array.isArray(value) ? value : [];
}
/** Only the string items of the array at `key`. */
export function stringArrayMember(object, key) {
  return arrayMember(object, key).filter((item) => typeof item === 'string');
}
/** The array at `key` as numbers; non-numbers become NaN so that indexes stay aligned. */
export function numberArrayMember(object, key) {
  return arrayMember(object, key).map((item) =>
    typeof item === 'number' && Number.isFinite(item) ? item : Number.NaN,
  );
}
