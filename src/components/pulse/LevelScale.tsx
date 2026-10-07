// Five-step activity scale with the current level marked. Color + text label, never color alone.
import type { ActivityLevel } from '../../../shared/types'
import { LEVELS } from '../../../shared/risk'
import { LEVEL_LABEL, LEVEL_VAR } from '../../lib/format'

export function LevelScale({ level, className = '' }: { level: ActivityLevel; className?: string }) {
  const idx = LEVELS.indexOf(level)
  return (
    <div className={className} aria-hidden="true">
      <div className="grid grid-cols-5 gap-[2px]">
        {LEVELS.map((l, i) => (
          <div key={l} className="flex flex-col items-center gap-1.5">
            <span
              className={`block h-2 w-full ${i === 0 ? 'rounded-l-full' : ''} ${i === LEVELS.length - 1 ? 'rounded-r-full' : ''}`}
              style={{ background: LEVEL_VAR[l], opacity: i === idx ? 1 : 0.32 }}
            />
            <span
              className={`text-center text-[11px] leading-tight sm:text-xs ${
                i === idx ? 'font-semibold text-ink-1' : 'text-ink-3'
              }`}
            >
              {i === idx && <span className="mr-0.5">▲</span>}
              {LEVEL_LABEL[l]}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
