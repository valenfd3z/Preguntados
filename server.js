const express = require('express');
const path = require('path');
const os = require('os');
const app = express();
const port = 3000;

// Obtener la dirección IP local
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Omitir direcciones internas y no IPv4
      if (iface.internal || iface.family !== 'IPv4') continue;
      return iface.address;
    }
  }
  return 'localhost';
}

// Configuración de CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// Servir archivos estáticos desde la carpeta frontend
app.use(express.static(path.join(__dirname, 'frontend')));

// Ruta principal
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

// Manejador para rutas de la aplicación (SPA)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

// Iniciar el servidor
const server = app.listen(port, '0.0.0.0', () => {
  const host = getLocalIP();
  console.log(`Servidor funcionando en http://localhost:${port}`);
  console.log(`Accede desde tu móvil: http://${host}:${port}`);
  console.log('Asegúrate de que tu móvil esté en la misma red Wi-Fi');
});

// Manejo de errores
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`El puerto ${port} está en uso. Cierra otras instancias del servidor.`);
  } else {
    console.error('Error al iniciar el servidor:', error);
  }
  process.exit(1);
});
