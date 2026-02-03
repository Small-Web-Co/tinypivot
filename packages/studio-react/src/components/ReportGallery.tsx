/**
 * ReportGallery Component
 * Displays public reports in a card grid with search and sort controls
 */
import type { PublicShareListItem, StorageAdapter } from '@smallwebco/tinypivot-studio'
import { useCallback, useEffect, useState } from 'react'

/**
 * Props for ReportGallery component
 */
export interface ReportGalleryProps {
  /** Storage adapter for fetching public shares */
  storage: StorageAdapter
  /** Compact mode for sidebar display */
  compact?: boolean
  /** Custom class name */
  className?: string
}

// Format date for display
function formatDate(date: Date): string {
  const d = new Date(date)
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

/**
 * ReportGallery - Displays public reports in a card grid
 *
 * Features:
 * - Search input for filtering reports
 * - Sort dropdown (recent, popular, title)
 * - Card grid showing title, description, author, view count
 * - Links to /view/{token}
 *
 * @example
 * ```tsx
 * import { ReportGallery } from '@smallwebco/tinypivot-studio-react'
 *
 * function ExplorePage({ storage }) {
 *   return (
 *     <ReportGallery storage={storage} />
 *   )
 * }
 * ```
 */
export function ReportGallery({
  storage,
  compact = false,
  className,
}: ReportGalleryProps) {
  const [reports, setReports] = useState<PublicShareListItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [sortBy, setSortBy] = useState<'recent' | 'popular' | 'title'>('recent')
  const [search, setSearch] = useState('')

  const loadReports = useCallback(async () => {
    setIsLoading(true)
    try {
      const result = await storage.listPublicShares({
        sortBy,
        search: search || undefined,
        limit: compact ? 10 : 50,
      })
      setReports(result.items)
    }
    catch (err) {
      console.error('Failed to load reports:', err)
      setReports([])
    }
    finally {
      setIsLoading(false)
    }
  }, [storage, sortBy, search, compact])

  useEffect(() => {
    loadReports()
  }, [loadReports])

  const handleSearch = () => {
    loadReports()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSearch()
    }
  }

  const handleSortChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSortBy(e.target.value as 'recent' | 'popular' | 'title')
  }

  return (
    <div className={`tps-gallery ${compact ? 'tps-gallery-compact' : ''} ${className || ''}`}>
      <header className="tps-gallery-header">
        {!compact && (
          <h1 className="tps-gallery-title">Explore Public Reports</h1>
        )}
        <div className="tps-gallery-controls">
          <input
            type="search"
            placeholder="Search reports..."
            className="tps-gallery-search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <select
            className="tps-gallery-sort"
            value={sortBy}
            onChange={handleSortChange}
          >
            <option value="recent">Most Recent</option>
            <option value="popular">Most Popular</option>
            <option value="title">Title A-Z</option>
          </select>
        </div>
      </header>

      {isLoading
        ? (
            <div className="tps-gallery-loading">
              <div className="tps-gallery-spinner" />
              <span>Loading reports...</span>
            </div>
          )
        : reports.length === 0
          ? (
              <div className="tps-gallery-empty">
                <svg className="tps-gallery-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
                <p>No public reports found</p>
                {search && (
                  <p className="tps-gallery-empty-hint">
                    Try adjusting your search terms
                  </p>
                )}
              </div>
            )
          : (
              <div className="tps-gallery-grid">
                {reports.map(report => (
                  <a
                    key={report.token}
                    href={`/view/${report.token}`}
                    className="tps-gallery-card"
                  >
                    <div className="tps-gallery-card-content">
                      <h3 className="tps-gallery-card-title">{report.pageTitle}</h3>
                      {report.pageDescription && (
                        <p className="tps-gallery-card-description">
                          {report.pageDescription}
                        </p>
                      )}
                      {report.tags && report.tags.length > 0 && (
                        <div className="tps-gallery-card-tags">
                          {report.tags.slice(0, 3).map(tag => (
                            <span key={tag} className="tps-gallery-card-tag">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="tps-gallery-card-footer">
                      {report.authorName && (
                        <span className="tps-gallery-card-author">
                          By
                          {' '}
                          {report.authorName}
                        </span>
                      )}
                      <span className="tps-gallery-card-meta">
                        <span className="tps-gallery-card-views">
                          {report.viewCount}
                          {' '}
                          views
                        </span>
                        <span className="tps-gallery-card-date">
                          {formatDate(report.publishedAt)}
                        </span>
                      </span>
                    </div>
                  </a>
                ))}
              </div>
            )}

      {/* Styles */}
      <style>
        {`
        .tps-gallery {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          padding: 1.5rem;
        }

        .tps-gallery-compact {
          padding: 1rem;
        }

        /* Header */
        .tps-gallery-header {
          margin-bottom: 1.5rem;
        }

        .tps-gallery-title {
          font-size: 1.5rem;
          font-weight: 600;
          color: #1e293b;
          margin: 0 0 1rem;
        }

        .tps-gallery-controls {
          display: flex;
          gap: 0.75rem;
          flex-wrap: wrap;
        }

        .tps-gallery-compact .tps-gallery-controls {
          flex-direction: column;
        }

        .tps-gallery-search {
          flex: 1;
          min-width: 200px;
          padding: 0.5rem 0.75rem;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          font-size: 0.875rem;
          color: #334155;
          background: #ffffff;
          transition: border-color 0.15s, box-shadow 0.15s;
        }

        .tps-gallery-search:focus {
          outline: none;
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }

        .tps-gallery-search::placeholder {
          color: #94a3b8;
        }

        .tps-gallery-sort {
          padding: 0.5rem 2rem 0.5rem 0.75rem;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          font-size: 0.875rem;
          color: #334155;
          background: #ffffff url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e") right 0.5rem center / 1.25rem no-repeat;
          appearance: none;
          cursor: pointer;
          transition: border-color 0.15s;
        }

        .tps-gallery-sort:focus {
          outline: none;
          border-color: #3b82f6;
        }

        .tps-gallery-compact .tps-gallery-search,
        .tps-gallery-compact .tps-gallery-sort {
          width: 100%;
        }

        /* Loading state */
        .tps-gallery-loading {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 3rem 1rem;
          color: #64748b;
          gap: 0.75rem;
        }

        .tps-gallery-spinner {
          width: 2rem;
          height: 2rem;
          border: 2px solid #e2e8f0;
          border-top-color: #3b82f6;
          border-radius: 50%;
          animation: tps-gallery-spin 0.8s linear infinite;
        }

        @keyframes tps-gallery-spin {
          to {
            transform: rotate(360deg);
          }
        }

        /* Empty state */
        .tps-gallery-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 3rem 1rem;
          color: #64748b;
          text-align: center;
        }

        .tps-gallery-empty-icon {
          width: 3rem;
          height: 3rem;
          margin-bottom: 1rem;
          opacity: 0.5;
        }

        .tps-gallery-empty p {
          margin: 0;
        }

        .tps-gallery-empty-hint {
          font-size: 0.875rem;
          margin-top: 0.5rem;
          opacity: 0.8;
        }

        /* Grid */
        .tps-gallery-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 1rem;
        }

        .tps-gallery-compact .tps-gallery-grid {
          grid-template-columns: 1fr;
        }

        /* Card */
        .tps-gallery-card {
          display: flex;
          flex-direction: column;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          text-decoration: none;
          color: inherit;
          transition: border-color 0.15s, box-shadow 0.15s, transform 0.15s;
          overflow: hidden;
        }

        .tps-gallery-card:hover {
          border-color: #cbd5e1;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
          transform: translateY(-2px);
        }

        .tps-gallery-card:focus {
          outline: none;
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }

        .tps-gallery-card-content {
          flex: 1;
          padding: 1rem;
        }

        .tps-gallery-card-title {
          font-size: 1rem;
          font-weight: 600;
          color: #1e293b;
          margin: 0 0 0.5rem;
          line-height: 1.4;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .tps-gallery-card-description {
          font-size: 0.875rem;
          color: #64748b;
          margin: 0 0 0.75rem;
          line-height: 1.5;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .tps-gallery-card-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 0.375rem;
        }

        .tps-gallery-card-tag {
          font-size: 0.75rem;
          padding: 0.125rem 0.5rem;
          background: #f1f5f9;
          color: #475569;
          border-radius: 4px;
        }

        .tps-gallery-card-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.75rem 1rem;
          background: #f8fafc;
          border-top: 1px solid #e2e8f0;
          font-size: 0.75rem;
          color: #64748b;
        }

        .tps-gallery-card-author {
          font-weight: 500;
        }

        .tps-gallery-card-meta {
          display: flex;
          gap: 0.75rem;
        }

        .tps-gallery-card-views,
        .tps-gallery-card-date {
          white-space: nowrap;
        }
      `}
      </style>
    </div>
  )
}
