import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import App from './App';
import ErrorBoundary from './components/ui/ErrorBoundary';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
    <BrowserRouter>
      <App />
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: 'var(--surface)',
            color: 'var(--text)',
            border: '1px solid var(--line-2)',
            borderRadius: '10px',
            fontFamily: 'var(--f-sans)',
          },
          success: { iconTheme: { primary: 'var(--ok)', secondary: 'var(--bg)' } },
          error: { iconTheme: { primary: 'var(--bad)', secondary: 'var(--bg)' } },
        }}
      />
    </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
