import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { NEUTRAL_BUTTON } from '../lib/styles';

type CopyState = 'idle' | 'copied' | 'blocked';

interface CopyButtonProps {
  /** The text placed on the clipboard. */
  readonly text: string;
  readonly label: string;
  /** Extra classes, for example to make this the primary action. */
  readonly className?: string;
}

const RESET_AFTER_MS = 2200;

/** One-click copy with a visible and announced result. The browser may refuse; that is reported too. */
export function CopyButton({
  text,
  label,
  className = NEUTRAL_BUTTON,
}: CopyButtonProps): ReactElement {
  const [state, setState] = useState<CopyState>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(
    () => () => {
      clearTimeout(timer.current);
    },
    [],
  );

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
      setState('copied');
    } catch {
      setState('blocked');
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setState('idle');
    }, RESET_AFTER_MS);
  };

  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => {
          void copy();
        }}
      >
        {state === 'copied' ? 'Copied ✓' : label}
      </button>
      <span className="sr-only" role="status">
        {state === 'copied'
          ? `${label}: copied to the clipboard.`
          : state === 'blocked'
            ? `${label}: the browser blocked copying. Select the text and copy it by hand.`
            : ''}
      </span>
      {state === 'blocked' ? (
        <span className="text-xs text-amber-300" aria-hidden="true">
          The browser blocked copying. Select the text by hand.
        </span>
      ) : null}
    </>
  );
}
