// Minimal structured logger. GitHub Actions renders ::warning:: / ::error:: annotations.
const inCI = !!process.env.GITHUB_ACTIONS

export interface Logger {
  info(msg: string): void
  warn(msg: string): void
  error(msg: string): void
  child(scope: string): Logger
}

export function createLogger(scope = 'pipeline'): Logger {
  const prefix = `[${scope}]`
  return {
    info: (msg) => console.log(`${prefix} ${msg}`),
    warn: (msg) => console.log(inCI ? `::warning title=${scope}::${msg}` : `${prefix} WARN ${msg}`),
    error: (msg) => console.log(inCI ? `::error title=${scope}::${msg}` : `${prefix} ERROR ${msg}`),
    child: (sub) => createLogger(`${scope}:${sub}`),
  }
}
