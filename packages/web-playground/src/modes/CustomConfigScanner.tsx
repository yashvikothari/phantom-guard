import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent, KeyboardEvent, ReactElement } from 'react';
import { MAX_INPUT_BYTES, supportedFormats } from '@phantomguard/core-engine';
import type { ConfigFormat, Diagnostic, ScanReport } from '@phantomguard/core-engine';
import { FindingCard } from '../components/FindingCard';
import { HauntingMeter } from '../components/HauntingMeter';
import { SourceExcerpt } from '../components/SourceExcerpt';
import { poltergeists } from '../lib/lexicon';
import { SAMPLE_DOCKERFILE, SAMPLE_IAM_POLICY, SAMPLE_TERRAFORM } from '../lib/samples';
import { ScanSupersededError } from '../lib/scan-client';
import { GREEN_BUTTON, NEUTRAL_BUTTON } from '../lib/styles';
import { useScanClient } from '../lib/useScanClient';
import { useSessionState } from '../lib/useSessionState';

type FormatChoice = 'auto' | ConfigFormat;

const FORMAT_LABEL: Readonly<Record<ConfigFormat, string>> = {
  terraform: 'Terraform',
  dockerfile: 'Dockerfile',
  'iam-policy': 'IAM policy (JSON)',
};

const CHOICES: readonly FormatChoice[] = ['auto', 'terraform', 'dockerfile', 'iam-policy'];

const SAMPLES: ReadonlyArray<{ readonly format: ConfigFormat; readonly text: string }> = [
  { format: 'terraform', text: SAMPLE_TERRAFORM },
  { format: 'iam-policy', text: SAMPLE_IAM_POLICY },
  { format: 'dockerfile', text: SAMPLE_DOCKERFILE },
];

interface ScanOutcome {
  readonly report: ScanReport;
  /** The exact text that was scanned, kept so source excerpts stay correct if the user keeps typing. */
  readonly source: string;
  /** Wall-clock time from the request to the report, including the worker round trip. */
  readonly elapsedMs: number;
}

function parseChoice(stored: unknown): FormatChoice | undefined {
  return CHOICES.find((choice) => choice === stored);
}

function formatDuration(milliseconds: number): string {
  return milliseconds < 1 ? 'under 1 ms' : `${String(Math.round(milliseconds))} ms`;
}

