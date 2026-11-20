import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

// Daftarkan Service Worker PWA agar aplikasi bisa dibuka & dipakai saat offline
registerSW({
  immediate: true,
  onOfflineReady() {
    // Aplikasi siap berjalan secara offline
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
