const CACHE_NAME = 'preguntados-cache-v2';
const urlsToCache = [
  './',
  './index.html',
  './app.js',
  './dark-theme.css',
  'https://cdn.socket.io/4.8.1/socket.io.min.js',
  './icons/icon-192x192.png',
  './splash.png'
];

// Instalación del Service Worker
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Cache abierta');
        return cache.addAll(urlsToCache);
      })
      .catch(error => {
        console.error('Error al cachear recursos:', error);
      })
  );
  
  // Forzar la activación del nuevo service worker
  self.skipWaiting();
});

// Activación del Service Worker
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  
  // Tomar el control de los clients inmediatamente
  event.waitUntil(clients.claim());
});

// Estrategia de caché: Cache First, luego red
self.addEventListener('fetch', event => {
  // No cachear solicitudes a la API de Socket.io
  if (event.request.url.includes('socket.io')) {
    return fetch(event.request);
  }
  
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Devuelve la respuesta en caché si existe
        if (response) {
          return response;
        }
        
        // Si no está en caché, haz la petición a la red
        return fetch(event.request).then(response => {
          // Verifica que la respuesta sea válida
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }
          
          // Clona la respuesta para almacenarla en caché
          const responseToCache = response.clone();
          
          caches.open(CACHE_NAME)
            .then(cache => {
              cache.put(event.request, responseToCache);
            });
            
          return response;
        });
      })
      .catch(() => {
        // En caso de error, puedes devolver una página de error personalizada
        return caches.match('/offline.html');
      })
  );
});

// Manejo de mensajes del cliente
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
