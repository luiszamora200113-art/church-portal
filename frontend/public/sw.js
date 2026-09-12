// Service worker mínimo: solo deja pasar las peticiones normalmente.
// Su única función aquí es cumplir el requisito técnico para que el
// navegador considere el sitio "instalable" como app.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', () => self.clients.claim());
self.addEventListener('fetch', () => {}); // sin caché especial por ahora
