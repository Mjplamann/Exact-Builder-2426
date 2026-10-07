// "Sources & methods": every data source with its live status, how the pipeline works, how to use
// the published data, and how BioFire exports can be contributed.
import type { ReactNode } from 'react'
import type { SourceState } from '../../shared/types'
import { ISSUES_URL } from '../content/learn'
import { useDashboard } from '../lib/dashboard'
import { useAppState } from '../lib/state'
import { EmptyState } from '../components/ui'
import { ExternalLink } from '../components/learn/ExternalLink'
import { jumpToSection } from '../components/learn/LearnToc'
import { SourceCard } from '../components/sources/SourceCard'
import { STATE_LABEL, StatusIcon } from '../components/sources/StatusChip'
import { SourceSummary } from '../components/sources/SourceSummary'
import { PipelineSteps } from '../components/sources/PipelineSteps'
import { DataFiles } from '../components/sources/DataFiles'
import { BiofireGuide } from '../components/sources/BiofireGuide'

const GROUP: Record<SourceState, number> = { ok: 0, stale: 0, error: 0, pending: 1, disabled: 2 }

function Block({ id, title, intro, children }: { id: string; title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="mt-12 scroll-mt-32 lg:scroll-mt-24">
      <h2 id={`${id}-h`} className="text-xl font-semibold tracking-tight text-ink-1 outline-none sm:text-2xl">
        {title}
      </h2>
      {intro && <div className="mt-1 mb-4 max-w-3xl text-ink-2">{intro}</div>}
      {!intro && <div className="mb-4" />}
      {children}
    </section>
  )
}

export default function SourcesView() {
  const { data } = useDashboard()
  const { go } = useAppState()
  if (!data) return null
  const { manifest } = data
  const sources = manifest.sources
    .map((s, i) => ({ s, i }))
    .sort((a, b) => GROUP[a.s.state] - GROUP[b.s.state] || a.i - b.i)
    .map((x) => x.s)

  return (
    <div>
      <header className="max-w-3xl">
        <p className="text-sm font-semibold text-accent">Sources &amp; methods</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink-1 sm:text-3xl">Where the numbers come from</h1>
        <p className="mt-3 leading-relaxed text-ink-2">
          MN Pulse republishes public surveillance data from CDC, the Minnesota Department of Health and other named publishers.
          It is not an official MDH or CDC product. Below is every source, how fresh it is right now, and how the data move from
          the publisher to this page.
        </p>
      </header>

      <SourceSummary manifest={manifest} onJump={jumpToSection} />

      <Block
        id="data-sources"
        title="Data sources"
        intro="Each source shows what it measures, the area it covers, how often it updates, and when MN Pulse last fetched it."
      >
        {sources.length > 3 && (
          <nav aria-label="Jump to a source" className="mb-4">
            <ul className="flex flex-wrap gap-2">
              {sources.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => jumpToSection(`src-${s.id}`)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface-1 px-3 py-1 text-left text-sm text-ink-2 hover:bg-surface-2 hover:text-ink-1"
                  >
                    <StatusIcon state={s.state} size={14} />
                    <span>{s.name}</span>
                    <span className="sr-only">({STATE_LABEL[s.state]})</span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        )}
        {sources.length ? (
          <div className="space-y-4">
            {sources.map((s) => (
              <div key={s.id} id={`src-${s.id}`} className="scroll-mt-32 lg:scroll-mt-24">
                <SourceCard source={s} files={manifest.files} />
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="No sources are listed yet">The data pipeline has not published a manifest with sources.</EmptyState>
        )}
      </Block>

      <Block id="pipeline" title="How the data pipeline works">
        <PipelineSteps />
      </Block>

      <Block id="methods" title="Methods">
        <div className="card flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5">
          <p className="max-w-2xl text-sm leading-relaxed text-ink-2">
            How MN Pulse sets activity levels (official CDC cut-points first, otherwise the past ~3 years), labels trends, and
            builds and tests its projections is explained step by step, with the live threshold and accuracy numbers.
          </p>
          <button
            type="button"
            onClick={() => go('learn')}
            className="rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-accent-ink hover:opacity-90"
          >
            Understand the numbers →
          </button>
        </div>
      </Block>

      <Block
        id="use-the-data"
        title="Use the data"
        intro="Everything on MN Pulse is published as open JSON files that you can download or load into your own tools."
      >
        <DataFiles manifest={manifest} />
      </Block>

      <Block id="biofire-data" title="BioFire data">
        <BiofireGuide />
      </Block>

      <Block id="feedback" title="Questions, corrections and feedback">
        <div className="card p-4 sm:p-5">
          <p className="text-sm leading-relaxed text-ink-2">
            Spotted a number that looks wrong, a source that should be added, or something hard to understand? Please open an issue
            on GitHub. Include the page, the number and the date you saw it. For health questions about your own situation, contact
            a health care provider.
          </p>
          <p className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm">
            <ExternalLink href={`${ISSUES_URL}/new`}>Open a new issue</ExternalLink>
            <ExternalLink href={ISSUES_URL}>See existing issues (Mjplamann/Exact-Builder-2426)</ExternalLink>
          </p>
        </div>
      </Block>
    </div>
  )
}
