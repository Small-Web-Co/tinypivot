/**
 * Export dropdown menu component
 * Renders a single "Export ▾" button that opens a list of format options.
 * Disabled items are shown greyed with an optional badge, but cannot be selected.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react'

export interface ExportFormat {
  key: string
  label: string
  disabled?: boolean
  badge?: string
}

interface ExportMenuProps {
  label?: string
  formats: ExportFormat[]
  onSelect: (key: string) => void
}

export function ExportMenu({ label = 'Export', formats, onSelect }: ExportMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  const toggle = useCallback(() => {
    setIsOpen(prev => !prev)
  }, [])

  const select = useCallback(
    (format: ExportFormat) => {
      if (format.disabled)
        return
      setIsOpen(false)
      onSelect(format.key)
    },
    [onSelect],
  )

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeydown)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeydown)
    }
  }, [])

  return (
    <div ref={wrapperRef} className="vpg-export-menu">
      <button
        className={`vpg-export-btn${isOpen ? ' vpg-export-btn--open' : ''}`}
        onClick={toggle}
      >
        <svg className="vpg-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        {label}
        <svg className="vpg-icon-xs vpg-export-caret" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="vpg-export-dropdown">
          {formats.map(format => (
            <button
              key={format.key}
              className={`vpg-export-item${format.disabled ? ' vpg-export-item--disabled' : ''}`}
              disabled={format.disabled}
              onClick={() => select(format)}
            >
              <span className="vpg-export-item-label">{format.label}</span>
              {format.badge && <span className="vpg-pro-badge">{format.badge}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
