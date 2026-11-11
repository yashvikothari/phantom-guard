import { useCallback, useEffect, useRef } from 'react';
import { ScanClient } from './scan-client';

/**
 * One ScanClient per component instance, created on first use and disposed on unmount.
 * Created lazily so a render that never scans never starts a worker. The returned getter
 * is stable across renders, so it is safe in effect dependency lists.
 */
export function useScanClient(): () => ScanClient {
  const ref = useRef<ScanClient | undefined>(undefined);

  useEffect(
    () => () => {
      ref.current?.dispose();
      ref.current = undefined;
    },
    [],
  );

  return useCallback((): ScanClient => {
    ref.current ??= new ScanClient();
    return ref.current;
  }, []);
}
