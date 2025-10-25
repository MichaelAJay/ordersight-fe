import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { router } from './routes';
import './styles/tokens.css';
import { setOnUnauthorized } from './services/http';

// Redirect to /login when the session expires:
setOnUnauthorized(() => {
  if (window.location.pathname !== '/login') {
    window.location.assign('/login');
  }
});

const qc = new QueryClient();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>,
);
