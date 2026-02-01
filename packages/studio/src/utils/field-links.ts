/**
 * Field Link Utilities
 * Functions for managing field links between widgets
 */

import type { FieldLink } from '../types/page'

/**
 * Represents a widget that can be linked via fields
 */
export interface LinkableWidget {
  /** Unique widget identifier */
  id: string
  /** List of field names that can be linked */
  linkableFields: string[]
}

/**
 * Find fields that exist in both widgets' linkableFields arrays
 * @param widgetA - First widget to compare
 * @param widgetB - Second widget to compare
 * @returns Array of field names that exist in both widgets
 */
export function findMatchingFields(
  widgetA: LinkableWidget,
  widgetB: LinkableWidget,
): string[] {
  const fieldsA = new Set(widgetA.linkableFields)
  return widgetB.linkableFields.filter(field => fieldsA.has(field))
}

/**
 * Detect all fields that can be linked across widgets
 * A field is linkable if it appears in 2 or more widgets
 * @param widgets - Array of widgets to analyze
 * @returns Map of field name to array of widget IDs that have that field
 */
export function detectLinkableFields(
  widgets: LinkableWidget[],
): Map<string, string[]> {
  const fieldToWidgets = new Map<string, string[]>()

  for (const widget of widgets) {
    for (const field of widget.linkableFields) {
      const existing = fieldToWidgets.get(field) ?? []
      existing.push(widget.id)
      fieldToWidgets.set(field, existing)
    }
  }

  // Filter to only fields that appear in 2+ widgets
  const linkableFields = new Map<string, string[]>()
  for (const [field, widgetIds] of fieldToWidgets) {
    if (widgetIds.length >= 2) {
      linkableFields.set(field, widgetIds)
    }
  }

  return linkableFields
}

/**
 * Get all widget IDs that are linked by a specific field
 * @param links - Array of field links
 * @param field - Field name to search for
 * @returns Array of unique widget IDs that are linked by this field
 */
export function getLinkedWidgetIds(links: FieldLink[], field: string): string[] {
  const widgetIds = new Set<string>()

  for (const link of links) {
    if (link.sourceField === field || link.targetField === field) {
      widgetIds.add(link.sourceWidgetId)
      widgetIds.add(link.targetWidgetId)
    }
  }

  return Array.from(widgetIds)
}
