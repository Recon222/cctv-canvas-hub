/**
 * TextLane — the SYSTEM lane's terminal renderer (ported
 * `processTerminal` retained surface, plan 6.3A; classes re-pointed at
 * the Case File token set).
 *
 * Renders the vtEngine line model. Pure presentational. Terminal-style
 * overflow contract: `whitespace-pre` preserves the log's intended row
 * shape; the lane body carries `overflow-auto` so long lines scroll
 * horizontally instead of reflowing styled spans.
 *
 * Row memo contract: each row is keyed by its index and receives the
 * line object plus its `version` primitive. Untouched `VtLine` objects
 * keep reference identity across writes (vtEngine structural sharing)
 * and their version is unchanged, so React Compiler's memoization
 * skips them; a rewritten line arrives as a fresh object with a bumped
 * version and repaints exactly that row. The version is stamped on the
 * DOM (`data-vt-version`) for tests and profiling.
 */

import type { VtLine, VtState } from '../services/vtEngine'

export interface TextLaneProps {
  text: VtState
}

export function TextLane({ text }: TextLaneProps) {
  if (text.lines.length === 1 && text.lines[0]?.segs.length === 0) {
    return null // nothing written yet — no empty gutter
  }
  return (
    <div
      className="whitespace-pre px-3 py-1 font-jbmono text-[11px] leading-[1.5] text-hub-body-2"
      data-testid="terminal-text-lane"
    >
      {text.lines.map((line, i) => (
        <LineRow key={i} line={line} version={line.version} />
      ))}
    </div>
  )
}

function LineRow({ line, version }: { line: VtLine; version: number }) {
  if (line.segs.length === 0) return <div data-vt-version={version}> </div>
  return (
    <div data-vt-version={version}>
      {line.segs.map((seg, i) =>
        seg.style ? (
          <span key={i} style={seg.style}>
            {seg.text}
          </span>
        ) : (
          seg.text
        )
      )}
    </div>
  )
}
