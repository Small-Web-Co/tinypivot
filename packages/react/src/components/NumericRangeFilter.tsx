import type { NumericRange } from '@smallwebco/tinypivot-core'
/**
 * Numeric Range Filter Component for React
 * Provides an intuitive dual-handle slider and input fields for filtering numeric data
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react'

interface NumericRangeFilterProps {
  dataMin: number
  dataMax: number
  currentRange: NumericRange | null
  onChange: (range: NumericRange | null) => void
}

export function NumericRangeFilter({
  dataMin,
  dataMax,
  currentRange,
  onChange,
}: NumericRangeFilterProps) {
  // Local state for the range values
  const [localMin, setLocalMin] = useState<number | null>(currentRange?.min ?? null)
  const [localMax, setLocalMax] = useState<number | null>(currentRange?.max ?? null)

  // Calculate step based on data range
  const step = useMemo(() => {
    const range = dataMax - dataMin
    if (range === 0)
      return 1
    if (range <= 1)
      return 0.01
    if (range <= 10)
      return 0.1
    if (range <= 100)
      return 1
    if (range <= 1000)
      return 10
    return 10 ** (Math.floor(Math.log10(range)) - 2)
  }, [dataMin, dataMax])

  // Format numbers for display
  const formatValue = useCallback((val: number | null): string => {
    if (val === null)
      return ''
    if (Number.isInteger(val))
      return val.toLocaleString()
    return val.toLocaleString(undefined, { maximumFractionDigits: 2 })
  }, [])

  // Check if filter is active
  const isFilterActive = localMin !== null || localMax !== null

  // Calculate slider percentages for visual representation
  const minPercent = useMemo(() => {
    if (localMin === null || dataMax === dataMin)
      return 0
    return ((localMin - dataMin) / (dataMax - dataMin)) * 100
  }, [localMin, dataMin, dataMax])

  const maxPercent = useMemo(() => {
    if (localMax === null || dataMax === dataMin)
      return 100
    return ((localMax - dataMin) / (dataMax - dataMin)) * 100
  }, [localMax, dataMin, dataMax])

  // Handle min slider change
  const handleMinSlider = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number.parseFloat(event.target.value)
    setLocalMin(() => {
      // Ensure min doesn't exceed max
      if (localMax !== null && value > localMax) {
        return localMax
      }
      return value
    })
  }, [localMax])

  // Handle max slider change
  const handleMaxSlider = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number.parseFloat(event.target.value)
    setLocalMax(() => {
      // Ensure max doesn't go below min
      if (localMin !== null && value < localMin) {
        return localMin
      }
      return value
    })
  }, [localMin])

  // Handle slider change complete (emit change)
  const handleSliderChange = useCallback(() => {
    if (localMin === null && localMax === null) {
      onChange(null)
    }
    else {
      onChange({ min: localMin, max: localMax })
    }
  }, [localMin, localMax, onChange])

  // Handle min input change
  const handleMinInput = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value === '' ? null : Number.parseFloat(event.target.value)
    if (value !== null && !Number.isNaN(value)) {
      // Clamp to data bounds
      setLocalMin(Math.max(dataMin, Math.min(value, localMax ?? dataMax)))
    }
    else if (value === null) {
      setLocalMin(null)
    }
  }, [dataMin, dataMax, localMax])

  // Handle max input change
  const handleMaxInput = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value === '' ? null : Number.parseFloat(event.target.value)
    if (value !== null && !Number.isNaN(value)) {
      // Clamp to data bounds
      setLocalMax(Math.min(dataMax, Math.max(value, localMin ?? dataMin)))
    }
    else if (value === null) {
      setLocalMax(null)
    }
  }, [dataMin, dataMax, localMin])

  // Handle input blur (emit change)
  const handleInputBlur = useCallback(() => {
    if (localMin === null && localMax === null) {
      onChange(null)
    }
    else {
      onChange({ min: localMin, max: localMax })
    }
  }, [localMin, localMax, onChange])

  // Clear the filter
  const clearFilter = useCallback(() => {
    setLocalMin(null)
    setLocalMax(null)
    onChange(null)
  }, [onChange])

  // Set to full range
  const setFullRange = useCallback(() => {
    setLocalMin(dataMin)
    setLocalMax(dataMax)
    onChange({ min: dataMin, max: dataMax })
  }, [dataMin, dataMax, onChange])

  // Sync with props
  useEffect(() => {
    setLocalMin(currentRange?.min ?? null)
    setLocalMax(currentRange?.max ?? null)
  }, [currentRange])

  return (
    <div className="vpg-range-filter">
      {/* Data range info */}
      <div className="vpg-range-info">
        <span className="vpg-range-label">Data range:</span>
        <span className="vpg-range-bounds">
          {formatValue(dataMin)}
          {' '}
          –
          {formatValue(dataMax)}
        </span>
      </div>

      {/* Dual slider track */}
      <div className="vpg-slider-container">
        <div className="vpg-slider-track">
          <div
            className="vpg-slider-fill"
            style={{
              left: `${minPercent}%`,
              right: `${100 - maxPercent}%`,
            }}
          />
        </div>

        {/* Min slider (lower handle) */}
        <input
          type="range"
          className="vpg-slider vpg-slider-min"
          min={dataMin}
          max={dataMax}
          step={step}
          value={localMin ?? dataMin}
          onChange={handleMinSlider}
          onMouseUp={handleSliderChange}
          onTouchEnd={handleSliderChange}
        />

        {/* Max slider (upper handle) */}
        <input
          type="range"
          className="vpg-slider vpg-slider-max"
          min={dataMin}
          max={dataMax}
          step={step}
          value={localMax ?? dataMax}
          onChange={handleMaxSlider}
          onMouseUp={handleSliderChange}
          onTouchEnd={handleSliderChange}
        />
      </div>

      {/* Input fields for precise entry */}
      <div className="vpg-range-inputs">
        <div className="vpg-input-group">
          <label className="vpg-input-label">Min</label>
          <input
            type="number"
            className="vpg-range-input"
            placeholder={formatValue(dataMin)}
            value={localMin ?? ''}
            step={step}
            onChange={handleMinInput}
            onBlur={handleInputBlur}
          />
        </div>
        <span className="vpg-input-separator">to</span>
        <div className="vpg-input-group">
          <label className="vpg-input-label">Max</label>
          <input
            type="number"
            className="vpg-range-input"
            placeholder={formatValue(dataMax)}
            value={localMax ?? ''}
            step={step}
            onChange={handleMaxInput}
            onBlur={handleInputBlur}
          />
        </div>
      </div>

      {/* Quick actions */}
      <div className="vpg-range-actions">
        <button
          className="vpg-range-btn"
          disabled={!isFilterActive}
          onClick={clearFilter}
        >
          <svg className="vpg-icon-xs" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
          Clear
        </button>
        <button className="vpg-range-btn" onClick={setFullRange}>
          <svg className="vpg-icon-xs" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
            />
          </svg>
          Full Range
        </button>
      </div>

      {/* Current filter display */}
      {isFilterActive && (
        <div className="vpg-filter-summary">
          <svg className="vpg-icon-xs" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
            />
          </svg>
          <span>
            Showing values
            {' '}
            {localMin !== null && (
              <strong>
                ≥
                {formatValue(localMin)}
              </strong>
            )}
            {localMin !== null && localMax !== null && ' and '}
            {localMax !== null && (
              <strong>
                ≤
                {formatValue(localMax)}
              </strong>
            )}
          </span>
        </div>
      )}
    </div>
  )
}
