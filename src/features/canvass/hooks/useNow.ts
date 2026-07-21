import { useEffect, useState } from 'react'

/**
 * A ticking clock for presentation-derived recency (CaseCard's dot,
 * ActivityFeed's freshness tint): re-renders the consumer every
 * `intervalMs` so time-window styling is computed from state, never
 * from Date.now() during render (React Compiler purity rule).
 */
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => {
      setNow(Date.now())
    }, intervalMs)
    return () => {
      clearInterval(id)
    }
  }, [intervalMs])
  return now
}
