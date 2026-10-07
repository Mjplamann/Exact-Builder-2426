// Accessible table twin for charts: semantic <table> with a caption, column headers and row headers,
// scrollable inside its own container (never widens the page).
import type { ReactNode } from 'react'

export interface DataTableColumn {
  key: string
  label: ReactNode
  /** Right-align numeric columns (default true for all but the first column). */
  numeric?: boolean
}

export interface DataTableRow {
  key: string
  /** First cell is rendered as the row header (<th scope="row">). */
  cells: ReactNode[]
}

export interface DataTableProps {
  caption: ReactNode
  columns: DataTableColumn[]
  rows: DataTableRow[]
  /** Max height of the scroll container in px (default 320). */
  maxHeight?: number
  footnote?: ReactNode
  id?: string
  className?: string
}

export function DataTable({ caption, columns, rows, maxHeight = 320, footnote, id, className = '' }: DataTableProps) {
  return (
    <div id={id} className={className}>
      <div
        className="overflow-auto rounded-lg border border-line"
        // width 0 + min-width 100%: fill the parent without contributing the table's min-content width
        // to it, so a wide table scrolls inside its box instead of widening grid/flex ancestors.
        style={{ maxHeight, width: 0, minWidth: '100%' }}
        tabIndex={0}
        role="region"
        aria-label={typeof caption === 'string' ? `${caption} (scrollable table)` : 'Data table (scrollable)'}
      >
        <table className="tabular w-full border-collapse text-left text-xs sm:text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              {columns.map((c, i) => (
                <th
                  key={c.key}
                  scope="col"
                  className={`sticky top-0 z-[1] border-b border-line bg-surface-2 px-2.5 py-2 align-bottom font-semibold leading-tight whitespace-nowrap text-ink-1 sm:px-3 ${
                    (c.numeric ?? i > 0) ? 'text-right' : 'text-left'
                  } ${i === 0 ? 'left-0 z-[2]' : ''}`}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b border-line last:border-b-0">
                {r.cells.map((cell, i) =>
                  i === 0 ? (
                    <th key={i} scope="row" className="sticky left-0 bg-surface-1 px-2.5 py-1.5 sm:px-3 text-left font-medium whitespace-nowrap text-ink-1">
                      {cell}
                    </th>
                  ) : (
                    <td
                      key={i}
                      className={`px-2.5 py-1.5 whitespace-nowrap text-ink-2 sm:px-3 ${(columns[i]?.numeric ?? true) ? 'text-right' : 'text-left'}`}
                    >
                      {cell}
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {footnote && <p className="mt-1.5 text-xs text-ink-3">{footnote}</p>}
    </div>
  )
}
