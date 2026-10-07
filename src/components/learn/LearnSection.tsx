// One explainer section: numbered heading, takeaway, body, live data slot, practical meaning,
// worked examples, progressive-disclosure details and cited sources.
import type { ReactNode } from 'react'
import type { GlossaryEntry, LearnSection as Section } from '../../content/learn'
import { ExternalLink } from './ExternalLink'

export function SectionShell({
  id,
  index,
  title,
  children,
}: {
  id: string
  index: number
  title: string
  children: ReactNode
}) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-32 border-t border-line pt-8 pb-2 first:border-t-0 first:pt-0 lg:scroll-mt-24">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="tabular mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-ink-1"
        >
          {index}
        </span>
        <h2 id={`${id}-h`} className="text-xl font-semibold tracking-tight text-ink-1 outline-none sm:text-2xl">
          {title}
        </h2>
      </div>
      <div className="mt-3">{children}</div>
    </section>
  )
}

export function LearnSectionBlock({ section, index, children }: { section: Section; index: number; children?: ReactNode }) {
  return (
    <SectionShell id={section.id} index={index} title={section.title}>
      <p className="text-base leading-relaxed font-medium text-ink-1 sm:text-lg">{section.summary}</p>
      {section.body.map((p, i) => (
        <Paragraph key={i} text={p} />
      ))}

      {children}

      {section.examples && section.examples.length > 0 && (
        <div className="mt-6">
          <h3 className="text-base font-semibold text-ink-1">Examples</h3>
          <dl className="mt-2 grid gap-3 sm:grid-cols-2">
            {section.examples.map((ex) => (
              <div key={ex.see} className="rounded-xl border border-line bg-surface-1 p-3">
                <dt className="text-sm font-semibold text-ink-1">
                  <span className="text-ink-3">If you see: </span>
                  {ex.see}
                </dt>
                <dd className="mt-1 text-sm text-ink-2">{ex.means}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {section.forYou && !section.detailsAsCards && <ForYou text={section.forYou} />}

      {section.detailsAsCards && section.details && (
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {section.details.map((d) => (
            <div key={d.title} className="rounded-xl border border-line bg-surface-1 p-4">
              <h3 className="text-sm font-semibold text-ink-1">{d.title}</h3>
              <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-ink-2">
                {d.items.map((it) => (
                  <li key={it}>{it}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {section.forYou && section.detailsAsCards && <ForYou text={section.forYou} />}

      {!section.detailsAsCards && section.details && section.details.length > 0 && (
        <div className="mt-4 divide-y divide-line rounded-xl border border-line bg-surface-1">
          {section.details.map((d) => (
            <details key={d.title} className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-ink-1 hover:bg-surface-2 [&::-webkit-details-marker]:hidden">
                <span>{d.title}</span>
                <span aria-hidden="true" className="text-ink-3 transition-transform group-open:rotate-180">
                  ▾
                </span>
              </summary>
              <ul className="list-disc space-y-1.5 px-4 pb-4 pl-8 text-sm leading-relaxed text-ink-2">
                {d.items.map((it) => (
                  <li key={it}>{it}</li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      )}

      <SourcesLine sources={section.sources} />
    </SectionShell>
  )
}

function ForYou({ text }: { text: string }) {
  return (
    <div className="mt-6 rounded-xl border border-line bg-accent-soft p-4">
      <p className="text-sm font-semibold text-ink-1">What it means for you</p>
      <p className="mt-1 text-sm leading-relaxed text-ink-2">{text}</p>
    </div>
  )
}

/** Body paragraph; a leading "**Lead-in.**" is rendered bold for scanning. */
function Paragraph({ text }: { text: string }) {
  const m = /^\*\*(.+?)\*\*\s*([\s\S]*)$/.exec(text)
  return (
    <p className="mt-3 leading-relaxed text-ink-2">
      {m ? (
        <>
          <strong className="font-semibold text-ink-1">{m[1]}</strong> {m[2]}
        </>
      ) : (
        text
      )}
    </p>
  )
}

export function SourcesLine({ sources }: { sources: { label: string; url: string }[] }) {
  if (!sources.length) return null
  return (
    <div className="mt-4 text-xs text-ink-3">
      <span className="font-semibold text-ink-2">Sources: </span>
      <ul className="inline">
        {sources.map((s, i) => (
          <li key={s.url} className="inline">
            <ExternalLink href={s.url}>{s.label}</ExternalLink>
            {i < sources.length - 1 && <span aria-hidden="true"> · </span>}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function Glossary({ entries }: { entries: GlossaryEntry[] }) {
  const sorted = [...entries].sort((a, b) => a.term.localeCompare(b.term))
  return (
    <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
      {sorted.map((g) => (
        <div key={g.term} className="border-t border-line pt-3">
          <dt className="text-sm font-semibold text-ink-1">{g.term}</dt>
          <dd className="mt-0.5 text-sm leading-relaxed text-ink-2">{g.definition}</dd>
        </div>
      ))}
    </dl>
  )
}
