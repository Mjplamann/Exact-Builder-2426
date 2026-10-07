// "How the data pipeline works": numbered steps plus the stale rule and the no-synthetic-data promise.
import { NO_SYNTHETIC, PIPELINE_STEPS, REPO_URL, STALE_RULE } from '../../content/learn'
import { ExternalLink } from '../learn/ExternalLink'

export function PipelineSteps() {
  return (
    <div>
      <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {PIPELINE_STEPS.map((s, i) => (
          <li key={s.title} className="card relative p-4">
            <span
              aria-hidden="true"
              className="tabular flex h-7 w-7 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-ink-1"
            >
              {i + 1}
            </span>
            <h3 className="mt-2 text-sm font-semibold text-ink-1">{s.title}</h3>
            <p className="mt-1 text-sm leading-relaxed text-ink-2">{s.text}</p>
          </li>
        ))}
      </ol>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-line bg-accent-soft p-4">
          <p className="text-sm font-semibold text-ink-1">No synthetic data</p>
          <p className="mt-1 text-sm leading-relaxed text-ink-2">{NO_SYNTHETIC}</p>
        </div>
        <div className="rounded-xl border border-line bg-surface-1 p-4">
          <p className="text-sm font-semibold text-ink-1">Freshness</p>
          <p className="mt-1 text-sm leading-relaxed text-ink-2">{STALE_RULE}</p>
          <p className="mt-2 text-sm">
            <ExternalLink href={`${REPO_URL}/blob/main/.github/workflows/refresh-data.yml`}>See the refresh workflow</ExternalLink>
          </p>
        </div>
      </div>
    </div>
  )
}
