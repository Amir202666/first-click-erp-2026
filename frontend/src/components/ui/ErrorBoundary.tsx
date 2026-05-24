import { Component, type ReactNode } from 'react'
import { ErrorBoundaryFallback } from './ErrorBoundaryFallback'

interface Props {
  children: ReactNode
  backHref?: string
  backLabel?: string
  fallbackMessage?: string
  isRtl?: boolean
}

interface State {
  hasError: boolean
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('InvoiceViewPage error:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <ErrorBoundaryFallback
          backHref={this.props.backHref}
          backLabel={this.props.backLabel}
          message={this.props.fallbackMessage}
          isRtl={this.props.isRtl}
        />
      )
    }
    return this.props.children
  }
}
