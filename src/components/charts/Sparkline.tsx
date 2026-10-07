// STUB — replaced by the charts implementation.
import type { Point } from '../../../shared/types'

export interface SparklineProps {
  points: Point[]
  width?: number
  height?: number
  /** Accessible label, e.g. "Flu ED visits, last 16 weeks". */
  label: string
  color?: string
}

export function Sparkline({ width = 120, height = 32, label }: SparklineProps) {
  return <svg width={width} height={height} role="img" aria-label={label} />
}
