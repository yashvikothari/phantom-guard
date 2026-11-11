import type { JsonValue } from './json.js';

/**
 * One edit to `resource.attributes`. `path` is an RFC 6901 JSON Pointer.
 *
 * Semantics are "set": the parent container must exist; a missing object member
 * is created; an array index must already exist. Because a set always writes an
 * absolute value, applying a patch twice equals applying it once.
 */
export interface PatchOperation {
  readonly op: 'set';
  readonly path: string;
  readonly value: JsonValue;
}

/** What must hold at a pointer before a patch may be applied. */
export type PatchPrecondition =
  | { readonly path: string; readonly exists: true; readonly equals: JsonValue }
  | { readonly path: string; readonly exists: false };

export interface PatchPreview {
  /** Human-readable text of the affected configuration before the patch. */
  readonly before: string;
  /** The same text after the patch. */
  readonly after: string;
  /** Unified diff of `before` and `after`. */
  readonly unifiedDiff: string;
}

/**
 * A previewable fix for one Finding.
 *
 * A patch is computed against the resource state that was scanned. When several
 * patches target one resource, apply one, scan again, and repeat.
 */
export interface ExorcismPatch {
  /** `<ruleId>:<resourceId>:<locationKey>` */
  readonly id: string;
  readonly ruleId: string;
  readonly resourceId: string;
  readonly title: string;
  readonly rationale: string;
  /** True when the change can alter runtime behavior and needs a human decision. */
  readonly reviewRequired: boolean;
  /**
   * Stale-patch guard. The state at `precondition.path` in `resource.attributes`
   * must still match what was scanned, otherwise the resource changed since the
   * scan and applying would edit the wrong thing. A patch whose operations are
   * already in effect is accepted as a no-op instead, which keeps application
   * idempotent.
   */
  readonly precondition: PatchPrecondition;
  readonly operations: readonly PatchOperation[];
  readonly preview: PatchPreview;
}
