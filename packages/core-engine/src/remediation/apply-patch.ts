import type { ExorcismPatch } from '../contracts/exorcism-patch.js';
import type { HauntedResource } from '../contracts/haunted-resource.js';
import type { JsonObject, JsonValue } from '../contracts/json.js';
import { cloneFrozen } from '../util/clone.js';
import { jsonEqual } from '../util/json-equal.js';
import { getAtPointer, setAtPointer } from '../util/json-pointer.js';

export type ApplyPatchResult =
  | { readonly ok: true; readonly resource: HauntedResource }
  | { readonly ok: false; readonly error: string };

/**
 * Apply an ExorcismPatch to the resource it targets and return a NEW frozen
 * resource. The input is never mutated.
 *
 * - A stale patch (its precondition no longer holds) is rejected, unless the
 *   patch is already in effect, in which case the unchanged resource is
 *   returned. That makes application idempotent.
 * - A missing path returns `{ ok: false }`; the input stays unchanged.
 */
export function applyPatch(resource: HauntedResource, patch: ExorcismPatch): ApplyPatchResult {
  if (patch.resourceId !== resource.id) {
    return {
      ok: false,
      error: `patch targets "${patch.resourceId}", not "${resource.id}"`,
    };
  }

  const alreadyApplied = patch.operations.every((operation) => {
    const current = getAtPointer(resource.attributes, operation.path);
    return current.ok && jsonEqual(current.value, operation.value);
  });
  if (alreadyApplied) {
    return { ok: true, resource };
  }

  const guard = getAtPointer(resource.attributes, patch.precondition.path);
  if (patch.precondition.exists) {
    if (!guard.ok) {
      return { ok: false, error: `stale patch: ${guard.error}` };
    }
    if (!jsonEqual(guard.value, patch.precondition.equals)) {
      return {
        ok: false,
        error: `stale patch: the value at "${patch.precondition.path}" changed since the scan`,
      };
    }
  } else if (guard.ok) {
    return {
      ok: false,
      error: `stale patch: "${patch.precondition.path}" now exists but was absent at scan time`,
    };
  }

  let attributes: JsonValue = resource.attributes;
  for (const operation of patch.operations) {
    const next = setAtPointer(attributes, operation.path, operation.value);
    if (!next.ok) {
      return { ok: false, error: next.error };
    }
    attributes = next.value;
  }

  return {
    ok: true,
    resource: cloneFrozen({ ...resource, attributes: attributes as JsonObject }),
  };
}

/** Apply several patches in order. Stops at the first failure and returns it. */
export function applyPatches(
  resource: HauntedResource,
  patches: readonly ExorcismPatch[],
): ApplyPatchResult {
  let current = resource;
  for (const patch of patches) {
    const result = applyPatch(current, patch);
    if (!result.ok) {
      return result;
    }
    current = result.resource;
  }
  return { ok: true, resource: current };
}
