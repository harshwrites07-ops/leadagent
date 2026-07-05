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
            fontSize: '13px',
            fontFamily: 'var(--f-sans)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            padding: '10px 14px',
          },
          success: {
            iconTheme: {
              primary: 'var(--lime)',
              secondary: 'var(--on-accent)',
            },
            style: {
              border: '1px solid var(--lime-border)',
            },
          },
          error: {
            iconTheme: {
              primary: 'var(--bad)',
              secondary: 'var(--on-accent)',
            },
            style: {
              border: '1px solid var(--coral-border)',
            },
          },
          duration: 3000,
        }}
      />
    </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
