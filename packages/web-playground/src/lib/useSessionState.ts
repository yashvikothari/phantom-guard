import { useCallback, useState } from 'react';

/**
 * `useState` that survives a page reload within the browser session (Requirement 16.2).
 * Stored in sessionStorage, which never leaves the browser and is cleared when the tab closes.
 *
 * `parse` turns the stored JSON back into a trusted value, or returns undefined to fall back
 * to `initial`. Storage failures (private mode, quota) are ignored: the state still works.
 */
export function useSessionState<T>(
  key: string,
  initial: T,
  parse: (stored: unknown) => T | undefined,
): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = window.sessionStorage.getItem(key);
      if (raw !== null) {
        const parsed = parse(JSON.parse(raw) as unknown);
        if (parsed !== undefined) {
          return parsed;
        }
      }
    } catch {
      // unreadable storage: use the initial value
    }
    return initial;
  });

  const update = useCallback(
    (next: T) => {
      setValue(next);
      try {
        window.sessionStorage.setItem(key, JSON.stringify(next));
      } catch {
        // storage unavailable: keep the in-memory value
      }
    },
    [key],
  );

  return [value, update];
}
