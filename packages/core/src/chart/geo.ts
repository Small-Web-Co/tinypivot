/**
 * Choropleth region matching. Turns the labels in a dataset ("France", "FRA",
 * "250", "CA", "California", "EMEA") into the shape codes the bundled maps use:
 * ISO 3166-1 alpha-2 for the world map, USPS postal codes for US states.
 */
import type { ChartGeography } from '../types'
import { COUNTRY_ROWS } from './geo-codes'

export type ResolvedGeography = Exclude<ChartGeography, 'auto'>

/** [FIPS, USPS, name] for the states, DC and Puerto Rico as us-atlas draws them. */
export const US_STATE_ROWS: ReadonlyArray<readonly [string, string, string]> = [
  ['01', 'AL', 'Alabama'],
  ['02', 'AK', 'Alaska'],
  ['04', 'AZ', 'Arizona'],
  ['05', 'AR', 'Arkansas'],
  ['06', 'CA', 'California'],
  ['08', 'CO', 'Colorado'],
  ['09', 'CT', 'Connecticut'],
  ['10', 'DE', 'Delaware'],
  ['11', 'DC', 'District of Columbia'],
  ['12', 'FL', 'Florida'],
  ['13', 'GA', 'Georgia'],
  ['15', 'HI', 'Hawaii'],
  ['16', 'ID', 'Idaho'],
  ['17', 'IL', 'Illinois'],
  ['18', 'IN', 'Indiana'],
  ['19', 'IA', 'Iowa'],
  ['20', 'KS', 'Kansas'],
  ['21', 'KY', 'Kentucky'],
  ['22', 'LA', 'Louisiana'],
  ['23', 'ME', 'Maine'],
  ['24', 'MD', 'Maryland'],
  ['25', 'MA', 'Massachusetts'],
  ['26', 'MI', 'Michigan'],
  ['27', 'MN', 'Minnesota'],
  ['28', 'MS', 'Mississippi'],
  ['29', 'MO', 'Missouri'],
  ['30', 'MT', 'Montana'],
  ['31', 'NE', 'Nebraska'],
  ['32', 'NV', 'Nevada'],
  ['33', 'NH', 'New Hampshire'],
  ['34', 'NJ', 'New Jersey'],
  ['35', 'NM', 'New Mexico'],
  ['36', 'NY', 'New York'],
  ['37', 'NC', 'North Carolina'],
  ['38', 'ND', 'North Dakota'],
  ['39', 'OH', 'Ohio'],
  ['40', 'OK', 'Oklahoma'],
  ['41', 'OR', 'Oregon'],
  ['42', 'PA', 'Pennsylvania'],
  ['44', 'RI', 'Rhode Island'],
  ['45', 'SC', 'South Carolina'],
  ['46', 'SD', 'South Dakota'],
  ['47', 'TN', 'Tennessee'],
  ['48', 'TX', 'Texas'],
  ['49', 'UT', 'Utah'],
  ['50', 'VT', 'Vermont'],
  ['51', 'VA', 'Virginia'],
  ['53', 'WA', 'Washington'],
  ['54', 'WV', 'West Virginia'],
  ['55', 'WI', 'Wisconsin'],
  ['56', 'WY', 'Wyoming'],
  ['72', 'PR', 'Puerto Rico'],
]

const US_STATE_ALIASES: Record<string, string> = {
  'washington dc': 'DC',
  'washington d c': 'DC',
  'd c': 'DC',
  'dist of columbia': 'DC',
  'washington state': 'WA',
  'new york state': 'NY',
}

/** Lowercase, strip accents and punctuation, `&` → `and`, collapse spaces, drop a leading "the". */
export function normalizeRegionName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/^the /, '')
}

// ---------------------------------------------------------------------------
// Region groups (sales territories, continents, blocs)
// ---------------------------------------------------------------------------

const MIDDLE_EAST = ['AE', 'BH', 'IL', 'IQ', 'IR', 'JO', 'KW', 'LB', 'OM', 'PS', 'QA', 'SA', 'SY', 'TR', 'YE']
const NORTH_AFRICA = ['DZ', 'EG', 'EH', 'LY', 'MA', 'TN']
const CENTRAL_AMERICA = ['BZ', 'CR', 'GT', 'HN', 'NI', 'PA', 'SV']
/** North American countries that are not Latin America. */
const ANGLO_NORTH_AMERICA = ['US', 'CA', 'GL', 'BM', 'PM']
const EU_MEMBERS = ['AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK']

function continent(code: string): string[] {
  return COUNTRY_ROWS.filter(r => r[3] === code).map(r => r[0])
}

function without(list: string[], drop: string[]): string[] {
  const dropSet = new Set(drop)
  return list.filter(c => !dropSet.has(c))
}

interface RegionGroup {
  names: string[]
  members: () => string[]
}

const latinAmerica = (): string[] => [...without(continent('NA'), ANGLO_NORTH_AMERICA), ...continent('SA')]

