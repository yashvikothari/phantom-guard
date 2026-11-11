import { useRef } from 'react';
import type { KeyboardEvent, ReactElement } from 'react';

export type ModeId = 'inspector' | 'scanner';

export const MODES: ReadonlyArray<{
  readonly id: ModeId;
  readonly label: string;
  readonly hint: string;
}> = [
  {
    id: 'inspector',
    label: 'Inspect Haunted Cloud',
    hint: 'Mode 1 · explore a haunted AWS account',
  },
  { id: 'scanner', label: 'Scan Custom Config', hint: 'Mode 2 · scan your own configuration' },
];

export const tabId = (id: ModeId): string => `tab-${id}`;
export const panelId = (id: ModeId): string => `panel-${id}`;

interface ModeTabsProps {
  readonly active: ModeId;
  readonly onChange: (mode: ModeId) => void;
}

/** WAI-ARIA tabs with automatic activation: arrow keys, Home and End move and select. */
export function ModeTabs({ active, onChange }: ModeTabsProps): ReactElement {
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);

  const move = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    const count = MODES.length;
    let next: number | undefined;
    switch (event.key) {
      case 'ArrowRight':
        next = (index + 1) % count;
        break;
      case 'ArrowLeft':
        next = (index - 1 + count) % count;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = count - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    const target = MODES[next];
    if (target !== undefined) {
      onChange(target.id);
      buttons.current[next]?.focus();
    }
  };

  return (
    <div role="tablist" aria-label="PhantomGuard mode" className="flex flex-col gap-2 sm:flex-row">
      {MODES.map((mode, index) => {
        const selected = mode.id === active;
        return (
          <button
            key={mode.id}
            ref={(element) => {
              buttons.current[index] = element;
            }}
            type="button"
            role="tab"
            id={tabId(mode.id)}
            aria-selected={selected}
            aria-controls={panelId(mode.id)}
            tabIndex={selected ? 0 : -1}
            onClick={() => {
              onChange(mode.id);
            }}
            onKeyDown={(event) => {
              move(event, index);
            }}
            className={`focus-ring flex-1 rounded-lg border px-4 py-3 text-left transition-colors ${
              selected
                ? 'border-violet-300 bg-slate-900/70 text-slate-100 backdrop-blur-md'
                : 'border-white/10 bg-slate-950/50 text-slate-300 hover:border-slate-500 hover:bg-slate-900/60'
            }`}
          >
            <span className="block text-base font-semibold">{mode.label}</span>
            <span className="block text-sm text-slate-400">{mode.hint}</span>
          </button>
        );
      })}
    </div>
  );
}
