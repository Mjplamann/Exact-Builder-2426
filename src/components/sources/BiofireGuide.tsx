// "BioFire data": why only regional figures are public, and how a partner lab can contribute exports.
import { BIOFIRE_GUIDE, REPO_URL } from '../../content/learn'
import { ExternalLink } from '../learn/ExternalLink'

function CodeBlock({ label, children }: { label: string; children: string }) {
  return (
    <div className="mt-2">
      <p className="text-xs font-medium text-ink-3">{label}</p>
      <pre className="mt-1 rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap text-ink-1 [overflow-wrap:anywhere]">
        <code>
          {children.split(/(?<=,)/).map((part, i, all) => (
            <span key={i}>
              {part}
              {i < all.length - 1 && <wbr />}
            </span>
          ))}
        </code>
      </pre>
    </div>
  )
}

export function BiofireGuide() {
  const g = BIOFIRE_GUIDE
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="card min-w-0 p-4 sm:p-5">
        <h3 className="text-base font-semibold text-ink-1">Why only Midwest and U.S. numbers</h3>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-ink-2">
          {g.why.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
        <h3 className="mt-5 text-base font-semibold text-ink-1">For partner labs: add your exports</h3>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-ink-2">
          {g.steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
        <p className="mt-3 text-sm">
          <ExternalLink href={`${REPO_URL}/tree/main/data/manual/biofire`}>Open data/manual/biofire/ on GitHub</ExternalLink>
        </p>
      </div>
      <div className="card min-w-0 p-4 sm:p-5">
        <h3 className="text-base font-semibold text-ink-1">Accepted file formats</h3>
        <div className="mt-3">
          <p className="text-sm font-semibold text-ink-1">1. {g.wide.name}</p>
          <CodeBlock label="File name">{g.wide.file}</CodeBlock>
          <CodeBlock label="Example">{g.wide.example}</CodeBlock>
          <CodeBlock label="Header row">{g.wide.header}</CodeBlock>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-2">
            {g.wide.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
        <div className="mt-5 border-t border-line pt-4">
          <p className="text-sm font-semibold text-ink-1">2. {g.long.name}</p>
          <CodeBlock label="Header row">{g.long.header}</CodeBlock>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-2">
            {g.long.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
