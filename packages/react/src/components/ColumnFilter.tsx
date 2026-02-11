import type { ColumnStats, DateFormat, DateRange, NumberFormat, NumericRange } from '@smallwebco/tinypivot-core'
/**
 * Column Filter Dropdown Component for React
 * Shows unique values with checkboxes, search, and sort controls
 * For numeric and date columns, also provides a range filter option
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DateRangeFilter } from './DateRangeFilter'
import { NumericRangeFilter } from './NumericRangeFilter'

type FilterMode = 'values' | 'range'

interface ColumnFilterProps {
  columnId: string
  columnName: string
  stats: ColumnStats
  selectedValues: string[]
  sortDirection: 'asc' | 'desc' | null
  /** Current numeric range filter (if any) */
  numericRange?: NumericRange | null
  /** Current date range filter (if any) */
  dateRange?: DateRange | null
  /** Number display format */
  numberFormat?: NumberFormat
  /** Date display format */
  dateFormat?: DateFormat
  onFilter: (values: string[]) => void
  onSort: (direction: 'asc' | 'desc' | null) => void
  onClose: () => void
  /** Called when a numeric range filter is applied */
  onRangeFilter?: (range: NumericRange | null) => void
  /** Called when a date range filter is applied */
  onDateRangeFilter?: (range: DateRange | null) => void
}

