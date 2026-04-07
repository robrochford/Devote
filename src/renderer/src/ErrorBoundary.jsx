import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '40px', background: 'rgba(0,0,0,0.8)', color: 'red', zIndex: 9999, position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <h1 style={{fontSize:'2rem', marginBottom:'20px'}}>Fatal React Crash</h1>
          <pre style={{ color: '#ffaaaa', maxWidth: '800px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{this.state.error && this.state.error.toString()}</pre>
          {this.state.error && this.state.error.stack && <pre style={{ marginTop: '20px', color: '#aaaaaa', fontSize: '12px', maxWidth: '800px', whiteSpace: 'pre-wrap', overflow: 'auto', maxHeight:'400px', textAlign: 'left' }}>{this.state.error.stack}</pre>}
        </div>
      );
    }
    return this.props.children; 
  }
}

export default ErrorBoundary;
