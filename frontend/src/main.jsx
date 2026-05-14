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
            background: '#1a1a2e',
            color: '#e2e8f0',
            border: '1px solid #2d2d4a',
            borderRadius: '10px',
          },
          success: { iconTheme: { primary: '#4ade80', secondary: '#0a0a0f' } },
          error: { iconTheme: { primary: '#f87171', secondary: '#0a0a0f' } },
        }}
      />
    </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
