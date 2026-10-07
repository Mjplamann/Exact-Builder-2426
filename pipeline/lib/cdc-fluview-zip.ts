// Minimal in-memory ZIP reader for the CDC FluView Interactive download (a small zip of CSVs).
// Supports "stored" (0) and "deflate" (8) entries; no ZIP64, encryption or multi-disk archives,
// none of which CDC uses for these files. Avoids a new dependency or shelling out to `unzip`.
import { inflateRawSync } from 'node:zlib'

const EOCD_SIG = 0x06054b50
const CDIR_SIG = 0x02014b50
const LOCAL_SIG = 0x04034b50

/** Returns every file in the archive keyed by its path inside the zip. */
export function unzipEntries(input: ArrayBuffer | Uint8Array): Map<string, Uint8Array> {
  const buf = input instanceof Uint8Array ? input : new Uint8Array(input)
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  // End-of-central-directory record: 22 bytes plus an optional comment of up to 65,535 bytes.
  let eocd = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (view.getUint32(i, true) === EOCD_SIG) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error('not a zip archive (no end-of-central-directory record)')
  const count = view.getUint16(eocd + 10, true)
  let p = view.getUint32(eocd + 16, true)
  const out = new Map<string, Uint8Array>()
  const decoder = new TextDecoder()
  for (let n = 0; n < count; n++) {
    if (view.getUint32(p, true) !== CDIR_SIG) throw new Error(`corrupt zip central directory at byte ${p}`)
    const method = view.getUint16(p + 10, true)
    const compSize = view.getUint32(p + 20, true)
    const nameLen = view.getUint16(p + 28, true)
    const extraLen = view.getUint16(p + 30, true)
    const commentLen = view.getUint16(p + 32, true)
    const localOffset = view.getUint32(p + 42, true)
    const name = decoder.decode(buf.subarray(p + 46, p + 46 + nameLen))
    p += 46 + nameLen + extraLen + commentLen
    if (name.endsWith('/')) continue // directory entry
    if (view.getUint32(localOffset, true) !== LOCAL_SIG) throw new Error(`corrupt zip local header for ${name}`)
    const start = localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true)
    const data = buf.subarray(start, start + compSize)
    if (method === 0) out.set(name, data)
    else if (method === 8) out.set(name, new Uint8Array(inflateRawSync(data)))
    else throw new Error(`unsupported zip compression method ${method} for ${name}`)
  }
  return out
}
