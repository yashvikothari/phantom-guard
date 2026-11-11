import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { applyPatch, listDatasets, loadDataset } from '@phantomguard/core-engine';
import type { Finding, HauntedResource, ScanReport } from '@phantomguard/core-engine';
import { Dashboard } from '../components/Dashboard';
import { HauntingMeter } from '../components/HauntingMeter';
import { ResourceCard } from '../components/ResourceCard';
import { ResourceDrawer } from '../components/ResourceDrawer';
import { ghostName, poltergeists } from '../lib/lexicon';
import { ScanSupersededError } from '../lib/scan-client';
import { GREEN_BUTTON, NEUTRAL_BUTTON } from '../lib/styles';
import { useScanClient } from '../lib/useScanClient';
import { useSessionState } from '../lib/useSessionState';

interface Exorcism {
  readonly patchId: string;
  readonly title: string;
  readonly ghost: string;
}

/** Mode 1: wander a haunted AWS account, open any resource, and exorcise what haunts it. */
export function HauntedCloudInspector(): ReactElement {
  const datasets = listDatasets();
  const getClient = useScanClient();

  const [datasetId, setDatasetId] = useSessionState<string>(
    'pg.inspector.dataset',
    datasets[0]?.id ?? 'haunted-mansion',
    (stored) =>
      typeof stored === 'string' && datasets.some((dataset) => dataset.id === stored)
        ? stored
        : undefined,
  );

  const [resources, setResources] = useState<readonly HauntedResource[]>([]);
  const [report, setReport] = useState<ScanReport | undefined>(undefined);
  const [openId, setOpenId] = useState<string | undefined>(undefined);
  const [exorcisms, setExorcisms] = useState<readonly Exorcism[]>([]);
  const [confirming, setConfirming] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const latest = useRef(0);

  const scanResources = useCallback(
    async (list: readonly HauntedResource[]): Promise<void> => {
      latest.current += 1;
      const token = latest.current;
      setBusy(true);
      setError(undefined);
      try {
        const next = await getClient().run({ kind: 'resources', resources: list });
        if (token === latest.current) {
          setReport(next);
        }
      } catch (caught) {
        if (token === latest.current && !(caught instanceof ScanSupersededError)) {
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

  /** Load a dataset fresh: discard applied patches and scan it. */
  const load = useCallback(
    (id: string): void => {
      const loaded = loadDataset(id) ?? [];
      setResources(loaded);
      setReport(undefined);
      setOpenId(undefined);
      setExorcisms([]);
      setConfirming(undefined);
      void scanResources(loaded);
    },
    [scanResources],
  );

  useEffect(() => {
    load(datasetId);
  }, [datasetId, load]);

  const findingsByResource = useMemo(() => {
    const grouped = new Map<string, Finding[]>();
    for (const finding of report?.findings ?? []) {
      const list = grouped.get(finding.resourceId);
      if (list === undefined) {
        grouped.set(finding.resourceId, [finding]);
      } else {
        list.push(finding);
      }
    }
    return grouped;
  }, [report]);

  const opened = resources.find((resource) => resource.id === openId);

  const exorcise = (finding: Finding): void => {
    const patch = finding.patch;
    const target =
      patch === undefined ? undefined : resources.find((r) => r.id === patch.resourceId);
    if (patch === undefined || target === undefined) {
      return;
    }
    const result = applyPatch(target, patch);
    if (!result.ok) {
      setError(`The exorcism "${patch.title}" failed: ${result.error}`);
      return;
    }
    const next = resources.map((resource) =>
      resource.id === target.id ? result.resource : resource,
    );
    setResources(next);
    setConfirming(undefined);
    setExorcisms((list) => [
      ...list,
      { patchId: patch.id, title: patch.title, ghost: ghostName(target) },
    ]);
    void scanResources(next);
  };

  const actionsFor = (finding: Finding): ReactElement | undefined => {
    const patch = finding.patch;
    if (patch === undefined) {
      return undefined;
    }
    if (patch.reviewRequired && confirming === patch.id) {
      return (
        <>
          <p role="alert" className="w-full text-sm text-amber-300">
            This changes how the resource behaves. Read the diff, then confirm.
          </p>
          <button
            type="button"
            className={GREEN_BUTTON}
            onClick={() => {
              exorcise(finding);
            }}
          >
            Confirm exorcism
          </button>
          <button
            type="button"
            className={NEUTRAL_BUTTON}
            onClick={() => {
              setConfirming(undefined);
            }}
          >
            Cancel
          </button>
        </>
      );
    }
    return (
      <button
        type="button"
        className={GREEN_BUTTON}
        onClick={() => {
          if (patch.reviewRequired) {
            setConfirming(patch.id);
          } else {
            exorcise(finding);
          }
        }}
      >
        Perform exorcism
      </button>
    );
  };

  const score = report?.summary.riskScore ?? 0;
  const total = report?.summary.total ?? 0;
  const sanctified = report !== undefined && total === 0;
  const dataset = datasets.find((candidate) => candidate.id === datasetId);

  return (
    <div className="space-y-6">
      <section aria-labelledby="inspector-heading" className="glass-panel rounded-xl p-4 sm:p-6">
        <h2 id="inspector-heading" className="font-display text-2xl text-slate-100">
          Inspect Haunted Cloud
        </h2>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-300">
          These are fictional AWS accounts. Open any resource to read what haunts it, how severe it
          is, and the exorcism that fixes it.
        </p>

        <div
          role="group"
          aria-label="Choose an account to inspect"
          className="mt-4 flex flex-col gap-2 sm:flex-row"
        >
          {datasets.map((candidate) => {
            const active = candidate.id === datasetId;
            return (
              <button
                key={candidate.id}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  if (active) {
                    load(candidate.id);
                  } else {
                    setDatasetId(candidate.id);
                  }
                }}
                className={`focus-ring flex-1 rounded-lg border px-4 py-3 text-left transition-colors ${
                  active
                    ? 'border-violet-300 bg-slate-950/70 text-slate-100'
                    : 'border-white/10 bg-slate-950/40 text-slate-300 hover:border-slate-500'
                }`}
              >
                <span className="block font-semibold">{candidate.name}</span>
                <span className="block text-sm text-slate-400">{candidate.tagline}</span>
              </button>
            );
          })}
        </div>
        {dataset === undefined ? null : (
          <p className="mt-3 text-sm text-slate-400">{dataset.description}</p>
        )}

        <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <HauntingMeter score={score} />
          <button
            type="button"
            className={NEUTRAL_BUTTON}
            onClick={() => {
              load(datasetId);
            }}
          >
            Reset the account
          </button>
        </div>

        <div className="mt-5">
          <Dashboard report={report} exorcisms={exorcisms.length} />
        </div>

        <p className="sr-only" aria-live="polite">
          {busy
            ? 'Scanning.'
            : report === undefined
              ? ''
              : `${poltergeists(total)}. Haunting level ${String(score)} out of 100.`}
        </p>
      </section>

      {error === undefined ? null : (
        <p
          role="alert"
          className="glass-panel rounded-xl border-neon-red p-4 text-sm text-slate-200"
        >
          <strong className="text-neon-red">Something went wrong. </strong>
          {error}
        </p>
      )}

      {sanctified ? (
        <p
          role="status"
          className="glass-panel rounded-xl border-neon-green p-4 text-center font-display text-xl text-neon-green shadow-neon-green text-glow-green"
        >
          Sanctified. Nothing haunts this account.
        </p>
      ) : null}

      <section aria-label="Resources" className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
          Resources ({resources.length}) · open one to see its poltergeists
        </h3>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {resources.map((resource) => (
            <li key={resource.id}>
              <ResourceCard
                resource={resource}
                findings={
                  report === undefined ? undefined : (findingsByResource.get(resource.id) ?? [])
                }
                onOpen={() => {
                  setOpenId(resource.id);
                  setConfirming(undefined);
                }}
              />
            </li>
          ))}
        </ul>
      </section>

      <ResourceDrawer
        resource={opened}
        findings={opened === undefined ? [] : (findingsByResource.get(opened.id) ?? [])}
        onClose={() => {
          setOpenId(undefined);
          setConfirming(undefined);
        }}
        actionsFor={actionsFor}
      />

      {exorcisms.length === 0 ? null : (
        <section
          aria-labelledby="exorcisms-heading"
          className="glass-panel rounded-xl border-neon-green p-4"
        >
          <h3
            id="exorcisms-heading"
            className="font-display text-lg text-neon-green text-glow-green"
          >
            Exorcisms performed
          </h3>
          <ol className="mt-2 space-y-1" aria-live="polite">
            {exorcisms.map((entry, index) => (
              <li key={`${entry.patchId}:${String(index)}`} className="text-sm text-slate-200">
                <span className="text-neon-green" aria-hidden="true">
                  ✓{' '}
                </span>
                {entry.ghost}: {entry.title}
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
