import type { CliIo, StdinResult } from './io.js';

async function readStdin(maxBytes: number): Promise<StdinResult> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of process.stdin as AsyncIterable<unknown>) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    size += buffer.length;
    if (size > maxBytes) {
      return {
        ok: false,
        error: `standard input is larger than the ${String(maxBytes)}-byte limit`,
      };
    }
    chunks.push(buffer);
  }
  return { ok: true, text: Buffer.concat(chunks).toString('utf8') };
}

/** The real process streams, behind the CliIo interface. */
export function createProcessIo(): CliIo {
  return {
    stdout: (text) => {
      process.stdout.write(text);
    },
    stderr: (text) => {
      process.stderr.write(text);
    },
    stdoutIsTTY: process.stdout.isTTY === true,
    env: process.env,
    readStdin,
  };
}
