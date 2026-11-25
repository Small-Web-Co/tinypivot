/**
 * Dashboard filters: the summary each control shows, the bar in React and Vue alike, and the
 * agent turning it on through configure_chart when the user asks for filters.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { mount } from '@vue/test-utils'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { describeFilter } from '../../packages/core/src/utils'
import { createTinyPivotMcpServer, DatasetStore } from '../../packages/mcp/src/index'
import { FilterBar as ReactFilterBar } from '../../packages/react/src/components/FilterBar'
import VueFilterBar from '../../packages/vue/src/components/FilterBar.vue'

const FIELDS = [
  { field: 'region', summary: 'EMEA, APAC' },
  { field: 'plan', summary: null },
]

describe('what a dashboard filter is set to', () => {
  it('says All by leaving it null, and names values or a range otherwise', () => {
    expect(describeFilter({})).toBeNull()
    expect(describeFilter({ values: ['EMEA'] })).toBe('EMEA')
    expect(describeFilter({ values: ['EMEA', 'APAC', 'LATAM'] })).toBe('EMEA +2')
    expect(describeFilter({ numericRange: { min: 1000, max: 25000 } })).toBe('1,000 – 25,000')
    expect(describeFilter({ numericRange: { min: null, max: 500 } })).toBe('≤ 500')
    expect(describeFilter({ dateRange: { min: '2026-01-01', max: null } })).toBe('≥ 2026-01-01')
  })
})

describe('the filter bar', () => {
  it('shows each field with its filter, and the rows left with a way to clear them, in React', () => {
    const html = renderToStaticMarkup(React.createElement(ReactFilterBar, { fields: FIELDS, filteredRowCount: 1200, totalRowCount: 44714, onOpen: () => {}, onClear: () => {} }))
    expect(html).toContain('vpg-filter-chip vpg-filter-chip-active')
    expect(html).toContain('EMEA, APAC')
    expect(html).toContain('>All<')
    expect(html).toContain('1,200 of 44,714 rows')
    expect(html).toContain('Clear')
  })

  it('does the same in Vue, and opens a field\'s filter or clears them all', async () => {
    const wrapper = mount(VueFilterBar, { props: { fields: FIELDS, filteredRowCount: 1200, totalRowCount: 44714 } })
    expect(wrapper.text()).toContain('EMEA, APAC')
    expect(wrapper.text()).toContain('1,200 of 44,714 rows')
    await wrapper.findAll('.vpg-filter-chip')[1].trigger('click')
    expect(wrapper.emitted('open')?.[0]?.[0]).toBe('plan')
    await wrapper.find('.vpg-filter-bar-clear').trigger('click')
    expect(wrapper.emitted('clear')).toHaveLength(1)
  })

  it('stays quiet about rows while every filter lets everything through', () => {
    const html = renderToStaticMarkup(React.createElement(ReactFilterBar, { fields: [{ field: 'plan', summary: null }], filteredRowCount: 10, totalRowCount: 10, onOpen: () => {}, onClear: () => {} }))
    expect(html).not.toContain('rows')
    expect(html).not.toContain('Clear')
  })
})

describe('asking the agent for filters', () => {
  it('puts the named columns above every view and says which were not columns', async () => {
    vi.stubEnv('TINYPIVOT_TELEMETRY', '0')
    const store = new DatasetStore()
    const { server } = createTinyPivotMcpServer({ store })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    const client = new Client({ name: 'host', version: '1.0.0' }, { capabilities: {} })
    await server.connect(serverTransport)
    await client.connect(clientTransport)
    const rows = [{ region: 'EMEA', plan: 'Team', mrr: 10 }, { region: 'APAC', plan: 'Starter', mrr: 4 }]
    await client.callTool({ name: 'load_data', arguments: { name: 'acme', rows } })
    const result = await client.callTool({ name: 'configure_chart', arguments: { type: 'bar', xAxisField: 'region', yAxisField: 'mrr', filters: ['region', 'plan', 'nope'] } })
    const text = (result.content as Array<{ text: string }>).map(c => c.text).join('\n')
    expect(text).toContain('Filters above every view: region, plan.')
    expect(text).toContain('Not columns, so left out: nope.')
    expect(store.get()?.filterFields).toEqual(['region', 'plan'])
    vi.unstubAllEnvs()
  })
})
