import { Component, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  message: string
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message }
  }

  componentDidCatch(error: Error): void {
    // Errors in renderers are logged to the main-process log via IPC would be ideal.
    // Here we simply surface a friendly message.
    console.error('Renderer error:', error)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 p-8 text-center">
          <AlertTriangle className="h-10 w-10 text-amber-500" />
          <h2 className="text-lg font-semibold text-foreground">Something went wrong</h2>
          <p className="max-w-md text-sm text-muted">
            The application encountered an error. Your data is safe. Please restart the
            application.
          </p>
          <button
            className="ring-focus mt-2 rounded-lg bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700"
            onClick={() => {
              this.setState({ hasError: false })
            }}
          >
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}