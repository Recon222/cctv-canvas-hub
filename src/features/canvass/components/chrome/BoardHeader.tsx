import { useEffect, useState, type ReactNode } from 'react'

/**
 * Header chrome (design_handoff §1): small presentational pieces the M5
 * wiring composes into the board header. No data wiring here.
 */

/** Gold mono case tag + Nacelle title (truncating). */
export function CaseHeading({ tag, title }: { tag: string; title: string }) {
  return (
    <div className="flex min-w-0 flex-1 items-baseline gap-3">
      <span className="font-jbmono text-[13px] tracking-[0.5px] text-hub-working">
        {tag}
      </span>
      <span className="truncate font-nacelle text-[17px] font-semibold text-hub-heading">
        {title}
      </span>
    </div>
  )
}

const pad = (n: number): string => String(n).padStart(2, '0')

/** Live HH:MM:SS wall clock — seconds always (doc 01 rule 6). */
export function LiveClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => {
      setNow(new Date())
    }, 1000)
    return () => {
      clearInterval(id)
    }
  }, [])
  return (
    <time
      dateTime={now.toISOString()}
      className="font-jbmono text-base tracking-[1px] text-hub-body-2"
    >
      {`${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`}
    </time>
  )
}

/**
 * The 54px header bar frame: heading start, children (connection chip,
 * clock, monitor toggle) end. Hosts compose; this owns only posture.
 */
export function BoardHeader({ children }: { children: ReactNode }) {
  return (
    <header className="flex h-[54px] shrink-0 items-center gap-4 border-b border-hub-hairline bg-hub-chrome px-4">
      {children}
    </header>
  )
}
