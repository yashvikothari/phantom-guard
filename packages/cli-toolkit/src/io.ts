export type StdinResult =
  { readonly ok: true; readonly text: string } | { readonly ok: false; readonly error: string };

/**
 * Everything the commands need from the outside world. `main` takes this instead
 * of touching `process`, so the whole CLI can be driven by tests.
 */
export interface CliIo {
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
  readonly stdoutIsTTY: boolean;
  readonly env: Readonly<Record<string, string | undefined>>;
  /** Read all of standard input, failing once it exceeds `maxBytes`. */
  readonly readStdin: (maxBytes: number) => Promise<StdinResult>;
}
