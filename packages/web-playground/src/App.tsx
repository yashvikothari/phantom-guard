import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { MODES, ModeTabs, panelId, tabId } from './components/ModeTabs';
import type { ModeId } from './components/ModeTabs';
import { CustomConfigScanner } from './modes/CustomConfigScanner';
import { HauntedCloudInspector } from './modes/HauntedCloudInspector';

/** The mode named by the URL fragment, or the Inspector (Requirement 16.1, 16.3). */
function modeFromHash(hash: string): ModeId {
  const wanted = hash.replace(/^#/, '');
  return MODES.find((mode) => mode.id === wanted)?.id ?? 'inspector';
}

export function App(): ReactElement {
  const [mode, setMode] = useState<ModeId>(() => modeFromHash(window.location.hash));

  useEffect(() => {
    const onHashChange = (): void => {
      setMode(modeFromHash(window.location.hash));
    };
    window.addEventListener('hashchange', onHashChange);
    return () => {
      window.removeEventListener('hashchange', onHashChange);
    };
  }, []);

  const choose = (next: ModeId): void => {
    setMode(next);
    // replaceState keeps the Back button from filling up with tab switches.
    window.history.replaceState(null, '', `#${next}`);
  };

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-slate-950 text-slate-200">
      {/* Decorative haze. Hidden from assistive technology; stills under reduced motion. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-96 bg-[radial-gradient(ellipse_at_top,rgba(167,139,250,0.14),transparent_65%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-x-20 top-24 h-48 bg-[radial-gradient(ellipse_at_center,rgba(148,163,184,0.07),transparent_70%)] motion-safe:animate-drift"
      />

      <a
        href="#main"
        className="focus-ring sr-only rounded bg-slate-900 px-3 py-2 text-slate-100 focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-10"
      >
        Skip to the content
      </a>

      <header className="relative mx-auto max-w-6xl px-4 pb-4 pt-8 sm:px-6">
        <div className="flex items-center gap-4">
          <svg viewBox="0 0 64 64" className="size-14 shrink-0" fill="none" aria-hidden="true">
            <path
              d="M32 8c-9.4 0-17 7.4-17 16.5V52l5.7-4.4L26 52l6-4.4L38 52l5.3-4.4L49 52V24.5C49 15.4 41.4 8 32 8z"
              stroke="#c4b5fd"
              strokeWidth="3"
              strokeLinejoin="round"
            />
            <circle cx="26" cy="26" r="3.2" fill="#e2e8f0" />
            <circle cx="38" cy="26" r="3.2" fill="#e2e8f0" />
          </svg>
          <div>
            <h1 className="font-display text-4xl tracking-wide text-violet-300 text-glow-violet motion-safe:animate-flicker sm:text-5xl">
              PhantomGuard
            </h1>
            <p className="text-sm text-slate-300 sm:text-base">
              Finds the ghosts in your cloud configuration, then exorcises them.
            </p>
          </div>
        </div>
        <p className="glass-panel mt-4 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs text-slate-300">
          <svg
            viewBox="0 0 12 12"
            className="size-3"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <rect x="2" y="5.5" width="8" height="5" rx="1" />
            <path d="M4 5.5V4a2 2 0 014 0v1.5" />
          </svg>
          Runs entirely in your browser. Nothing is uploaded.
        </p>
      </header>

      <main id="main" className="relative mx-auto max-w-6xl space-y-6 px-4 pb-16 sm:px-6">
        <ModeTabs active={mode} onChange={choose} />

        {/* Both panels stay mounted so each mode keeps its state while you visit the other. */}
        {MODES.map((candidate) => (
          <div
            key={candidate.id}
            role="tabpanel"
            id={panelId(candidate.id)}
            aria-labelledby={tabId(candidate.id)}
            hidden={candidate.id !== mode}
            tabIndex={0}
            className="focus-ring rounded-lg"
          >
            {candidate.id === 'inspector' ? <HauntedCloudInspector /> : <CustomConfigScanner />}
          </div>
        ))}
      </main>

      <footer className="relative border-t border-slate-800 px-4 py-6 text-center text-xs text-slate-400">
        PhantomGuard is open source under the MIT license. The accounts in the Inspector are
        fictional. Built for Kiroween 2026.
      </footer>
    </div>
  );
}