const REGION_GROUPS: RegionGroup[] = [
  { names: ['africa'], members: () => continent('AF') },
  { names: ['asia'], members: () => continent('AS') },
  { names: ['europe', 'eur'], members: () => continent('EU') },
  { names: ['south america', 'samer'], members: () => continent('SA') },
  { names: ['oceania', 'australia and oceania'], members: () => continent('OC') },
  { names: ['antarctica'], members: () => continent('AN') },
  { names: ['americas', 'the americas', 'amer', 'amers'], members: () => [...continent('NA'), ...continent('SA')] },
  { names: ['latin america', 'latam', 'lac', 'latin america and caribbean', 'latin america and the caribbean'], members: latinAmerica },
  { names: ['central america'], members: () => CENTRAL_AMERICA },
  { names: ['caribbean'], members: () => without(continent('NA'), [...ANGLO_NORTH_AMERICA, 'MX', ...CENTRAL_AMERICA]) },
  { names: ['middle east'], members: () => MIDDLE_EAST },
  { names: ['mena', 'middle east and north africa'], members: () => [...MIDDLE_EAST, ...NORTH_AFRICA] },
  { names: ['north africa'], members: () => NORTH_AFRICA },
  { names: ['sub saharan africa', 'ssa'], members: () => without(continent('AF'), NORTH_AFRICA) },
  { names: ['emea', 'europe middle east and africa'], members: () => [...continent('EU'), ...continent('AF'), ...MIDDLE_EAST] },
  { names: ['apac', 'asia pacific', 'apj', 'asia pacific and japan', 'apjc'], members: () => [...without(continent('AS'), MIDDLE_EAST), ...continent('OC')] },
  { names: ['european union', 'eu27', 'eu 27'], members: () => EU_MEMBERS },
  { names: ['dach'], members: () => ['DE', 'AT', 'CH'] },
  { names: ['benelux'], members: () => ['BE', 'NL', 'LU'] },
  { names: ['nordics', 'nordic', 'nordic countries'], members: () => ['DK', 'FI', 'IS', 'NO', 'SE'] },
  { names: ['scandinavia'], members: () => ['DK', 'NO', 'SE'] },
  { names: ['uk and ireland', 'uki', 'uk and i', 'british isles'], members: () => ['GB', 'IE'] },
  { names: ['anz', 'australia and new zealand', 'australasia'], members: () => ['AU', 'NZ'] },
  { names: ['gcc', 'gulf', 'gulf states'], members: () => ['AE', 'BH', 'KW', 'OM', 'QA', 'SA'] },
  { names: ['southeast asia', 'south east asia', 'sea', 'asean'], members: () => ['BN', 'ID', 'KH', 'LA', 'MM', 'MY', 'PH', 'SG', 'TH', 'VN'] },
  { names: ['east asia'], members: () => ['CN', 'HK', 'JP', 'KP', 'KR', 'MN', 'MO', 'TW'] },
  { names: ['south asia'], members: () => ['AF', 'BD', 'BT', 'IN', 'LK', 'MV', 'NP', 'PK'] },
  { names: ['cee', 'central and eastern europe', 'eastern europe'], members: () => ['AL', 'BA', 'BG', 'BY', 'CZ', 'EE', 'HR', 'HU', 'LT', 'LV', 'MD', 'ME', 'MK', 'PL', 'RO', 'RS', 'SI', 'SK', 'UA', 'XK'] },
]

/** "North America" means the continent, unless the data also has a Latin America row. */
const NORTH_AMERICA_NAMES = ['north america', 'namer', 'noram', 'nam', 'us and canada']

// ---------------------------------------------------------------------------
// Lookup indexes, built on first use
// ---------------------------------------------------------------------------

interface GeoIndexes {
  country: Map<string, string>
  group: Map<string, () => string[]>
  state: Map<string, string>
}

let indexes: GeoIndexes | null = null

function buildIndexes(): GeoIndexes {
  const country = new Map<string, string>()
  for (const [alpha2, alpha3, numeric, , ...names] of COUNTRY_ROWS) {
    for (const key of [alpha2, alpha3, numeric, String(Number(numeric)), ...names])
      country.set(normalizeRegionName(key), alpha2)
  }
  // Common shorthands the ISO name list leaves out.
  for (const [alias, alpha2] of [['uk', 'GB'], ['england', 'GB'], ['britain', 'GB'], ['great britain', 'GB'], ['holland', 'NL'], ['korea', 'KR'], ['russia', 'RU'], ['czech republic', 'CZ'], ['turkiye', 'TR'], ['uae', 'AE'], ['dr congo', 'CD'], ['drc', 'CD']] as const)
    country.set(alias, alpha2)
  const group = new Map<string, () => string[]>()
  for (const g of REGION_GROUPS) {
    for (const name of g.names)
      group.set(normalizeRegionName(name), g.members)
  }
  const state = new Map<string, string>()
  for (const [fips, postal, name] of US_STATE_ROWS) {
    for (const key of [fips, postal, name, String(Number(fips))])
      state.set(normalizeRegionName(key), postal)
  }
  for (const [alias, postal] of Object.entries(US_STATE_ALIASES))
    state.set(alias, postal)
  return { country, group, state }
}

