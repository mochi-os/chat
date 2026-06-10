import { useCallback, useState } from 'react'

export function useMessageSelection() {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const isSelecting = selectedIds.size > 0

  const toggle = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const selectOne = useCallback((id: string) => {
    setSelectedIds(new Set([id]))
  }, [])

  const selectAll = useCallback((ids: string[]) => {
    setSelectedIds(new Set(ids))
  }, [])

  const clear = useCallback(() => {
    setSelectedIds(new Set())
  }, [])

  return { selectedIds, isSelecting, toggle, selectOne, selectAll, clear }
}
