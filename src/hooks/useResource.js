import { useCallback, useEffect, useState } from 'react'

/**
 * Loads data from the backend and tracks loading/error state.
 * `loader` must be stable (wrap it in useCallback in the caller).
 * Returns { data, loading, error, refetch, setData }.
 */
export function useResource(loader, deps = [], initial = null) {
  const [data, setData] = useState(initial)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(loader, deps)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await run())
    } catch (caught) {
      setError(caught?.message || 'Something went wrong while loading data.')
    } finally {
      setLoading(false)
    }
  }, [run])

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    run()
      .then((result) => active && setData(result))
      .catch((caught) => active && setError(caught?.message || 'Something went wrong while loading data.'))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [run])

  return { data, loading, error, refetch, setData }
}
