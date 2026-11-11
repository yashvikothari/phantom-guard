# @phantomguard/cli-toolkit

The `phantomguard` command: scan Dockerfiles and IAM policies for dangerous configuration from a terminal or a CI pipeline.

```text
phantomguard scan <path>... [-f format] [-o pretty|json|sarif] [--fail-on level]
phantomguard exorcise <path>... [-f format]
```

A path is a file, a directory (searched recursively; symbolic links are not followed) or `-` for standard input.

| Command | Does |
| --- | --- |
| `scan` | Reports findings. `pretty` for people, `json` for scripts (one document on stdout, nothing else), `sarif` 2.1.0 for GitHub code scanning. |
| `exorcise` | Prints the fix proposed for each finding as a unified diff. It never modifies a file. |

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | No finding at or above `--fail-on` (default `high`) |
| 1 | At least one finding at or above `--fail-on` |
| 2 | Usage error, an unreadable input, or an input that could not be analyzed. Outranks 1, so a pipeline never trusts a partial result. |

## Behavior worth knowing

- Colors appear only when standard output is a terminal and `NO_COLOR` is unset.
- `json` and `sarif` output is passed through `redactReport`, so values under keys such as `password` or `token` never appear.
- Text taken from file names and input is stripped of control characters before it reaches the terminal.
- Terraform files (`.tf`) are parsed; values that cannot be resolved from the text are reported as info messages, not guessed.

## Layout

```text
src/
├── cli.ts            executable entry (sets the exit code)
├── main.ts           main(argv, io): parse, dispatch, return the exit code
├── args.ts           node:util.parseArgs, strict
├── inputs.ts         files, directories, standard input -> text to analyze
├── files.ts          bounded, symlink-safe discovery; size-limited reads
├── io.ts             CliIo: everything external, so tests need no process
├── commands/         scan.ts, exorcise.ts
└── render/           pretty.ts, json.ts, sarif.ts, colors.ts
```

The package has no third-party runtime dependency; it uses only Node built-ins and `@phantomguard/core-engine`.
