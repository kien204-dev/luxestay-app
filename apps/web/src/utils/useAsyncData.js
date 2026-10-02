import { useCallback, useEffect, useEffectEvent, useState } from "react";

// Loads data for a component and tracks loading/error, without setting state
// synchronously inside an effect.
//
//   const { data, loading, error, reload } = useAsyncData(`room:${id}`, () => getRoomById(id));
//
// `key` identifies the request: a new key starts a new load, the same key
// does not. Pass null to hold off (e.g. until an id is known). While a new
// request is in flight, `data` keeps the previous result so lists do not
// flash empty between pages.
export function useAsyncData(key, loader) {
  const [reloads, setReloads] = useState(0);
  const [result, setResult] = useState({ requestId: null, data: null, error: null });

  const requestId = key === null ? null : `${key}#${reloads}`;
  // Always calls the latest loader without making it an effect dependency.
  const load = useEffectEvent(() => loader());

  useEffect(() => {
    if (requestId === null) return undefined;
    let cancelled = false;

    Promise.resolve()
      .then(load)
      .then(
        (data) => {
          if (!cancelled) setResult({ requestId, data, error: null });
        },
        (error) => {
          if (!cancelled) setResult({ requestId, data: null, error });
        }
      );

    return () => {
      cancelled = true;
    };
  }, [requestId]);

  const loading = requestId !== null && result.requestId !== requestId;
  const reload = useCallback(() => setReloads((count) => count + 1), []);
  const setData = useCallback(
    (update) =>
      setResult((current) => ({
        ...current,
        data: typeof update === "function" ? update(current.data) : update,
      })),
    []
  );

  return {
    data: result.data,
    error: loading ? null : result.error,
    loading,
    reload,
    setData,
  };
}
