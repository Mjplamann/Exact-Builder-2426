// Registry of data sources, in run order.
import type { SourceModule } from '../types.ts'
import { cdcHubs } from './cdc-hubs.ts'

export const SOURCES: SourceModule[] = [cdcHubs]