function getIndexes(): GeoIndexes {
  indexes ??= buildIndexes()
  return indexes
}

export type RegionKind = 'country' | 'state' | 'region'

export interface RegionMatch {
  kind: RegionKind
  /** Shape codes: ISO alpha-2 (world) or USPS (US states) */
  codes: string[]
}

interface MatchContext {
  hasLatinAmerica: boolean
}

function matchWorld(norm: string, ctx: MatchContext): RegionMatch | null {
  const { country, group } = getIndexes()
  if (NORTH_AMERICA_NAMES.includes(norm))
    return { kind: 'region', codes: ctx.hasLatinAmerica ? ['US', 'CA'] : continent('NA') }
  // Country codes win over region shorthands, so "SA" is Saudi Arabia and "ME" Montenegro.
  const alpha2 = country.get(norm)
  if (alpha2)
    return { kind: 'country', codes: [alpha2] }
  const members = group.get(norm)
  return members ? { kind: 'region', codes: members() } : null
}

function matchUsState(norm: string): RegionMatch | null {
  const postal = getIndexes().state.get(norm)
  return postal ? { kind: 'state', codes: [postal] } : null
}

/** Match one label on one map, or `null` when it names nothing there. */
export function matchRegion(label: string, geography: ResolvedGeography, ctx: MatchContext = { hasLatinAmerica: false }): RegionMatch | null {
  const norm = normalizeRegionName(label)
  if (!norm)
    return null
  return geography === 'us-states' ? matchUsState(norm) : matchWorld(norm, ctx)
}

function contextFor(labels: string[]): MatchContext {
  const { group } = getIndexes()
  const latam = group.get('latin america')
  return { hasLatinAmerica: labels.some(l => group.get(normalizeRegionName(l)) === latam) }
}

/**
 * Pick the map for a set of labels: US states when more labels name a state
 * than a country or region, otherwise the world map.
 */
export function detectGeography(labels: string[]): ResolvedGeography {
  const ctx = contextFor(labels)
  let states = 0
  let world = 0
  for (const label of labels) {
    if (matchRegion(label, 'us-states'))
      states++
    if (matchRegion(label, 'world', ctx))
      world++
  }
  return states > world ? 'us-states' : 'world'
}

export interface MatchedRegion<T> extends RegionMatch {
  label: string
  value: T
}

export interface RegionMatchResult<T> {
  geography: ResolvedGeography
  regions: Array<MatchedRegion<T>>
  /** Labels that name nothing on the chosen map */
  unmatched: string[]
  /** Shape code → the region that colours it. A country row wins over a region group containing it. */
  byCode: Map<string, MatchedRegion<T>>
}

/** Match labelled values onto a map. `'auto'` chooses the map from the labels. */
export function matchRegions<T>(entries: Array<{ label: string, value: T }>, geography: ChartGeography = 'auto'): RegionMatchResult<T> {
  const labels = entries.map(e => e.label)
  const resolved = geography === 'auto' ? detectGeography(labels) : geography
  const ctx = contextFor(labels)
  const regions: Array<MatchedRegion<T>> = []
  const unmatched: string[] = []
  for (const entry of entries) {
    const match = matchRegion(entry.label, resolved, ctx)
    if (match)
      regions.push({ ...match, label: entry.label, value: entry.value })
    else
      unmatched.push(entry.label)
  }
  const byCode = new Map<string, MatchedRegion<T>>()
  // Groups first so a specific country or state row overwrites its group's colour.
  for (const region of [...regions].sort((a, b) => Number(a.kind !== 'region') - Number(b.kind !== 'region'))) {
    for (const code of region.codes)
      byCode.set(code, region)
  }
  return { geography: resolved, regions, unmatched, byCode }
}

/** World-atlas shape id (ISO numeric) → alpha-2, plus the unnumbered shapes it draws by name. */
export function worldShapeCode(id: string | number | undefined, name: string | undefined): string | null {
  const { country } = getIndexes()
  if (id !== undefined && id !== null && String(id) !== '') {
    const code = country.get(String(id).padStart(3, '0'))
    if (code)
      return code
  }
  return name ? country.get(normalizeRegionName(name)) ?? null : null
}

/** us-atlas shape id (FIPS) → USPS code. */
export function usStateShapeCode(id: string | number | undefined): string | null {
  if (id === undefined || id === null)
    return null
  return getIndexes().state.get(String(id).padStart(2, '0')) ?? null
}

const STATE_NAME_BY_POSTAL = new Map(US_STATE_ROWS.map(([, postal, name]) => [postal, name]))

/** Readable name for a matched region: "Oregon" for a row labelled "OR", else the label as written. */
export function regionDisplayName(region: RegionMatch & { label: string }): string {
  return region.kind === 'state' ? STATE_NAME_BY_POSTAL.get(region.codes[0]) ?? region.label : region.label
}
