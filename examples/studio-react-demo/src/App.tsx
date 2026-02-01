import { createIndexedDBStorage } from '@smallwebco/tinypivot-storage-indexeddb'
import { TinyPivotStudio } from '@smallwebco/tinypivot-studio-react'
import { useState } from 'react'

const storage = createIndexedDBStorage()

// AI Analyst configuration with demo bypass
const aiAnalystConfig = {
  endpoint: '/api/tinypivot',
}

function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light')

  return (
    <div style={{ height: '100vh', position: 'relative' }}>
      <TinyPivotStudio
        userId="demo-user"
        storage={storage}
        theme={theme}
        aiAnalyst={aiAnalystConfig}
        onPageSave={page => console.log('Page saved:', page)}
        onWidgetSave={widget => console.log('Widget saved:', widget)}
      />
      {/* Theme toggle button */}
      <button
        onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')}
        style={{
          position: 'fixed',
          bottom: '16px',
          right: '16px',
          padding: '8px 16px',
          borderRadius: '6px',
          border: '1px solid #cbd5e1',
          background: theme === 'light' ? '#ffffff' : '#1e293b',
          color: theme === 'light' ? '#334155' : '#e2e8f0',
          cursor: 'pointer',
          fontSize: '14px',
          zIndex: 1000,
        }}
      >
        {theme === 'light' ? '🌙 Dark' : '☀️ Light'}
      </button>
    </div>
  )
}

export default App
