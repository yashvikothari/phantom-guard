import { scan, scanText } from '@phantomguard/core-engine';
import type { ScanRequest, ScanResponse } from './scan-protocol';

/**
 * Runs the engine off the main thread (Requirement 20.1). The `DOM` lib is loaded for the
 * app, so the worker scope is described by the two members this file uses.
 */
interface WorkerScope {
  onmessage: ((event: MessageEvent<ScanRequest>) => void) | null;
  postMessage(message: ScanResponse): void;
}

const scope = self as unknown as WorkerScope;

scope.onmessage = (event) => {
  const request = event.data;
  try {
    const report =
      request.kind === 'resources'
        ? scan(request.resources)
        : scanText(request.text, request.format === undefined ? {} : { format: request.format });
    scope.postMessage({ id: request.id, ok: true, report });
  } catch (error) {
    scope.postMessage({
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : 'The scan failed unexpectedly.',
    });
  }
};
