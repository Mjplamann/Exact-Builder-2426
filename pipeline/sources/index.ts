// Registry of data sources, in run order. Each runs in isolation (see pipeline/run.ts).
import type { SourceModule } from '../types.ts'
import { cdcHubs } from './cdc-hubs.ts'
import { cdcNssp } from './cdc-nssp.ts'
import { cdcNwss } from './cdc-nwss.ts'
import { wastewaterscan } from './wastewaterscan.ts'
import { cdcNrevss } from './cdc-nrevss.ts'
import { cdcRespnet } from './cdc-respnet.ts'
import { cdcNndss } from './cdc-nndss.ts'
import { cdcFluview } from './cdc-fluview.ts'
import { cdcCfaRt } from './cdc-cfa-rt.ts'
import { mdh } from './mdh.ts'
import { biofire } from './biofire.ts'

export const SOURCES: SourceModule[] = [
  cdcHubs,
  cdcNssp,
  cdcNwss,
  wastewaterscan,
  cdcNrevss,
  cdcRespnet,
  cdcNndss,
  cdcFluview,
  cdcCfaRt,
  mdh,
  biofire,
]