function DiagnosticList({
  diagnostics,
}: {
  readonly diagnostics: readonly Diagnostic[];
}): ReactElement | null {
  if (diagnostics.length === 0) {
    return null;
  }
  return (
    <ul aria-label="Scan messages" className="space-y-2">
      {diagnostics.map((diagnostic, index) => {
        const where =
          diagnostic.line === undefined
            ? ''
            : ` · line ${String(diagnostic.line)}${diagnostic.column === undefined ? '' : `, column ${String(diagnostic.column)}`}`;
        const tone =
          diagnostic.level === 'error'
            ? 'border-neon-red text-neon-red'
            : diagnostic.level === 'warning'
              ? 'border-amber-300 text-amber-300'
              : 'border-slate-500 text-slate-300';
        return (
          <li
            key={`${diagnostic.code}:${String(index)}`}
            className="glass-panel rounded-md p-3 text-sm"
          >
            <span
              className={`mr-2 rounded border px-2 py-0.5 text-xs font-semibold uppercase ${tone}`}
            >
              {diagnostic.level}
            </span>
            <span className="text-slate-200">{diagnostic.message}</span>
            <span className="font-mono text-xs text-slate-400">
              {where} · {diagnostic.code}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Mode 2: paste or drop Terraform, a Dockerfile or an IAM policy and get poltergeists and fixes at once. */
export function CustomConfigScanner(): ReactElement {
  const getClient = useScanClient();
  const textareaId = useId();
  const formatId = useId();
  const hintId = useId();
  const fileInput = useRef<HTMLInputElement | null>(null);
  const latest = useRef(0);

  const [text, setText] = useState('');
  // Only the format choice is remembered. Pasted configuration is never written to storage.
  const [format, setFormat] = useSessionState<FormatChoice>(
    'pg.scanner.format',
    'auto',
    parseChoice,
  );
  const [outcome, setOutcome] = useState<ScanOutcome | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [notice, setNotice] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  const available = supportedFormats();
  const empty = text.trim() === '';

  // Start the worker while the visitor is still typing, so the first scan is not slowed by it.
  useEffect(() => {
    getClient().warm();
  }, [getClient]);

  const scanNow = useCallback(
    async (source: string, choice: FormatChoice): Promise<void> => {
      latest.current += 1;
      const token = latest.current;
      setBusy(true);
      setError(undefined);
      setNotice(undefined);
      const started = performance.now();
      try {
        const report = await getClient().run({
          kind: 'text',
          text: source,
          format: choice === 'auto' ? undefined : choice,
        });
        if (token === latest.current) {
          setOutcome({ report, source, elapsedMs: performance.now() - started });
        }
      } catch (caught) {
        if (token === latest.current && !(caught instanceof ScanSupersededError)) {
          setOutcome(undefined);
          setError(caught instanceof Error ? caught.message : 'The scan failed.');
        }
      } finally {
        if (token === latest.current) {
          setBusy(false);
        }
      }
    },
    [getClient],
  );

  const startScan = (): void => {
    if (!empty) {
      void scanNow(text, format);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      startScan();
    }
  };

  const loadFile = async (file: File): Promise<void> => {
    const name = file.name.length > 80 ? `${file.name.slice(0, 80)}…` : file.name;
    if (file.size > MAX_INPUT_BYTES) {
      // Refuse before reading: the file never enters memory or the text area (Requirement 18.7).
      setNotice(
        `${name} is larger than the ${String(MAX_INPUT_BYTES)}-byte limit and was not read. [PG-LIMIT-INPUT-SIZE]`,
      );
      return;
    }
    try {
      setText(await file.text());
      setOutcome(undefined);
      setError(undefined);
      setNotice(`Loaded ${name}. Press Scan to cast the séance.`);
    } catch {
      setNotice(`${name} could not be read.`);
    }
  };

  const onFileChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    event.target.value = ''; // allow choosing the same file again
    if (file !== undefined) {
      void loadFile(file);
    }
  };

  const onDrop = (event: DragEvent<HTMLElement>): void => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file !== undefined) {
      void loadFile(file);
    }
  };

  const report = outcome?.report;
  const unanalyzed =
    report?.diagnostics.some((diagnostic) => diagnostic.level === 'error') === true;
  const nothingToJudge = report !== undefined && report.resources.length === 0 && !unanalyzed;

  return (
    <div className="space-y-6">
      <section aria-labelledby="scanner-heading" className="glass-panel rounded-xl p-4 sm:p-6">
        <h2 id="scanner-heading" className="font-display text-2xl text-slate-100">
          Scan Custom Config
        </h2>
        <p id={hintId} className="mt-1 max-w-3xl text-sm leading-6 text-slate-300">
          Paste a Terraform file, a Dockerfile or an IAM policy, or drop a file. Your text is
          analyzed inside this page and is never uploaded.
        </p>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor={formatId} className="block text-sm font-medium text-slate-200">
              Format
            </label>
            <select
              id={formatId}
              value={format}
              onChange={(event) => {
                const choice = parseChoice(event.target.value);
                if (choice !== undefined) {
                  setFormat(choice);
                }
              }}
              className="focus-ring mt-1 rounded-md border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-slate-200"
            >
              <option value="auto">Auto-detect</option>
              {(['terraform', 'dockerfile', 'iam-policy'] as const).map((candidate) => (
                <option key={candidate} value={candidate} disabled={!available.includes(candidate)}>
                  {FORMAT_LABEL[candidate]}
                  {available.includes(candidate) ? '' : ' (parser not available yet)'}
                </option>
              ))}
            </select>
          </div>

          <div
            className="flex flex-wrap items-center gap-2"
            role="group"
            aria-label="Load a sample"
          >
            <span className="text-sm text-slate-400">Samples:</span>
            {SAMPLES.map((sample) => (
              <button
                key={sample.format}
                type="button"
                className={NEUTRAL_BUTTON}
                onClick={() => {
                  setText(sample.text);
                  setFormat(sample.format);
                  setOutcome(undefined);
                  setError(undefined);
                  setNotice(undefined);
                }}
              >
                {FORMAT_LABEL[sample.format]}
              </button>
            ))}
          </div>

          <div>
            <input
              ref={fileInput}
              type="file"
              className="sr-only"
              tabIndex={-1}
              aria-label="Choose a file to scan"
              onChange={onFileChange}
            />
            <button
              type="button"
              className={NEUTRAL_BUTTON}
              onClick={() => {
                fileInput.current?.click();
              }}
            >
              Choose a file
            </button>
          </div>
        </div>

        <div
          className="mt-4"
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => {
            setDragging(false);
          }}
          onDrop={onDrop}
        >
          <label htmlFor={textareaId} className="block text-sm font-medium text-slate-200">
            Configuration to scan
          </label>
          <textarea
            id={textareaId}
            value={text}
            onChange={(event) => {
              setText(event.target.value);
            }}
            onKeyDown={onKeyDown}
            rows={14}
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            aria-describedby={hintId}
            placeholder="Paste here, or drop a file onto this box"
            className={`focus-ring mt-1 w-full resize-y rounded-md border bg-slate-950/80 p-3 font-mono text-sm leading-5 text-slate-200 placeholder:text-slate-400 ${
              dragging ? 'border-violet-300' : 'border-slate-600'
            }`}
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            className={GREEN_BUTTON}
            disabled={empty || busy}
            onClick={startScan}
          >
            {busy ? 'Casting the séance…' : 'Scan'}
          </button>
          <span className="text-xs text-slate-400">Ctrl+Enter or ⌘+Enter also scans.</span>
          {text === '' ? null : (
            <button
              type="button"
              className={NEUTRAL_BUTTON}
              onClick={() => {
                setText('');
                setOutcome(undefined);
                setError(undefined);
                setNotice(undefined);
              }}
            >
              Clear
            </button>
          )}
        </div>

        <p className="mt-2 min-h-5 text-sm text-slate-300" role="status" aria-live="polite">
          {notice}
        </p>
      </section>

      {error === undefined ? null : (
        <p
          role="alert"
          className="glass-panel rounded-xl border-neon-red p-4 text-sm text-slate-200"
        >
          <strong className="text-neon-red">The séance failed. </strong>
          {error}
        </p>
      )}

      {report === undefined && error === undefined ? (
        <p className="rounded-xl border border-dashed border-white/15 p-6 text-center text-slate-400">
          {empty
            ? 'Nothing to scan yet. Paste a Terraform file, a Dockerfile or an IAM policy, drop a file, or load a sample above.'
            : 'Press Scan to see what haunts this configuration.'}
        </p>
      ) : null}

      {report === undefined || outcome === undefined ? null : (
        <section aria-label="Scan results" aria-live="polite" className="space-y-4">
          <div className="glass-panel rounded-xl p-4">
            <HauntingMeter score={report.summary.riskScore} />
            <p className="mt-3 text-sm text-slate-300">
              {report.format === undefined
                ? 'Format not detected.'
                : `Scanned as ${FORMAT_LABEL[report.format]}.`}{' '}
              {report.resources.length === 0
                ? ''
                : `${String(report.resources.length)} ${report.resources.length === 1 ? 'resource' : 'resources'}, `}
              {poltergeists(report.summary.total)}.{' '}
              <span className="font-mono text-slate-400">
                Scanned in {formatDuration(outcome.elapsedMs)}.
              </span>
            </p>
          </div>

          <DiagnosticList diagnostics={report.diagnostics} />

          {nothingToJudge ? (
            <p
              role="status"
              className="glass-panel rounded-xl p-4 text-center text-sm text-slate-200"
            >
              <strong className="text-slate-100">Nothing to judge. </strong>
              The text contained no resource that a rule checks, so there is no verdict. The
              messages above say which resource types are supported.
            </p>
          ) : null}

          {report.findings.length === 0 && !unanalyzed && !nothingToJudge ? (
            <p
              role="status"
              className="glass-panel rounded-xl border-neon-green p-4 text-center font-display text-xl text-neon-green shadow-neon-green text-glow-green"
            >
              Sanctified. No rule found anything wrong.
            </p>
          ) : null}

          {unanalyzed ? (
            <p className="glass-panel rounded-xl border-neon-red p-4 text-sm text-slate-200">
              <strong className="text-neon-red">Not analyzed. </strong>
              The messages above explain why. An empty list here does not mean the configuration is
              safe.
            </p>
          ) : null}

          <ul className="space-y-4" aria-label="Poltergeists, most severe first">
            {report.findings.map((finding) => (
              <li key={`${finding.ruleId}:${finding.resourceId}:${finding.locationKey}`}>
                <FindingCard
                  finding={finding}
                  sourceFormat={report.format}
                  {...(finding.line === undefined
                    ? {}
                    : { excerpt: <SourceExcerpt source={outcome.source} line={finding.line} /> })}
                />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
