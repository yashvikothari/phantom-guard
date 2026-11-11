/** Deepest structure the engine will copy. Parsers cap input nesting well below this. */
const MAX_DEPTH = 128;

function cloneValue(value: unknown, depth: number): unknown {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (depth > MAX_DEPTH) {
    throw new RangeError(`structure is nested deeper than ${String(MAX_DEPTH)} levels`);
  }
  if (Array.isArray(value)) {
    return Object.freeze(value.map((item: unknown) => cloneValue(item, depth + 1)));
  }
  // Object.fromEntries defines own data properties, so a key named "__proto__"
  // stays plain data and can never change a prototype.
  return Object.freeze(
    Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, cloneValue(item, depth + 1)] as const),
    ),
  );
}

/** Deep copy of plain data (objects, arrays, primitives) that is frozen at every level. */
export function cloneFrozen<T>(value: T): T {
  return cloneValue(value, 0) as T;
}
