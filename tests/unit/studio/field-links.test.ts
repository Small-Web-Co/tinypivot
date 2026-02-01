import type { FieldLink } from '../../../packages/studio/src/types/page'
import type { LinkableWidget } from '../../../packages/studio/src/utils/field-links'
/**
 * Unit tests for field link utilities
 */
import { describe, expect, it } from 'vitest'
import {
  detectLinkableFields,
  findMatchingFields,
  getLinkedWidgetIds,
} from '../../../packages/studio/src/utils/field-links'

describe('findMatchingFields', () => {
  it('should find fields that exist in both widgets', () => {
    const widgetA: LinkableWidget = {
      id: 'widget-1',
      linkableFields: ['customer_id', 'order_date', 'region'],
    }
    const widgetB: LinkableWidget = {
      id: 'widget-2',
      linkableFields: ['customer_id', 'product_id', 'region'],
    }

    const result = findMatchingFields(widgetA, widgetB)
    expect(result).toContain('customer_id')
    expect(result).toContain('region')
    expect(result).not.toContain('order_date')
    expect(result).not.toContain('product_id')
    expect(result).toHaveLength(2)
  })

  it('should return empty array when no matching fields', () => {
    const widgetA: LinkableWidget = {
      id: 'widget-1',
      linkableFields: ['field_a', 'field_b'],
    }
    const widgetB: LinkableWidget = {
      id: 'widget-2',
      linkableFields: ['field_c', 'field_d'],
    }

    const result = findMatchingFields(widgetA, widgetB)
    expect(result).toHaveLength(0)
  })

  it('should return empty array when one widget has no fields', () => {
    const widgetA: LinkableWidget = {
      id: 'widget-1',
      linkableFields: ['field_a', 'field_b'],
    }
    const widgetB: LinkableWidget = {
      id: 'widget-2',
      linkableFields: [],
    }

    const result = findMatchingFields(widgetA, widgetB)
    expect(result).toHaveLength(0)
  })

  it('should handle identical field lists', () => {
    const widgetA: LinkableWidget = {
      id: 'widget-1',
      linkableFields: ['id', 'name', 'status'],
    }
    const widgetB: LinkableWidget = {
      id: 'widget-2',
      linkableFields: ['id', 'name', 'status'],
    }

    const result = findMatchingFields(widgetA, widgetB)
    expect(result).toHaveLength(3)
    expect(result).toEqual(['id', 'name', 'status'])
  })
})

describe('detectLinkableFields', () => {
  it('should detect fields appearing in 2+ widgets', () => {
    const widgets: LinkableWidget[] = [
      { id: 'w1', linkableFields: ['customer_id', 'order_date'] },
      { id: 'w2', linkableFields: ['customer_id', 'product_id'] },
      { id: 'w3', linkableFields: ['product_id', 'category'] },
    ]

    const result = detectLinkableFields(widgets)

    expect(result.has('customer_id')).toBe(true)
    expect(result.get('customer_id')).toEqual(['w1', 'w2'])

    expect(result.has('product_id')).toBe(true)
    expect(result.get('product_id')).toEqual(['w2', 'w3'])

    // Fields appearing only once should not be included
    expect(result.has('order_date')).toBe(false)
    expect(result.has('category')).toBe(false)
  })

  it('should handle field appearing in 3+ widgets', () => {
    const widgets: LinkableWidget[] = [
      { id: 'w1', linkableFields: ['shared_field'] },
      { id: 'w2', linkableFields: ['shared_field'] },
      { id: 'w3', linkableFields: ['shared_field'] },
    ]

    const result = detectLinkableFields(widgets)

    expect(result.has('shared_field')).toBe(true)
    expect(result.get('shared_field')).toEqual(['w1', 'w2', 'w3'])
  })

  it('should return empty map when no linkable fields', () => {
    const widgets: LinkableWidget[] = [
      { id: 'w1', linkableFields: ['unique_a'] },
      { id: 'w2', linkableFields: ['unique_b'] },
    ]

    const result = detectLinkableFields(widgets)
    expect(result.size).toBe(0)
  })

  it('should return empty map for empty widget list', () => {
    const result = detectLinkableFields([])
    expect(result.size).toBe(0)
  })

  it('should handle single widget', () => {
    const widgets: LinkableWidget[] = [
      { id: 'w1', linkableFields: ['field_a', 'field_b'] },
    ]

    const result = detectLinkableFields(widgets)
    expect(result.size).toBe(0)
  })
})

describe('getLinkedWidgetIds', () => {
  const sampleLinks: FieldLink[] = [
    {
      sourceWidgetId: 'w1',
      sourceField: 'customer_id',
      targetWidgetId: 'w2',
      targetField: 'customer_id',
    },
    {
      sourceWidgetId: 'w2',
      sourceField: 'product_id',
      targetWidgetId: 'w3',
      targetField: 'product_id',
    },
    {
      sourceWidgetId: 'w1',
      sourceField: 'region',
      targetWidgetId: 'w3',
      targetField: 'sales_region',
    },
  ]

  it('should get widget IDs linked by source field', () => {
    const result = getLinkedWidgetIds(sampleLinks, 'customer_id')
    expect(result).toContain('w1')
    expect(result).toContain('w2')
    expect(result).toHaveLength(2)
  })

  it('should get widget IDs linked by target field', () => {
    const result = getLinkedWidgetIds(sampleLinks, 'sales_region')
    expect(result).toContain('w1')
    expect(result).toContain('w3')
    expect(result).toHaveLength(2)
  })

  it('should return empty array for non-existent field', () => {
    const result = getLinkedWidgetIds(sampleLinks, 'nonexistent_field')
    expect(result).toHaveLength(0)
  })

  it('should return empty array for empty links', () => {
    const result = getLinkedWidgetIds([], 'customer_id')
    expect(result).toHaveLength(0)
  })

  it('should return unique widget IDs', () => {
    const links: FieldLink[] = [
      {
        sourceWidgetId: 'w1',
        sourceField: 'id',
        targetWidgetId: 'w2',
        targetField: 'id',
      },
      {
        sourceWidgetId: 'w1',
        sourceField: 'id',
        targetWidgetId: 'w3',
        targetField: 'id',
      },
    ]

    const result = getLinkedWidgetIds(links, 'id')
    // w1 appears twice as source but should only be included once
    expect(result.filter(id => id === 'w1')).toHaveLength(1)
    expect(result).toContain('w1')
    expect(result).toContain('w2')
    expect(result).toContain('w3')
    expect(result).toHaveLength(3)
  })
})