export function ColumnFilter({
  columnName,
  stats,
  selectedValues,
  sortDirection,
  numericRange,
  dateRange,
  numberFormat,
  dateFormat,
  onFilter,
  onSort,
  onClose,
  onRangeFilter,
  onDateRangeFilter,
}: ColumnFilterProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [localSelected, setLocalSelected] = useState<Set<string>>(new Set(selectedValues))
  const dropdownRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Filter mode (values vs range) - available for numeric and date columns
  const isNumericColumn = stats.type === 'number'
    && stats.numericMin !== undefined
    && stats.numericMax !== undefined

  const isDateColumn = stats.type === 'date'
    && stats.dateMin !== undefined
    && stats.dateMax !== undefined

  // Determine initial mode based on existing filters
  const [filterMode, setFilterMode] = useState<FilterMode>(
    numericRange || dateRange ? 'range' : 'values',
  )

  // Local range for the numeric filter
  const [localRange, setLocalRange] = useState<NumericRange | null>(numericRange ?? null)

  // Local date range for the date filter
  const [localDateRange, setLocalDateRange] = useState<DateRange | null>(dateRange ?? null)

  // Include blank option if there are null values
  const hasBlankValues = stats.nullCount > 0

  // Filtered unique values based on search
  const filteredValues = useMemo(() => {
    const values = stats.uniqueValues
    if (!searchQuery)
      return values

    const query = searchQuery.toLowerCase()
    return values.filter(v => v.toLowerCase().includes(query))
  }, [stats.uniqueValues, searchQuery])

  // All values including blank
  const allValues = useMemo(() => {
    const values = [...filteredValues]
    if (hasBlankValues && (!searchQuery || '(blank)'.includes(searchQuery.toLowerCase()))) {
      values.unshift('(blank)')
    }
    return values
  }, [filteredValues, hasBlankValues, searchQuery])

  // Check states (kept for potential future use)
  const _isAllSelected = useMemo(
    () => allValues.every(v => localSelected.has(v)),
    [allValues, localSelected],
  )

  // Toggle single value
  const toggleValue = useCallback((value: string) => {
    setLocalSelected((prev) => {
      const next = new Set(prev)
      if (next.has(value)) {
        next.delete(value)
      }
      else {
        next.add(value)
      }
      return next
    })
  }, [])

  // Select all visible
  const selectAll = useCallback(() => {
    setLocalSelected((prev) => {
      const next = new Set(prev)
      for (const value of allValues) {
        next.add(value)
      }
      return next
    })
  }, [allValues])

  // Clear all
  const clearAll = useCallback(() => {
    setLocalSelected(new Set())
  }, [])

  // Apply filter
  const applyFilter = useCallback(() => {
    if (localSelected.size === 0) {
      onFilter([])
    }
    else {
      onFilter(Array.from(localSelected))
    }
    onClose()
  }, [localSelected, onFilter, onClose])

  // Sort handlers
  const sortAscending = useCallback(() => {
    onSort(sortDirection === 'asc' ? null : 'asc')
  }, [sortDirection, onSort])

  const sortDescending = useCallback(() => {
    onSort(sortDirection === 'desc' ? null : 'desc')
  }, [sortDirection, onSort])

  // Clear filter only
  const clearFilter = useCallback(() => {
    setLocalSelected(new Set())
    onFilter([])
    onClose()
  }, [onFilter, onClose])

  // Handle range filter change from the NumericRangeFilter component
  const handleRangeChange = useCallback((range: NumericRange | null) => {
    setLocalRange(range)
  }, [])

  // Apply the range filter
  const applyRangeFilter = useCallback(() => {
    onRangeFilter?.(localRange)
    onClose()
  }, [localRange, onRangeFilter, onClose])

  // Clear range filter
  const clearRangeFilter = useCallback(() => {
    setLocalRange(null)
    onRangeFilter?.(null)
    onClose()
  }, [onRangeFilter, onClose])

  // Handle date range filter change from the DateRangeFilter component
  const handleDateRangeChange = useCallback((range: DateRange | null) => {
    setLocalDateRange(range)
  }, [])

  // Apply the date range filter
  const applyDateRangeFilter = useCallback(() => {
    onDateRangeFilter?.(localDateRange)
    onClose()
  }, [localDateRange, onDateRangeFilter, onClose])

  // Clear date range filter
  const clearDateRangeFilter = useCallback(() => {
    setLocalDateRange(null)
    onDateRangeFilter?.(null)
    onClose()
  }, [onDateRangeFilter, onClose])

  // Click outside handler
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  // Keyboard handling
  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
      else if (event.key === 'Enter' && event.ctrlKey) {
        applyFilter()
      }
    }

    document.addEventListener('keydown', handleKeydown)
    return () => document.removeEventListener('keydown', handleKeydown)
  }, [onClose, applyFilter])

  // Focus search on mount
  useEffect(() => {
    searchInputRef.current?.focus()
  }, [])

  // Sync with props
  useEffect(() => {
    setLocalSelected(new Set(selectedValues))
  }, [selectedValues])

  // Sync numeric range with props
  useEffect(() => {
    setLocalRange(numericRange ?? null)
    if (numericRange) {
      setFilterMode('range')
    }
  }, [numericRange])

  // Sync date range with props
  useEffect(() => {
    setLocalDateRange(dateRange ?? null)
    if (dateRange) {
      setFilterMode('range')
    }
  }, [dateRange])

  return (
    <div ref={dropdownRef} className="vpg-filter-dropdown">
      {/* Header */}
      <div className="vpg-filter-header">
        <span className="vpg-filter-title">{columnName}</span>
        <span className="vpg-filter-count">
          {stats.uniqueValues.length.toLocaleString()}
          {' '}
          unique
        </span>
      </div>

      {/* Sort Controls */}
      <div className="vpg-sort-controls">
        <button
          className={`vpg-sort-btn ${sortDirection === 'asc' ? 'active' : ''}`}
          title={isNumericColumn ? 'Sort Low to High' : 'Sort A to Z'}
          onClick={sortAscending}
        >
          <svg className="vpg-icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12"
            />
          </svg>
          <span>{isNumericColumn ? '1\u21929' : 'A\u2192Z'}</span>
        </button>
        <button
          className={`vpg-sort-btn ${sortDirection === 'desc' ? 'active' : ''}`}
          title={isNumericColumn ? 'Sort High to Low' : 'Sort Z to A'}
          onClick={sortDescending}
        >
          <svg className="vpg-icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 4h13M3 8h9m-9 4h9m5-4v12m0 0l-4-4m4 4l4-4"
            />
          </svg>
          <span>{isNumericColumn ? '9\u21921' : 'Z\u2192A'}</span>
        </button>
      </div>

      <div className="vpg-divider" />

      {/* Filter Mode Tabs (for numeric and date columns) */}
      {(isNumericColumn || isDateColumn) && (
        <div className="vpg-filter-tabs">
          <button
            className={`vpg-tab-btn ${filterMode === 'values' ? 'active' : ''}`}
            onClick={() => setFilterMode('values')}
          >
            <svg className="vpg-icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
              />
            </svg>
            Values
          </button>
          <button
            className={`vpg-tab-btn ${filterMode === 'range' ? 'active' : ''}`}
            onClick={() => setFilterMode('range')}
          >
            <svg className="vpg-icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"
              />
            </svg>
            Range
          </button>
        </div>
      )}

      {/* Values Filter Mode */}
      {((!isNumericColumn && !isDateColumn) || filterMode === 'values') && (
        <>
          {/* Search */}
          <div className="vpg-search-container">
            <svg className="vpg-search-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search values..."
              className="vpg-search-input"
            />
            {searchQuery && (
              <button className="vpg-clear-search" onClick={() => setSearchQuery('')}>
                &times;
              </button>
            )}
          </div>

          {/* Select All / Clear All */}
          <div className="vpg-bulk-actions">
            <button className="vpg-bulk-btn" onClick={selectAll}>
              <svg className="vpg-icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              Select All
            </button>
            <button className="vpg-bulk-btn" onClick={clearAll}>
              <svg className="vpg-icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
              Clear All
            </button>
          </div>

          {/* Values List */}
          <div className="vpg-values-list">
            {allValues.map(value => (
              <label
                key={value}
                className={`vpg-value-item ${localSelected.has(value) ? 'selected' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={localSelected.has(value)}
                  onChange={() => toggleValue(value)}
                  className="vpg-value-checkbox"
                />
                <span className={`vpg-value-text ${value === '(blank)' ? 'vpg-blank' : ''}`}>
                  {value}
                </span>
              </label>
            ))}

            {allValues.length === 0 && <div className="vpg-no-results">No matching values</div>}
          </div>

          {/* Footer for Values Mode */}
          <div className="vpg-filter-footer">
            <button className="vpg-btn-clear" onClick={clearFilter}>
              Clear Filter
            </button>
            <button className="vpg-btn-apply" onClick={applyFilter}>
              Apply
            </button>
          </div>
        </>
      )}

      {/* Numeric Range Filter Mode */}
      {isNumericColumn && filterMode === 'range' && (
        <>
          <NumericRangeFilter
            dataMin={stats.numericMin!}
            dataMax={stats.numericMax!}
            currentRange={localRange}
            onChange={handleRangeChange}
            numberFormat={numberFormat}
          />

          {/* Footer for Range Mode */}
          <div className="vpg-filter-footer">
            <button className="vpg-btn-clear" onClick={clearRangeFilter}>
              Clear Filter
            </button>
            <button className="vpg-btn-apply" onClick={applyRangeFilter}>
              Apply
            </button>
          </div>
        </>
      )}

      {/* Date Range Filter Mode */}
      {isDateColumn && filterMode === 'range' && (
        <>
          <DateRangeFilter
            dataMin={stats.dateMin!}
            dataMax={stats.dateMax!}
            currentRange={localDateRange}
            onChange={handleDateRangeChange}
            dateFormat={dateFormat}
          />

          {/* Footer for Date Range Mode */}
          <div className="vpg-filter-footer">
            <button className="vpg-btn-clear" onClick={clearDateRangeFilter}>
              Clear Filter
            </button>
            <button className="vpg-btn-apply" onClick={applyDateRangeFilter}>
              Apply
            </button>
          </div>
        </>
      )}
    </div>
  )
}
