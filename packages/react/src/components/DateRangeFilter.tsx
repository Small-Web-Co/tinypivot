import type { DateFormat, DateRange } from '@smallwebco/tinypivot-core'
import { formatDate, getDatePlaceholder, parseDateInput } from '@smallwebco/tinypivot-core'
import React, { useCallback, useEffect, useMemo, useState } from 'react'

interface DateRangeFilterProps {
  dataMin: string // ISO date string
  dataMax: string // ISO date string
  currentRange: DateRange | null
  onChange: (range: DateRange | null) => void
  dateFormat?: DateFormat
}

export function DateRangeFilter({
  dataMin,
  dataMax,
  currentRange,
  onChange,
  dateFormat = 'iso',
}: DateRangeFilterProps) {
  const [localMinText, setLocalMinText] = useState('')
  const [localMaxText, setLocalMaxText] = useState('')
  const [minError, setMinError] = useState(false)
  const [maxError, setMaxError] = useState(false)

  const formattedMin = useMemo(() => formatDate(dataMin, dateFormat), [dataMin, dateFormat])
  const formattedMax = useMemo(() => formatDate(dataMax, dateFormat), [dataMax, dateFormat])

  const isFilterActive = localMinText !== '' || localMaxText !== ''

  const emitChange = useCallback(() => {
    const min = localMinText ? parseDateInput(localMinText, dateFormat) : null
    const max = localMaxText ? parseDateInput(localMaxText, dateFormat) : null
    if (min === null && max === null) {
      onChange(null)
    }
    else {
      onChange({ min, max })
    }
  }, [localMinText, localMaxText, dateFormat, onChange])

  const handleMinBlur = useCallback(() => {
    if (localMinText === '') {
      setMinError(false)
      emitChange()
      return
    }
    const parsed = parseDateInput(localMinText, dateFormat)
    setMinError(parsed === null)
    if (parsed !== null)
      emitChange()
  }, [localMinText, dateFormat, emitChange])

  const handleMaxBlur = useCallback(() => {
    if (localMaxText === '') {
      setMaxError(false)
      emitChange()
      return
    }
    const parsed = parseDateInput(localMaxText, dateFormat)
    setMaxError(parsed === null)
    if (parsed !== null)
      emitChange()
  }, [localMaxText, dateFormat, emitChange])

  const clearFilter = useCallback(() => {
    setLocalMinText('')
    setLocalMaxText('')
    setMinError(false)
    setMaxError(false)
    onChange(null)
  }, [onChange])

  const setFullRange = useCallback(() => {
    setLocalMinText(formatDate(dataMin, dateFormat))
    setLocalMaxText(formatDate(dataMax, dateFormat))
    setMinError(false)
    setMaxError(false)
    onChange({ min: dataMin, max: dataMax })
  }, [dataMin, dataMax, dateFormat, onChange])

  // Sync with props
  useEffect(() => {
    if (currentRange?.min) {
      setLocalMinText(formatDate(currentRange.min, dateFormat))
    }
    else {
      setLocalMinText('')
    }
    if (currentRange?.max) {
      setLocalMaxText(formatDate(currentRange.max, dateFormat))
    }
    else {
      setLocalMaxText('')
    }
    setMinError(false)
    setMaxError(false)
  }, [currentRange, dateFormat])

  const handleKeyDown = useCallback((e: React.KeyboardEvent, handler: () => void) => {
    if (e.key === 'Enter')
      handler()
  }, [])

  return (
    <div className="vpg-range-filter">
      <div className="vpg-range-info">
        <span className="vpg-range-label">Data range:</span>
        <span className="vpg-range-bounds">
          {formattedMin}
          {' '}
          &ndash;
          {' '}
          {formattedMax}
        </span>
      </div>

      <div className="vpg-range-inputs">
        <div className="vpg-input-group">
          <label className="vpg-input-label">From</label>
          <input
            type="text"
            className={`vpg-range-input ${minError ? 'vpg-input-error' : ''}`}
            placeholder={getDatePlaceholder(dateFormat)}
            value={localMinText}
            onChange={e => setLocalMinText(e.target.value)}
            onBlur={handleMinBlur}
            onKeyDown={e => handleKeyDown(e, handleMinBlur)}
          />
        </div>
        <span className="vpg-input-separator">to</span>
        <div className="vpg-input-group">
          <label className="vpg-input-label">To</label>
          <input
            type="text"
            className={`vpg-range-input ${maxError ? 'vpg-input-error' : ''}`}
            placeholder={getDatePlaceholder(dateFormat)}
            value={localMaxText}
            onChange={e => setLocalMaxText(e.target.value)}
            onBlur={handleMaxBlur}
            onKeyDown={e => handleKeyDown(e, handleMaxBlur)}
          />
        </div>
      </div>

      <div className="vpg-range-actions">
        <button className="vpg-range-btn" disabled={!isFilterActive} onClick={clearFilter}>
          <svg className="vpg-icon-xs" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
          Clear
        </button>
        <button className="vpg-range-btn" onClick={setFullRange}>
          <svg className="vpg-icon-xs" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
          </svg>
          Full Range
        </button>
      </div>

      {isFilterActive && !minError && !maxError && (
        <div className="vpg-filter-summary">
          <svg className="vpg-icon-xs" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          <span>
            Showing dates
            {localMinText && (
              <strong>
                {' '}
                from
                {' '}
                {localMinText}
              </strong>
            )}
            {localMinText && localMaxText && ' '}
            {localMaxText && (
              <strong>
                to
                {' '}
                {localMaxText}
              </strong>
            )}
          </span>
        </div>
      )}
    </div>
  )
}
