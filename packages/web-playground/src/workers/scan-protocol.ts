import type { ConfigFormat, HauntedResource, ScanReport } from '@phantomguard/core-engine';

/** What the main thread asks the scan worker to do. Both kinds are pure functions of their input. */
export type ScanRequestBody =
  | { readonly kind: 'resources'; readonly resources: readonly HauntedResource[] }
  | { readonly kind: 'text'; readonly text: string; readonly format: ConfigFormat | undefined };

export type ScanRequest = ScanRequestBody & { readonly id: number };

export type ScanResponse =
  | { readonly id: number; readonly ok: true; readonly report: ScanReport }
  | { readonly id: number; readonly ok: false; readonly error: string };
