const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
/** JSON equality: arrays compare in order, objects compare by key set regardless of key order. */
export function jsonEqual(left, right) {
  if (left === right) {
    return true;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
      return false;
    }
    const leftItems = left;
    const rightItems = right;
    return leftItems.every((item, index) => {
      const other = rightItems[index];
      return other !== undefined && jsonEqual(item, other);
    });
  }
  if (isRecord(left) && isRecord(right)) {
    const leftKeys = Object.keys(left);
    if (leftKeys.length !== Object.keys(right).length) {
      return false;
    }
    return leftKeys.every((key) => {
      const a = left[key];
      const b = right[key];
      return hasOwn(right, key) && a !== undefined && b !== undefined && jsonEqual(a, b);
    });
  }
  return false;
}
