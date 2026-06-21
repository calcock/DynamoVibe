import { useCallback, useState } from 'react'
import type { DocItem } from '@shared/marshal'
import type { PageResult } from '@shared/types'
import { notifyError } from '../lib/notify'

export interface PagerState {
  items: DocItem[]
  loading: boolean
  hasMore: boolean
  scannedCount: number
  /** Run a fresh fetch, replacing all loaded items. */
  run: () => Promise<void>
  /** Fetch the next page and append. */
  loadMore: () => Promise<void>
  reset: () => void
}

type Fetcher = (exclusiveStartKey?: Record<string, unknown>) => Promise<PageResult>

/**
 * Drives DynamoDB cursor pagination (LastEvaluatedKey). The fetcher is supplied
 * by the caller so the same machinery serves both Browse (scan) and Query.
 */
export function useDataPager(fetcher: Fetcher): PagerState {
  const [items, setItems] = useState<DocItem[]>([])
  const [lastKey, setLastKey] = useState<Record<string, unknown> | undefined>()
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [scannedCount, setScannedCount] = useState(0)

  const fetchPage = useCallback(
    async (startKey: Record<string, unknown> | undefined, append: boolean) => {
      setLoading(true)
      try {
        const page = await fetcher(startKey)
        setItems((prev) =>
          append ? [...prev, ...(page.items as DocItem[])] : (page.items as DocItem[])
        )
        setLastKey(page.lastEvaluatedKey)
        setHasMore(Boolean(page.lastEvaluatedKey))
        setScannedCount((prev) =>
          append ? prev + (page.scannedCount ?? 0) : page.scannedCount ?? 0
        )
      } catch (err) {
        notifyError('Fetch failed', err)
        if (!append) {
          setItems([])
          setHasMore(false)
        }
      } finally {
        setLoading(false)
      }
    },
    [fetcher]
  )

  const run = useCallback(() => fetchPage(undefined, false), [fetchPage])
  const loadMore = useCallback(
    () => (lastKey ? fetchPage(lastKey, true) : Promise.resolve()),
    [fetchPage, lastKey]
  )
  const reset = useCallback(() => {
    setItems([])
    setLastKey(undefined)
    setHasMore(false)
    setScannedCount(0)
  }, [])

  return { items, loading, hasMore, scannedCount, run, loadMore, reset }
}
