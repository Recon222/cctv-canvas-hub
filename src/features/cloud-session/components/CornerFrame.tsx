import type { ReactNode } from 'react'

/**
 * Corner-bracket evidence frame (Case File `CornerBrackets`, recreated
 * as repo-local presentation — the DS bundle is not a dependency).
 * Optional eyebrow renders INSIDE the frame (the upstream floating
 * label pill was dropped by design review). Internal to cloud-session;
 * not barrel-exported.
 */
export function CornerFrame({
  eyebrow,
  children,
}: {
  eyebrow?: string
  children: ReactNode
}) {
  const bracket = 'pointer-events-none absolute size-5 border-hub-complete/55'
  return (
    <div className="relative p-5">
      <span
        aria-hidden
        className={`${bracket} start-0 top-0 border-s border-t`}
      />
      <span
        aria-hidden
        className={`${bracket} end-0 top-0 border-e border-t`}
      />
      <span
        aria-hidden
        className={`${bracket} bottom-0 start-0 border-b border-s`}
      />
      <span
        aria-hidden
        className={`${bracket} bottom-0 end-0 border-b border-e`}
      />
      {eyebrow !== undefined && (
        <p className="pt-1 text-center font-stmono text-[10px] uppercase tracking-[3px] text-hub-complete">
          {eyebrow}
        </p>
      )}
      {children}
    </div>
  )
}
