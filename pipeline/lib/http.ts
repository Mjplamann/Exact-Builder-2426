// HTTP helpers with timeouts, retries and a descriptive User-Agent.
// Node's built-in fetch only honors HTTPS_PROXY when NODE_USE_ENV_PROXY=1 (Node >= 22.21);
// the npm scripts set it so local runs behind a proxy work. GitHub Actions needs no proxy.

const USER_AGENT =
  'MN-Pulse/0.1 (+https://github.com/Mjplamann/Exact-Builder-2426; public-health dashboard; contact via GitHub issues)'

export class HttpError extends Error {
  constructor(
    public url: string,
    public status: number,
    public body: string,
  ) {
    super(`HTTP ${status} for ${url}${body ? `: ${body.slice(0, 200)}` : ''}`)
  }
}

export interface FetchOptions {
  timeoutMs?: number
  retries?: number
  headers?: Record<string, string>
  /** Return null instead of throwing on 404. */
  allow404?: boolean
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function fetchWithRetry(url: string, opts: FetchOptions = {}): Promise<Response | null> {
  const { timeoutMs = 60_000, retries = 3, headers = {}, allow404 = false } = opts
  let lastErr: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: '*/*', ...headers },
        signal: AbortSignal.timeout(timeoutMs),
        redirect: 'follow',
      })
      if (res.status === 404 && allow404) return null
      if (res.ok) return res
      const body = await res.text().catch(() => '')
      const err = new HttpError(url, res.status, body)
      // Retry only on throttling and server errors.
      if (res.status !== 429 && res.status < 500) throw err
      lastErr = err
    } catch (e) {
      if (e instanceof HttpError && e.status !== 429 && e.status < 500) throw e
      lastErr = e
    }
    if (attempt < retries) await sleep(1000 * 2 ** attempt)
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
}

export async function fetchText(url: string, opts?: FetchOptions): Promise<string> {
  const res = await fetchWithRetry(url, opts)
  if (!res) throw new HttpError(url, 404, '')
  return res.text()
}

export async function fetchTextOrNull(url: string, opts?: FetchOptions): Promise<string | null> {
  const res = await fetchWithRetry(url, { ...opts, allow404: true })
  return res ? res.text() : null
}

export async function fetchJson<T = unknown>(url: string, opts?: FetchOptions): Promise<T> {
  const res = await fetchWithRetry(url, { ...opts, headers: { Accept: 'application/json', ...opts?.headers } })
  if (!res) throw new HttpError(url, 404, '')
  return (await res.json()) as T
}

export async function fetchBuffer(url: string, opts?: FetchOptions): Promise<ArrayBuffer> {
  const res = await fetchWithRetry(url, opts)
  if (!res) throw new HttpError(url, 404, '')
  return res.arrayBuffer()
}
