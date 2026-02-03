/**
 * ShareModal Component
 * Modal for configuring page sharing settings (visibility, access level, password, etc.)
 */
import type { PageShare, PageShareSettings } from '@smallwebco/tinypivot-studio'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * Props for ShareModal component
 */
export interface ShareModalProps {
  /** Whether the modal is open */
  isOpen: boolean
  /** ID of the page being shared */
  pageId: string
  /** Title of the page (for display) */
  pageTitle: string
  /** Existing share configuration (if already shared) */
  existingShare?: PageShare | null
  /** Callback when user closes the modal */
  onClose: () => void
  /** Callback when user saves share settings */
  onSave: (settings: Partial<PageShareSettings>) => void
  /** Callback when user revokes the share link */
  onRevoke: () => void
}

/**
 * ShareModal - Modal for configuring page sharing settings
 *
 * @example
 * ```tsx
 * import { ShareModal } from '@smallwebco/tinypivot-studio-react'
 *
 * function PageActions({ page, share }) {
 *   const [isOpen, setIsOpen] = useState(false)
 *
 *   return (
 *     <>
 *       <button onClick={() => setIsOpen(true)}>Share</button>
 *       <ShareModal
 *         isOpen={isOpen}
 *         pageId={page.id}
 *         pageTitle={page.title}
 *         existingShare={share}
 *         onClose={() => setIsOpen(false)}
 *         onSave={(settings) => handleSave(settings)}
 *         onRevoke={() => handleRevoke()}
 *       />
 *     </>
 *   )
 * }
 * ```
 */
