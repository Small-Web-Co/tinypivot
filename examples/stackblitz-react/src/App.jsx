import { DataGrid } from '@smallwebco/tinypivot-react'
import '@smallwebco/tinypivot-react/style.css'
import { salesData } from './data.js'

export default function App() {
  return (
    <div style={{ padding: '24px', height: '100vh', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#1e293b', marginBottom: '4px' }}>
          TinyPivot — React Starter
        </h1>
        <p style={{ fontSize: '0.875rem', color: '#64748b' }}>
          50 rows of sample sales data with pivot table enabled.
          {' '}
          <a href="https://tiny-pivot.com" target="_blank" rel="noopener noreferrer" style={{ color: '#6366f1' }}>
            Learn more at tiny-pivot.com
          </a>
        </p>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <DataGrid
          data={salesData}
          enableExport={true}
          enableSearch={true}
          enablePagination={true}
          pageSize={25}
          enableColumnResize={true}
          enableClipboard={true}
          showPivot={true}
          theme="light"
          exportFilename="sales-data.csv"
        />
      </div>
    </div>
  )
}
