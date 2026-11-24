import React from 'react'
import { createRoot } from 'react-dom/client'
import { McpApp } from './McpApp'
import '@smallwebco/tinypivot-react/style.css'
import './styles.css'

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null, componentStack: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { error: null, componentStack: '' }
  }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(_error: Error, info: React.ErrorInfo) {
    this.setState({ componentStack: info.componentStack || '' })
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 16, fontFamily: 'ui-monospace, monospace', fontSize: 12, color: '#f87171', background: '#0b101b', minHeight: '100vh' }}>
          <strong>TinyPivot render error:</strong>
          {' '}
          {this.state.error.message}
          <pre style={{ marginTop: 8, whiteSpace: 'pre-wrap', color: '#94a3b8', fontSize: 11 }}>
            {this.state.error.stack}
            {'\n'}
            {this.state.componentStack}
          </pre>
        </div>
      )
    }
    return this.props.children
  }
}

const root = document.getElementById('root')
if (root) {
  createRoot(root).render(
    <AppErrorBoundary>
      <McpApp />
    </AppErrorBoundary>,
  )
}
