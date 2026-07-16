import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

const RAILWAY_API_URL = 'https://centro-inteligencia-educativa-estrat-gica-production.up.railway.app';
const configuredApiUrl = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const isLocalHost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
const apiBaseUrl = configuredApiUrl || (isLocalHost ? '' : RAILWAY_API_URL);

if (apiBaseUrl) {
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    let nextInput = input;
    const nextInit: RequestInit = { ...init };
    let isApiRequest = false;

    if (typeof input === 'string' && input.startsWith('/api')) {
      nextInput = `${apiBaseUrl}${input}`;
      isApiRequest = true;
    } else if (input instanceof URL && input.pathname.startsWith('/api')) {
      nextInput = new URL(`${apiBaseUrl}${input.pathname}${input.search}${input.hash}`);
      isApiRequest = true;
    }

    if (isApiRequest) {
      const headers = new Headers(nextInit.headers);
      const token = window.localStorage.getItem('radar_token');
      if (token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
      nextInit.headers = headers;
      nextInit.credentials = nextInit.credentials || 'include';
    }

    return nativeFetch(nextInput, nextInit);
  };
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