export function ShareModal({
  isOpen,
  pageTitle,
  existingShare,
  onClose,
  onSave,
  onRevoke,
}: ShareModalProps) {
  // Form state
  const [visibility, setVisibility] = useState<'public' | 'unlisted' | 'password'>('unlisted')
  const [accessLevel, setAccessLevel] = useState<'view' | 'interact' | 'duplicate'>('view')
  const [password, setPassword] = useState('')
  const [showAuthor, setShowAuthor] = useState(true)
  const [allowEmbed, setAllowEmbed] = useState(false)
  const [allowExport, setAllowExport] = useState(true)
  const [copySuccess, setCopySuccess] = useState(false)

  // Sync form state with existing share
  useEffect(() => {
    if (existingShare) {
      setVisibility(existingShare.settings.visibility)
      setAccessLevel(existingShare.settings.accessLevel)
      setShowAuthor(existingShare.settings.showAuthor)
      setAllowEmbed(existingShare.settings.allowEmbed)
      setAllowExport(existingShare.settings.allowExport)
    }
    else {
      // Reset to defaults when no share exists
      setVisibility('unlisted')
      setAccessLevel('view')
      setPassword('')
      setShowAuthor(true)
      setAllowEmbed(false)
      setAllowExport(true)
    }
  }, [existingShare])

  // Computed share URL
  const shareUrl = useMemo(() => {
    if (!existingShare)
      return null
    return `${window.location.origin}/view/${existingShare.token}`
  }, [existingShare])

  const handleSave = useCallback(() => {
    onSave({
      visibility,
      accessLevel,
      password: visibility === 'password' ? password : undefined,
      showAuthor,
      allowEmbed,
      allowExport,
      enabled: true,
    })
  }, [visibility, accessLevel, password, showAuthor, allowEmbed, allowExport, onSave])

  const handleCopyLink = useCallback(async () => {
    if (shareUrl) {
      try {
        await navigator.clipboard.writeText(shareUrl)
        setCopySuccess(true)
        setTimeout(() => {
          setCopySuccess(false)
        }, 2000)
      }
      catch {
        // Fallback for older browsers
        const input = document.createElement('input')
        input.value = shareUrl
        document.body.appendChild(input)
        input.select()
        document.execCommand('copy')
        document.body.removeChild(input)
        setCopySuccess(true)
        setTimeout(() => {
          setCopySuccess(false)
        }, 2000)
      }
    }
  }, [shareUrl])

  const handleRevoke = useCallback(() => {
    if (confirm('Are you sure you want to revoke this share link? Anyone with the link will no longer be able to access this page.')) {
      onRevoke()
    }
  }, [onRevoke])

  const handleOverlayClick = useCallback(
    (event: React.MouseEvent) => {
      if (event.target === event.currentTarget) {
        onClose()
      }
    },
    [onClose],
  )

  // Get access level help text
  const accessLevelHelp = useMemo(() => {
    switch (accessLevel) {
      case 'view':
        return 'Viewers can only see the content. No interactivity.'
      case 'interact':
        return 'Viewers can use filters and interact with charts.'
      case 'duplicate':
        return 'Viewers can duplicate this page to their own account.'
      default:
        return ''
    }
  }, [accessLevel])

  if (!isOpen)
    return null

  const modalContent = (
    <div className="tps-modal-overlay" onClick={handleOverlayClick}>
      <div
        className="tps-modal tps-share-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-modal-title"
      >
        <header className="tps-modal-header">
          <h2 id="share-modal-title">
            Share &quot;
            {pageTitle}
            &quot;
          </h2>
          <button
            type="button"
            className="tps-modal-close"
            aria-label="Close modal"
            onClick={onClose}
          >
            &times;
          </button>
        </header>

        <div className="tps-modal-body">
          {/* Share link display when exists */}
          {existingShare && shareUrl && (
            <div className="tps-share-url">
              <label className="tps-share-url-label">Share Link</label>
              <div className="tps-share-url-input">
                <input type="text" value={shareUrl} readOnly aria-label="Share URL" />
                <button
                  type="button"
                  className="tps-btn tps-btn-secondary"
                  onClick={handleCopyLink}
                >
                  {copySuccess ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <p className="tps-share-stats">
                {existingShare.viewCount}
                {' '}
                {existingShare.viewCount === 1 ? 'view' : 'views'}
              </p>
            </div>
          )}

          {/* Visibility select */}
          <div className="tps-form-group">
            <label htmlFor="share-visibility">Visibility</label>
            <select
              id="share-visibility"
              value={visibility}
              onChange={e => setVisibility(e.target.value as 'public' | 'unlisted' | 'password')}
              className="tps-select"
            >
              <option value="public">Public (listed in gallery)</option>
              <option value="unlisted">Unlisted (link only)</option>
              <option value="password">Password protected</option>
            </select>
          </div>

          {/* Password field when needed */}
          {visibility === 'password' && (
            <div className="tps-form-group">
              <label htmlFor="share-password">Password</label>
              <input
                id="share-password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="tps-input"
                placeholder="Enter password"
                autoComplete="new-password"
              />
            </div>
          )}

          {/* Access level */}
          <div className="tps-form-group">
            <label htmlFor="share-access-level">Access Level</label>
            <select
              id="share-access-level"
              value={accessLevel}
              onChange={e => setAccessLevel(e.target.value as 'view' | 'interact' | 'duplicate')}
              className="tps-select"
            >
              <option value="view">View only</option>
              <option value="interact">Interactive (filters work)</option>
              <option value="duplicate">Allow duplicate</option>
            </select>
            <p className="tps-form-help">{accessLevelHelp}</p>
          </div>

          {/* Checkboxes */}
          <div className="tps-form-group tps-form-group--checkbox">
            <label className="tps-checkbox-label">
              <input
                type="checkbox"
                checked={showAuthor}
                onChange={e => setShowAuthor(e.target.checked)}
              />
              <span>Show author name</span>
            </label>
          </div>
          <div className="tps-form-group tps-form-group--checkbox">
            <label className="tps-checkbox-label">
              <input
                type="checkbox"
                checked={allowExport}
                onChange={e => setAllowExport(e.target.checked)}
              />
              <span>Allow PDF export</span>
            </label>
          </div>
          <div className="tps-form-group tps-form-group--checkbox">
            <label className="tps-checkbox-label">
              <input
                type="checkbox"
                checked={allowEmbed}
                onChange={e => setAllowEmbed(e.target.checked)}
              />
              <span>Allow embedding</span>
            </label>
          </div>
        </div>

        <footer className="tps-modal-footer">
          {existingShare && (
            <button type="button" className="tps-btn tps-btn-danger" onClick={handleRevoke}>
              Revoke Link
            </button>
          )}
          <div className="tps-modal-footer-right">
            <button type="button" className="tps-btn" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="tps-btn tps-btn-primary" onClick={handleSave}>
              {existingShare ? 'Update' : 'Create Link'}
            </button>
          </div>
        </footer>
      </div>

      {/* Styles */}
      <style>
        {`
        .tps-modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .tps-share-modal {
          background: #ffffff;
          border-radius: 12px;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
          max-width: 480px;
          width: 100%;
          max-height: 90vh;
          overflow-y: auto;
          margin: 1rem;
        }

        .tps-share-modal .tps-modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 1.25rem 1.5rem;
          border-bottom: 1px solid #e2e8f0;
        }

        .tps-share-modal .tps-modal-header h2 {
          font-size: 1.125rem;
          font-weight: 600;
          color: #1e293b;
          margin: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .tps-share-modal .tps-modal-close {
          background: none;
          border: none;
          font-size: 1.5rem;
          color: #64748b;
          cursor: pointer;
          padding: 0.25rem;
          line-height: 1;
          border-radius: 4px;
          transition: background-color 0.15s, color 0.15s;
        }

        .tps-share-modal .tps-modal-close:hover {
          background: #f1f5f9;
          color: #1e293b;
        }

        .tps-share-modal .tps-modal-body {
          padding: 1.5rem;
        }

        .tps-share-url {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 1rem;
          margin-bottom: 1.5rem;
        }

        .tps-share-url-label {
          display: block;
          font-size: 0.875rem;
          font-weight: 500;
          color: #334155;
          margin-bottom: 0.5rem;
        }

        .tps-share-url-input {
          display: flex;
          gap: 0.5rem;
        }

        .tps-share-url-input input {
          flex: 1;
          padding: 0.5rem 0.75rem;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          font-size: 0.875rem;
          color: #334155;
          background: #ffffff;
        }

        .tps-share-url-input input:focus {
          outline: none;
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }

        .tps-share-stats {
          margin: 0.5rem 0 0;
          font-size: 0.75rem;
          color: #64748b;
        }

        .tps-share-modal .tps-form-group {
          margin-bottom: 1rem;
        }

        .tps-share-modal .tps-form-group:last-child {
          margin-bottom: 0;
        }

        .tps-share-modal .tps-form-group label {
          display: block;
          font-size: 0.875rem;
          font-weight: 500;
          color: #334155;
          margin-bottom: 0.375rem;
        }

        .tps-share-modal .tps-form-group--checkbox {
          margin-bottom: 0.75rem;
        }

        .tps-share-modal .tps-select,
        .tps-share-modal .tps-input {
          width: 100%;
          padding: 0.5rem 0.75rem;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          font-size: 0.875rem;
          color: #334155;
          background: #ffffff;
          transition: border-color 0.15s, box-shadow 0.15s;
        }

        .tps-share-modal .tps-select:focus,
        .tps-share-modal .tps-input:focus {
          outline: none;
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }

        .tps-form-help {
          margin: 0.375rem 0 0;
          font-size: 0.75rem;
          color: #64748b;
        }

        .tps-checkbox-label {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          cursor: pointer;
          font-weight: 400;
        }

        .tps-checkbox-label input[type="checkbox"] {
          width: 1rem;
          height: 1rem;
          accent-color: #3b82f6;
          cursor: pointer;
        }

        .tps-share-modal .tps-modal-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 1rem 1.5rem;
          border-top: 1px solid #e2e8f0;
          background: #f8fafc;
          border-radius: 0 0 12px 12px;
        }

        .tps-modal-footer-right {
          display: flex;
          gap: 0.5rem;
          margin-left: auto;
        }

        .tps-share-modal .tps-btn {
          padding: 0.5rem 1rem;
          font-size: 0.875rem;
          font-weight: 500;
          border-radius: 6px;
          border: 1px solid #e2e8f0;
          background: #ffffff;
          color: #334155;
          cursor: pointer;
          transition: background-color 0.15s, border-color 0.15s, color 0.15s;
        }

        .tps-share-modal .tps-btn:hover {
          background: #f1f5f9;
          border-color: #cbd5e1;
        }

        .tps-share-modal .tps-btn-secondary {
          background: #f1f5f9;
        }

        .tps-share-modal .tps-btn-secondary:hover {
          background: #e2e8f0;
        }

        .tps-share-modal .tps-btn-primary {
          background: #3b82f6;
          border-color: #3b82f6;
          color: #ffffff;
        }

        .tps-share-modal .tps-btn-primary:hover {
          background: #2563eb;
          border-color: #2563eb;
        }

        .tps-share-modal .tps-btn-danger {
          background: #ffffff;
          border-color: #fca5a5;
          color: #dc2626;
        }

        .tps-share-modal .tps-btn-danger:hover {
          background: #fef2f2;
          border-color: #f87171;
        }
      `}
      </style>
    </div>
  )

  return createPortal(modalContent, document.body)
}
