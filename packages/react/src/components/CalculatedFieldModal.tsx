/**
 * Calculated Field Modal for React
 * UI for creating custom calculated fields with formulas
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import type { CalculatedField } from '@smallwebco/tinypivot-core'
import { validateSimpleFormula } from '@smallwebco/tinypivot-core'

interface CalculatedFieldModalProps {
  show: boolean
  availableFields: string[]
  existingField?: CalculatedField | null
  onClose: () => void
  onSave: (field: CalculatedField) => void
}

export function CalculatedFieldModal({
  show,
  availableFields,
  existingField,
  onClose,
  onSave,
}: CalculatedFieldModalProps) {
  // Form state
  const [name, setName] = useState('')
  const [formula, setFormula] = useState('')
  const [formatAs, setFormatAs] = useState<'number' | 'percent' | 'currency'>('number')
  const [decimals, setDecimals] = useState(2)
  const [error, setError] = useState<string | null>(null)

  // Reset form when modal opens
  useEffect(() => {
    if (show) {
      if (existingField) {
        setName(existingField.name)
        setFormula(existingField.formula)
        setFormatAs(existingField.formatAs || 'number')
        setDecimals(existingField.decimals ?? 2)
      } else {
        setName('')
        setFormula('')
        setFormatAs('number')
        setDecimals(2)
      }
      setError(null)
    }
  }, [show, existingField])

  // Validate formula on change
  const validationError = useMemo(() => {
    if (!formula.trim()) return null
    return validateSimpleFormula(formula, availableFields)
  }, [formula, availableFields])

  // Insert field into formula
  const insertField = useCallback((field: string) => {
    setFormula(prev => {
      if (prev.trim() && !prev.endsWith(' ')) {
        return prev + ' ' + field
      }
      return prev + field
    })
  }, [])

  // Insert operator into formula
  const insertOperator = useCallback((op: string) => {
    setFormula(prev => {
      if (prev.trim() && !prev.endsWith(' ')) {
        return prev + ' ' + op + ' '
      }
      return prev + op + ' '
    })
  }, [])

  // Save calculated field
  const handleSave = useCallback(() => {
    if (!name.trim()) {
      setError('Name is required')
      return
    }

    const validationResult = validateSimpleFormula(formula, availableFields)
    if (validationResult) {
      setError(validationResult)
      return
    }

    const field: CalculatedField = {
      id: existingField?.id || `calc_${Date.now()}`,
      name: name.trim(),
      formula: formula.trim(),
      formatAs,
      decimals,
    }

    onSave(field)
    onClose()
  }, [name, formula, formatAs, decimals, existingField, availableFields, onSave, onClose])

  // Handle overlay click
  const handleOverlayClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }, [onClose])

  if (!show) return null

  const modalContent = (
    <div className="vpg-modal-overlay" onClick={handleOverlayClick}>
      <div className="vpg-modal">
        <div className="vpg-modal-header">
          <h3>{existingField ? 'Edit' : 'Create'} Calculated Field</h3>
          <button className="vpg-modal-close" onClick={onClose}>×</button>
        </div>

        <div className="vpg-modal-body">
          {/* Name */}
          <div className="vpg-form-group">
            <label className="vpg-label">Name</label>
            <input
              type="text"
              className="vpg-input"
              placeholder="e.g., Profit Margin %"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>

          {/* Formula */}
          <div className="vpg-form-group">
            <label className="vpg-label">Formula</label>
            <textarea
              className="vpg-textarea"
              placeholder="e.g., revenue / units"
              rows={2}
              value={formula}
              onChange={e => setFormula(e.target.value)}
            />
            <div className="vpg-formula-hint">Use field names with math operators: + - * / ( )</div>
            {validationError && <div className="vpg-error">{validationError}</div>}
          </div>

          {/* Quick Insert: Operators */}
          <div className="vpg-form-group">
            <label className="vpg-label-small">Operators</label>
            <div className="vpg-button-group">
              <button className="vpg-insert-btn vpg-op-btn" onClick={() => insertOperator('+')}>+</button>
              <button className="vpg-insert-btn vpg-op-btn" onClick={() => insertOperator('-')}>−</button>
              <button className="vpg-insert-btn vpg-op-btn" onClick={() => insertOperator('*')}>×</button>
              <button className="vpg-insert-btn vpg-op-btn" onClick={() => insertOperator('/')}>÷</button>
              <button className="vpg-insert-btn vpg-op-btn" onClick={() => insertOperator('(')}>(</button>
              <button className="vpg-insert-btn vpg-op-btn" onClick={() => insertOperator(')')}>)</button>
            </div>
          </div>

          {/* Quick Insert: Fields (numeric only) */}
          <div className="vpg-form-group">
            <label className="vpg-label-small">Insert Field</label>
            {availableFields.length > 0 ? (
              <div className="vpg-button-group vpg-field-buttons">
                {availableFields.map(field => (
                  <button
                    key={field}
                    className="vpg-insert-btn vpg-field-btn"
                    onClick={() => insertField(field)}
                  >
                    {field}
                  </button>
                ))}
              </div>
            ) : (
              <div className="vpg-no-fields">No numeric fields available</div>
            )}
          </div>

          {/* Format Options */}
          <div className="vpg-form-row">
            <div className="vpg-form-group vpg-form-group-half">
              <label className="vpg-label">Format As</label>
              <select
                className="vpg-select"
                value={formatAs}
                onChange={e => setFormatAs(e.target.value as 'number' | 'percent' | 'currency')}
              >
                <option value="number">Number</option>
                <option value="percent">Percentage</option>
                <option value="currency">Currency ($)</option>
              </select>
            </div>
            <div className="vpg-form-group vpg-form-group-half">
              <label className="vpg-label">Decimals</label>
              <input
                type="number"
                className="vpg-input"
                min={0}
                max={6}
                value={decimals}
                onChange={e => setDecimals(Number(e.target.value))}
              />
            </div>
          </div>

          {/* Error */}
          {error && <div className="vpg-error vpg-error-box">{error}</div>}
        </div>

        <div className="vpg-modal-footer">
          <button className="vpg-btn vpg-btn-secondary" onClick={onClose}>Cancel</button>
          <button className="vpg-btn vpg-btn-primary" onClick={handleSave}>
            {existingField ? 'Update' : 'Add'} Field
          </button>
        </div>
      </div>
    </div>
  )

  return createPortal(modalContent, document.body)
}

