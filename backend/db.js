const { Pool } = require('pg');
require('dotenv').config();

const { Client } = require('pg');

// Primero probamos con una conexión directa para verificar los parámetros
const testConnection = async () => {
  const client = new Client({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    await client.connect();
    console.log('✅ Conexión de prueba exitosa a PostgreSQL');
    await client.end();
    return true;
  } catch (error) {
    console.error('❌ Error en la conexión de prueba:', error);
    return false;
  }
};

// Luego configuramos el pool con los parámetros correctos
const pool = new (require('pg').Pool)({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  ssl: {
    rejectUnauthorized: false
  },
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000
});

// Manejo de eventos de conexión
try {
  pool.on('connect', () => {
    console.log('✅ Conectado a PostgreSQL');
  });

  pool.on('error', (err) => {
    console.error('❌ Error inesperado en el pool de conexiones:', err);
    process.exit(-1);
  });

  // Probar la conexión
  pool.query('SELECT NOW()', (err) => {
    if (err) {
      console.error('❌ Error al conectar a PostgreSQL:', err);
    } else {
      console.log('🔍 Prueba de conexión a PostgreSQL exitosa');
    }
  });
} catch (error) {
  console.error('❌ Error al configurar la conexión a PostgreSQL:', error);
  process.exit(1);
}

module.exports = pool;
