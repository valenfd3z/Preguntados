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
        // Agregar recursos al caché uno por uno para manejar errores individualmente
        return Promise.all(
          urlsToCache.map(url => {
            return fetch(new Request(url, { cache: 'no-cache' }))
              .then(response => {
                if (response.ok) {
                  return cache.put(url, response);
                }
                console.warn('No se pudo cargar el recurso:', url);
              })
              .catch(error => {
                console.warn('Error al cargar el recurso:', url, error);
              });
          })
        );
      })
      .catch(error => {
        console.error('Error al abrir la caché:', error);
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
});

// Estrategia de caché: Cache First, luego red
self.addEventListener('fetch', event => {
  // Ignorar solicitudes que no sean HTTP/HTTPS ( como chrome-extension:)
  if (!event.request.url.startsWith('http') || 
      event.request.url.startsWith('chrome-extension://') ||
      event.request.url.includes('extension') ||
      event.request.url.includes('sockjs') ||
      event.request.url.includes('hot-update')) {
    return;
  }
  
  // No cachear solicitudes a la API de Socket.io
  if (event.request.url.includes('socket.io')) {
    return fetch(event.request);
  }
  
  // Solo manejar solicitudes GET
  if (event.request.method !== 'GET') {
    return;
  }
  
  // Ignorar solicitudes de extensiones y otros orígenes no válidos
  try {
    const url = new URL(event.request.url);
    if (url.protocol === 'chrome-extension:' || 
        url.protocol === 'chrome:' ||
        url.protocol === 'safari-extension:' ||
        url.protocol === 'moz-extension:') {
      return;
    }
  } catch (e) {
    console.warn('URL no válida para el service worker:', event.request.url);
    return;
  }
  
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Si la respuesta está en caché, devuélvela
        if (response) {
          return response;
        }
        
        // Si no está en caché, haz la petición a la red
        return fetch(event.request)
          .then(response => {
            // Verifica que la respuesta sea válida
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }
            
            // Solo almacenar en caché si la solicitud es del mismo origen
            // y no es una solicitud de socket.io
            const responseToCache = response.clone();
            const cacheUrl = new URL(event.request.url);
            
            if (cacheUrl.origin === self.location.origin && 
                !event.request.url.includes('sockjs') &&
                !event.request.url.includes('hot-update')) {
              caches.open(CACHE_NAME)
                .then(cache => {
                  cache.put(event.request, responseToCache)
                    .catch(err => {
                      console.warn('No se pudo almacenar en caché:', event.request.url, err);
                    });
                });
            }
            
            return response;
          });
      })
      .catch(error => {
        console.error('Error en el service worker:', error);
        // Puedes devolver una respuesta personalizada en caso de error
        return new Response('Error de conexión', {
          status: 408,
          statusText: 'Error de conexión',
          headers: { 'Content-Type': 'text/plain' }
        });
      })
  );
  
});

// Manejo de mensajes del cliente
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
