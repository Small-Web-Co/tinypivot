import { createIndexedDBStorage } from '@smallwebco/tinypivot-storage-indexeddb'
import { TinyPivotStudio } from '@smallwebco/tinypivot-studio-react'

const storage = createIndexedDBStorage()

function App() {
  return (
    <div style={{ height: '100vh' }}>
      <TinyPivotStudio
        userId="demo-user"
        storage={storage}
        sampleData
        onPageSave={page => console.log('Page saved:', page)}
        onWidgetSave={widget => console.log('Widget saved:', widget)}
      />
    </div>
  )
}

export default App
