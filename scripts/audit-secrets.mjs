#!/usr/bin/env node
/**
 * PhantomGuard staged-secrets audit.
 *
 * Scans the STAGED version of every added/changed file (what a commit would
 * actually record) for credentials. Exit 1 on any hit; secret values are never
 * printed, only file, line and rule name.
 *
 * Suppress a deliberate fixture line by including the marker
 * `phantomguard:allow-secret` on the same line. AWS's documented example
 * credentials (anything containing "EXAMPLE") are always allowed.
 *
 * Uses only Node built-ins. No shell is spawned (execFileSync).
 */
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MAX_BYTES = 1024 * 1024;
const ALLOW_MARKER = 'phantomguard:allow-secret';

/** Filenames that must never be committed. */
const FORBIDDEN_NAMES = [
  { name: 'dotenv file', test: (path) => /(^|\/)\.env(\.(?!example$)[^/]+)?$/.test(path) },
  { name: 'private key file', test: (path) => /\.(pem|key|p12|pfx)$/.test(path) },
  { name: 'SSH private key', test: (path) => /(^|\/)id_(rsa|dsa|ecdsa|ed25519)$/.test(path) },
];

/** Content rules. Each regex must match the credential itself, not surrounding prose. */
const CONTENT_RULES = [
  { name: 'AWS access key id', pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  {
    name: 'AWS secret access key assignment',
    pattern: /aws_?secret_?access_?key["']?\s*[:=]\s*["']?[A-Za-z0-9/+=]{40}\b/i,
  },
  {
    name: 'private key block',
    pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY(?: BLOCK)?-----/,
  },
  { name: 'GitHub token', pattern: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/ },
  { name: 'Slack token', pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/ },
  { name: 'Netlify personal access token', pattern: /\bnfp_[A-Za-z0-9]{36,}\b/ },
];

function git(args, options = {}) {
  return execFileSync('git', args, { cwd: ROOT, maxBuffer: 64 * 1024 * 1024, ...options });
}

let stagedFiles;
try {
  git(['rev-parse', '--is-inside-work-tree'], { stdio: ['ignore', 'pipe', 'ignore'] });
  stagedFiles = git(['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'])
    .toString('utf8')
    .split('\0')
    .filter((entry) => entry.length > 0);
} catch {
  console.log('Secrets audit skipped: not inside a git work tree.');
  process.exit(0);
}

if (stagedFiles.length === 0) {
  console.log('Secrets audit passed: nothing staged.');
  process.exit(0);
}

const problems = [];

for (const file of stagedFiles) {
  for (const rule of FORBIDDEN_NAMES) {
    if (rule.test(file)) problems.push(`${file}: forbidden ${rule.name}`);
  }

  let buffer;
  try {
    buffer = git(['show', `:${file}`], { stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    continue;
  }
  if (buffer.length > MAX_BYTES || buffer.includes(0)) continue; // too large or binary

  const lines = buffer.toString('utf8').split('\n');
  for (const [index, line] of lines.entries()) {
    if (line.includes(ALLOW_MARKER) || line.includes('EXAMPLE')) continue;
    for (const rule of CONTENT_RULES) {
      if (rule.pattern.test(line)) problems.push(`${file}:${index + 1}: possible ${rule.name}`);
    }
  }
}

if (problems.length > 0) {
  console.error(
    `\nSecrets audit FAILED (${problems.length} finding${problems.length === 1 ? '' : 's'}):`,
  );
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error(
    `\nRemove the credential and rotate it if it was ever pushed. For a deliberate fake fixture, add "${ALLOW_MARKER}" to that line.`,
  );
  process.exit(1);
}
console.log(`Secrets audit passed: ${stagedFiles.length} staged file(s) scanned.`);
