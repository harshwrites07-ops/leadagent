import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--f-mono)', textAlign: 'center', padding: '2rem' }}>
          <div>
            <h2 style={{ color: 'var(--bad)', marginBottom: '1rem', fontSize: '1.5rem' }}>Something went wrong</h2>
            <p style={{ color: 'var(--text-3)', marginBottom: '1.5rem', maxWidth: 400 }}>
              {this.state.error?.message || 'An unexpected error occurred.'}
            </p>
            <button
              onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }}
              style={{ background: 'var(--lime)', color: 'var(--bg)', border: 'none', padding: '0.6rem 1.5rem', borderRadius: '8px', cursor: 'pointer', fontSize: '1rem', fontWeight: 700 }}
            >
              Reload App
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
