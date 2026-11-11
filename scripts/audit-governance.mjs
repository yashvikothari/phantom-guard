#!/usr/bin/env node
/**
 * PhantomGuard governance audit.
 *
 * Fails (exit 1) when the Kiro governance architecture that the Kiroween
 * submission depends on is incomplete or broken:
 *   1. every required file exists and is non-empty;
 *   2. hook and MCP files are valid JSON with the expected shape;
 *   3. no required file is matched by .gitignore;
 *   4. LICENSE is the MIT license (GitHub license detection);
 *   5. every `_Requirements: x.y_` reference in tasks.md points at a real
 *      acceptance criterion in requirements.md (traceability);
 *   6. every requirement criterion is referenced by at least one task;
 *   7. every `Validates: Requirements X.Y` tag in design.md and in property tests
 *      names a real acceptance criterion.
 *
 * Uses only Node built-ins. No shell is spawned (execFileSync).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SPEC_DIR = '.kiro/specs/phantom-guard';

const REQUIRED_FILES = [
  'LICENSE',
  '.gitignore',
  'package.json',
  `${SPEC_DIR}/requirements.md`,
  `${SPEC_DIR}/design.md`,
  `${SPEC_DIR}/tasks.md`,
  '.kiro/steering/product.md',
  '.kiro/steering/tech.md',
  '.kiro/steering/secops-guardrails.md',
  '.kiro/hooks/sync-rule-tests.json',
  '.kiro/hooks/pre-commit-audit.json',
  '.kiro/settings/mcp.json',
  'packages/core-engine/package.json',
  'packages/cli-toolkit/package.json',
  'packages/web-playground/package.json',
];

const errors = [];
const notes = [];
const fail = (message) => errors.push(message);

function read(relativePath) {
  return readFileSync(join(ROOT, relativePath), 'utf8');
}

// 1. Required files exist and are non-empty -----------------------------------
for (const file of REQUIRED_FILES) {
  const absolute = join(ROOT, file);
  if (!existsSync(absolute)) {
    fail(`missing required file: ${file}`);
  } else if (statSync(absolute).size === 0) {
    fail(`required file is empty: ${file}`);
  }
}

// 2. JSON shape ---------------------------------------------------------------
function readJson(file) {
  try {
    return JSON.parse(read(file));
  } catch (error) {
    fail(`${file} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}

for (const file of ['.kiro/hooks/sync-rule-tests.json', '.kiro/hooks/pre-commit-audit.json']) {
  if (!existsSync(join(ROOT, file))) continue;
  const hookFile = readJson(file);
  if (hookFile === undefined) continue;
  if (!Array.isArray(hookFile.hooks) || hookFile.hooks.length === 0) {
    fail(`${file} must contain a non-empty "hooks" array`);
    continue;
  }
  for (const [index, hook] of hookFile.hooks.entries()) {
    const label = `${file} hooks[${index}]`;
    if (typeof hook.name !== 'string' || hook.name.length === 0) fail(`${label} needs a "name"`);
    if (typeof hook.trigger !== 'string') fail(`${label} needs a "trigger"`);
    const type = hook.action?.type;
    if (type !== 'command' && type !== 'agent') {
      fail(`${label} action.type must be "command" or "agent"`);
    } else if (type === 'command' && typeof hook.action.command !== 'string') {
      fail(`${label} command action needs a "command" string`);
    } else if (type === 'agent' && typeof hook.action.prompt !== 'string') {
      fail(`${label} agent action needs a "prompt" string`);
    }
    if (typeof hook.matcher === 'string') {
      try {
        new RegExp(hook.matcher);
      } catch {
        fail(`${label} matcher is not a valid regular expression: ${hook.matcher}`);
      }
    }
  }
}

if (existsSync(join(ROOT, '.kiro/settings/mcp.json'))) {
  const mcp = readJson('.kiro/settings/mcp.json');
  if (mcp !== undefined) {
    const servers = mcp.mcpServers;
    if (typeof servers !== 'object' || servers === null || Object.keys(servers).length === 0) {
      fail('.kiro/settings/mcp.json needs a non-empty "mcpServers" object');
    } else {
      for (const [name, server] of Object.entries(servers)) {
        if (typeof server.command !== 'string') fail(`mcp server "${name}" needs a "command"`);
        if (!Array.isArray(server.args)) fail(`mcp server "${name}" needs an "args" array`);
      }
    }
  }
}

// 3. Nothing required is git-ignored ------------------------------------------
function insideGitWorkTree() {
  try {
    return (
      execFileSync('git', ['rev-parse', '--is-inside-work-tree'], {
        cwd: ROOT,
        stdio: ['ignore', 'pipe', 'ignore'],
      })
        .toString()
        .trim() === 'true'
    );
  } catch {
    return false;
  }
}

if (insideGitWorkTree()) {
  for (const file of REQUIRED_FILES) {
    try {
      // Exit status 0 means "ignored"; execFileSync throws on non-zero (not ignored).
      execFileSync('git', ['check-ignore', '--quiet', '--no-index', file], {
        cwd: ROOT,
        stdio: 'ignore',
      });
      fail(`${file} is matched by .gitignore; governance files must be tracked`);
    } catch {
      // Not ignored: the expected outcome.
    }
  }
} else {
  notes.push('not inside a git work tree: skipped .gitignore checks');
}

// 4. LICENSE ------------------------------------------------------------------
if (existsSync(join(ROOT, 'LICENSE'))) {
  const license = read('LICENSE');
  if (!license.startsWith('MIT License')) fail('LICENSE must start with "MIT License"');
  if (!/Permission is hereby granted, free of charge/.test(license)) {
    fail('LICENSE does not contain the standard MIT grant text');
  }
}

// 5 + 6. Requirement traceability ---------------------------------------------
function collectCriteria(markdown) {
  const ids = new Set();
  let requirement = null;
  for (const line of markdown.split('\n')) {
    const heading = /^###\s+Requirement\s+(\d+)\b/.exec(line);
    if (heading) {
      requirement = heading[1];
      continue;
    }
    const criterion = /^(\d+)\.\s+(?:WHEN|WHILE|IF|WHERE|THE)\b/.exec(line);
    if (criterion && requirement !== null) ids.add(`${requirement}.${criterion[1]}`);
  }
  return ids;
}

function collectReferences(markdown) {
  const refs = new Map();
  for (const [index, line] of markdown.split('\n').entries()) {
    const match = /_Requirements?:\s*([^_]+)_/.exec(line);
    if (!match) continue;
    for (const id of match[1].split(',').map((part) => part.trim())) {
      if (id.length > 0) refs.set(id, [...(refs.get(id) ?? []), index + 1]);
    }
  }
  return refs;
}

const requirementsPath = `${SPEC_DIR}/requirements.md`;
const tasksPath = `${SPEC_DIR}/tasks.md`;
if (existsSync(join(ROOT, requirementsPath)) && existsSync(join(ROOT, tasksPath))) {
  const known = collectCriteria(read(requirementsPath));
  const referenced = collectReferences(read(tasksPath));
  if (known.size === 0) fail(`${requirementsPath} has no parsable acceptance criteria`);
  for (const [id, lines] of referenced) {
    if (!/^\d+\.\d+$/.test(id)) {
      fail(`${tasksPath}:${lines[0]} has a malformed requirement reference "${id}"`);
    } else if (!known.has(id)) {
      fail(`${tasksPath}:${lines[0]} references unknown acceptance criterion ${id}`);
    }
  }
  const uncovered = [...known].filter((id) => !referenced.has(id));
  if (uncovered.length > 0) {
    fail(
      `${uncovered.length} acceptance criteria are not referenced by any task: ${uncovered.join(', ')}`,
    );
  }
  notes.push(`traceability: ${known.size} criteria, ${referenced.size} referenced by tasks`);
}

// 7. `Validates: Requirements X.Y` tags must name real criteria ---------------
// design.md properties and property tests both carry these tags (Requirement 22.5).
// The sync-rule-tests hook generates new ones, so a typo must fail the audit, not rot silently.
function walk(directory) {
  const found = [];
  if (!existsSync(directory)) return found;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...walk(path));
    else found.push(path);
  }
  return found;
}

if (existsSync(join(ROOT, requirementsPath))) {
  const known = collectCriteria(read(requirementsPath));
  const taggedFiles = [`${SPEC_DIR}/design.md`];
  for (const packageDir of ['core-engine', 'cli-toolkit', 'web-playground']) {
    for (const absolute of walk(join(ROOT, 'packages', packageDir, 'test'))) {
      if (/\.test\.tsx?$/.test(absolute)) taggedFiles.push(relative(ROOT, absolute));
    }
  }
  let tags = 0;
  for (const file of taggedFiles) {
    if (!existsSync(join(ROOT, file))) continue;
    for (const [index, line] of read(file).split('\n').entries()) {
      const match = /Validates:\s*Requirements?\s+([0-9.,\s]+)/.exec(line);
      if (!match?.[1]) continue;
      for (const id of match[1].split(',').map((part) => part.trim().replace(/\.$/, ''))) {
        if (id === '') continue;
        tags += 1;
        if (!known.has(id))
          fail(`${file}:${index + 1} validates unknown acceptance criterion ${id}`);
      }
    }
  }
  notes.push(`validates tags: ${tags} checked in ${taggedFiles.length} file(s)`);
}

// Report ----------------------------------------------------------------------
for (const note of notes) console.log(`note: ${note}`);
if (errors.length > 0) {
  console.error(
    `\nGovernance audit FAILED (${errors.length} problem${errors.length === 1 ? '' : 's'}):`,
  );
  for (const message of errors) console.error(`  - ${message}`);
  process.exit(1);
}
console.log('Governance audit passed.');
