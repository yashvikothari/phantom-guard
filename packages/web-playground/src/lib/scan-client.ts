import type { ScanReport } from '@phantomguard/core-engine';
// `?worker&inline` embeds the worker in the main bundle as a Blob, so starting a scan never
// makes a network request: the page is silent after it loads (Requirement 16.4). The CSP
// allows this through `worker-src blob:`.
import ScanWorker from '../workers/scan.worker?worker&inline';
import type { ScanRequestBody, ScanResponse } from '../workers/scan-protocol';

/** A scan that ran longer than the limit and was stopped (Requirement 12.4). */
export class ScanTimeoutError extends Error {
  constructor(milliseconds: number) {
    super(`The scan took longer than ${String(milliseconds / 1000)} seconds and was stopped.`);
    this.name = 'ScanTimeoutError';
  }
}

/** A scan that was replaced by a newer request before it finished. Callers ignore it. */
export class ScanSupersededError extends Error {
  constructor() {
    super('The scan was replaced by a newer one.');
    this.name = 'ScanSupersededError';
  }
}

interface Pending {
  readonly resolve: (report: ScanReport) => void;
  readonly reject: (error: Error) => void;
  readonly timer: ReturnType<typeof setTimeout>;
}

export const SCAN_TIMEOUT_MS = 5000;

/**
 * Talks to the scan worker. At most one scan is in flight: a newer request supersedes the
 * older one, and a scan that exceeds the time limit terminates the worker, which is then
 * re-created on the next request.
 */
export class ScanClient {
  private worker: Worker | undefined;
  private nextId = 1;
  private pending: { readonly id: number; readonly entry: Pending } | undefined;

  constructor(private readonly timeoutMs: number = SCAN_TIMEOUT_MS) {}

  run(body: ScanRequestBody): Promise<ScanReport> {
    this.settle(new ScanSupersededError());
    const worker = this.ensureWorker();
    const id = this.nextId;
    this.nextId += 1;

    return new Promise<ScanReport>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.terminate();
        this.settle(new ScanTimeoutError(this.timeoutMs));
      }, this.timeoutMs);
      this.pending = { id, entry: { resolve, reject, timer } };
      worker.postMessage({ ...body, id });
    });
  }

  /** Start the worker now, so the first scan does not pay for creating it. */
  warm(): void {
    this.ensureWorker();
  }

  /** Stop the worker and reject anything still waiting. Call when the owner goes away. */
  dispose(): void {
    this.settle(new ScanSupersededError());
    this.terminate();
  }

  private ensureWorker(): Worker {
    if (this.worker !== undefined) {
      return this.worker;
    }
    const worker = new ScanWorker();
    worker.onmessage = (event: MessageEvent<ScanResponse>) => {
      const response = event.data;
      if (this.pending?.id !== response.id) {
        return; // a stale answer from a superseded request
      }
      const { entry } = this.pending;
      this.pending = undefined;
      clearTimeout(entry.timer);
      if (response.ok) {
        entry.resolve(response.report);
      } else {
        entry.reject(new Error(response.error));
      }
    };
    worker.onerror = () => {
      this.terminate();
      this.settle(new Error('The scan worker failed to run.'));
    };
    this.worker = worker;
    return worker;
  }

  private settle(error: Error): void {
    if (this.pending === undefined) {
      return;
    }
    const { entry } = this.pending;
    this.pending = undefined;
    clearTimeout(entry.timer);
    entry.reject(error);
  }

  private terminate(): void {
    this.worker?.terminate();
    this.worker = undefined;
  }
}
