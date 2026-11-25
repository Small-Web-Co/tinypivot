/**
 * Dashboard filters: one control per field, above every view, so the grid, pivot and chart can be
 * narrowed without opening the grid's column headers. Each opens the same filter as its header.
 */
import React from 'react'

export interface FilterBarField {
  field: string
  /** What the filter is set to, or null when it lets every row through. */
  summary: string | null
}

interface FilterBarProps {
  fields: FilterBarField[]
  filteredRowCount: number
  totalRowCount: number
  onOpen: (field: string, event: React.MouseEvent) => void
  onClear: () => void
}

export function FilterBar({ fields, filteredRowCount, totalRowCount, onOpen, onClear }: FilterBarProps) {
  const active = fields.some(field => field.summary !== null)
  return (
    <div className="vpg-filter-bar" role="toolbar" aria-label="Filters">
      {fields.map(({ field, summary }) => (
        <button
          key={field}
          type="button"
          className={`vpg-filter-chip${summary !== null ? ' vpg-filter-chip-active' : ''}`}
          aria-haspopup="dialog"
          onClick={event => onOpen(field, event)}
        >
          <span className="vpg-filter-chip-field">{field}</span>
          <span className="vpg-filter-chip-value">{summary ?? 'All'}</span>
          <svg className="vpg-filter-chip-caret" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path d="M5.5 7.5 10 12l4.5-4.5" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      ))}
      {active && (
        <>
          <span className="vpg-filter-bar-count">
            {`${filteredRowCount.toLocaleString()} of ${totalRowCount.toLocaleString()} rows`}
          </span>
          <button type="button" className="vpg-filter-bar-clear" onClick={onClear}>Clear</button>
        </>
      )}
    </div>
  )
}
