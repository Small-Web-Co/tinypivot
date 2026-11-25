/**
 * TinyPivot React - D3 chart host.
 * Loads the D3 renderer on first use and keeps it in sync with the chart spec.
 */
import type { D3ChartHandle, D3ChartSpec } from '@smallwebco/tinypivot-core/d3'
import React, { useEffect, useRef, useState } from 'react'

interface D3ChartProps {
  spec: D3ChartSpec
}

export function D3Chart({ spec }: D3ChartProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const handleRef = useRef<D3ChartHandle | null>(null)
  const specRef = useRef(spec)
  const [loadError, setLoadError] = useState<string | null>(null)
  specRef.current = spec

  useEffect(() => {
    let cancelled = false
    import('@smallwebco/tinypivot-core/d3')
      .then(({ mountD3Chart }) => {
        if (!cancelled && hostRef.current)
          handleRef.current = mountD3Chart(hostRef.current, specRef.current)
      })
      .catch((error: unknown) => {
        if (!cancelled)
          setLoadError(error instanceof Error ? error.message : String(error))
      })
    return () => {
      cancelled = true
      handleRef.current?.destroy()
      handleRef.current = null
    }
  }, [])

  useEffect(() => {
    handleRef.current?.update(spec)
  }, [spec])

  if (loadError) {
    return (
      <div className="vpg-chart-loading">
        <span>
          Could not load the chart renderer:
          {' '}
          {loadError}
        </span>
      </div>
    )
  }
  return <div ref={hostRef} className="vpg-d3-host" data-chart-type={spec.config.type} />
}
