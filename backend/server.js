const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const http = require('http');
const { Server } = require('socket.io');
const { Pool, Client } = require('pg');

const app = express();
// Usar el puerto de las variables de entorno o 4000 por defecto
const PORT = process.env.PORT || 4000;
const HOST = '0.0.0.0'; // Escuchar en todas las interfaces de red

// Función para probar la conexión a la base de datos
const testDatabaseConnection = async () => {
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
    console.error('❌ Error al conectar a PostgreSQL:', error);
    return false;
  }
};

// Configuración de CORS para permitir conexiones desde cualquier origen
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));
app.use(express.json());
// Servir archivos estáticos desde la carpeta frontend
app.use(express.static(path.join(__dirname, '../frontend')));

// Verificar la conexión a la base de datos antes de iniciar el servidor
const startServer = async () => {
  console.log('🔍 Probando conexión a la base de datos...');
  const dbConnected = await testDatabaseConnection();
  
  if (!dbConnected) {
    process.exit(1);
  }

  const server = http.createServer(app);
  // Configuración mejorada para Socket.IO
  const io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      credentials: true
    },
    // Mejoras para conexiones móviles
    pingTimeout: 60000,        // Aumentar el tiempo de espera de ping
    pingInterval: 25000,       // Intervalo de ping más corto
    transports: ['websocket', 'polling'], // Forzar ambos métodos de transporte
    allowUpgrades: true,       // Permitir actualización de protocolo
    cookie: false,            // Deshabilitar cookies si no son necesarias
    serveClient: true,        // Servir el cliente de socket.io
    path: '/socket.io/',      // Ruta del endpoint de socket.io
    perMessageDeflate: {
      threshold: 1024, // Umbral para compresión
      zlibDeflateOptions: {
        level: 6
      }
    }
  });

  const pool = new Pool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
    ssl: {
      rejectUnauthorized: false
    }
  });

  // Probar la conexión al pool
  try {
    const client = await pool.connect();
    console.log('✅ Conectado a PostgreSQL');
    client.release();
  } catch (err) {
    console.error('❌ Error conectando a PostgreSQL', err);
    process.exit(1);
  }

  const waitingPlayers = [];
  const games = {};

// --------------------- Funciones ---------------------

// Normaliza la categoría para que coincida con la base de datos
function normalizeCategory(category) {
  if (!category) return '';
  if (category.toLowerCase() === 'geografia') return 'Geografía';
  return category;
}

// Obtener preguntas aleatorias evitando repeticiones
async function getRandomQuestions(limit = 5, category = null, excludeIds = []) {
  try {
    category = normalizeCategory(category);
    let params = [category];
    let query = 'SELECT id, category, text, options, correct_answer FROM questions WHERE category = $1';

    if (excludeIds.length > 0) {
      const placeholders = excludeIds.map((_, i) => `$${i + 2}`).join(',');
      query += ` AND id NOT IN (${placeholders})`;
      params.push(...excludeIds);
    }

    query += ` ORDER BY RANDOM() LIMIT $${params.length + 1}`;
    params.push(limit);

    let res = await pool.query(query, params);

    // Reinicia si no hay preguntas disponibles
    if (res.rows.length === 0 && excludeIds.length > 0) {
      res = await pool.query('SELECT id, category, text, options, correct_answer FROM questions WHERE category = $1 ORDER BY RANDOM() LIMIT $2', [category, limit]);
    }

    return res.rows.map(q => ({
      id: q.id,
      category: q.category,
      text: q.text,
      options: q.options,
      correct: q.correct_answer
    }));
  } catch (err) {
    console.error('Error al obtener preguntas:', err);
    return [];
  }
}

// --------------------- Socket.io ---------------------
io.on('connection', (socket) => {
  console.log('Jugador conectado:', socket.id);

  // 1vs1
  socket.on('join_1vs1', async (data) => {
    waitingPlayers.push({ socket, username: data.username });
    if (waitingPlayers.length >= 2) {
      const player1 = waitingPlayers.shift();
      const player2 = waitingPlayers.shift();
      const gameId = `game_${Date.now()}`;

      games[gameId] = {
        type: '1vs1',
        players: [
          { socket: player1.socket, username: player1.username },
          { socket: player2.socket, username: player2.username }
        ],
        currentPlayer: 0,
        score: { [player1.socket.id]: 0, [player2.socket.id]: 0 },
        questions: [],
        questionsAnswered: 0,
        maxQuestions: 10,
        gamePhase: 'spinning',
        currentQuestion: null
      };

      player1.socket.emit('game_start', { gameId, yourTurn: true, opponent: player2.username });
      player2.socket.emit('game_start', { gameId, yourTurn: false, opponent: player1.username });
    }
  });

  // SOLO
  socket.on('join_solo', async (data) => {
    const gameId = `solo_${socket.id}_${Date.now()}`;
    games[gameId] = {
      type: 'solo',
      players: [{ socket, username: data.username }],
      currentPlayer: 0,
      score: { [socket.id]: 0 },
      questions: [],
      questionsAnswered: 0,
      maxQuestions: 5,
      gamePhase: 'spinning',
      currentQuestion: null
    };
    socket.emit('game_start', { gameId, yourTurn: true });
  });

  // Solicitar pregunta por categoría
  socket.on('request_question_by_category', async (data) => {
    const { gameId, category } = data;
    const game = games[gameId];
    if (!game) {
      socket.emit('error', { message: 'Juego no encontrado' });
      return;
    }

    if (game.type === '1vs1' && socket.id !== game.players[game.currentPlayer].socket.id) {
      socket.emit('error', { message: 'No es tu turno' });
      return;
    }

    const usedIds = game.questions.map(q => q.id);
    const questions = await getRandomQuestions(1, category, usedIds);

    if (questions.length === 0) {
      socket.emit('error', { message: `No hay preguntas disponibles para la categoría ${category}` });
      return;
    }

    const question = questions[0];
    game.currentQuestion = question;
    game.gamePhase = 'answering';
    game.questions.push(question);

    if (game.type === 'solo') {
      socket.emit('question_by_category', { question, questionsAnswered: game.questionsAnswered });
    } else {
      game.players.forEach((player, index) => {
        player.socket.emit('question_by_category', {
          question,
          yourTurn: index === game.currentPlayer,
          questionsAnswered: game.questionsAnswered
        });
      });
    }
  });

  // Responder pregunta
  socket.on('answer', (data) => {
    const { gameId, answer } = data;
    const game = games[gameId];
    if (!game) {
      socket.emit('error', { message: 'Juego no encontrado' });
      return;
    }

    if (game.type === '1vs1' && socket.id !== game.players[game.currentPlayer].socket.id) {
      socket.emit('error', { message: 'No es tu turno' });
      return;
    }

    const correct = answer === game.currentQuestion?.correct;
    if (correct) game.score[socket.id] += 1;

    game.questionsAnswered += 1;
    game.currentQuestion = null;

    const gameOver = game.questionsAnswered >= game.maxQuestions;

    if (gameOver) {
      game.gamePhase = 'finished';
      if (game.type === 'solo') {
        socket.emit('update', { yourTurn: false, question: null, score: game.score, questionsAnswered: game.questionsAnswered, totalQuestions: game.maxQuestions, gameOver: true });
      } else {
        game.players.forEach(p => p.socket.emit('update', { yourTurn: false, question: null, score: game.score, questionsAnswered: game.questionsAnswered, totalQuestions: game.maxQuestions, gameOver: true }));
      }
      delete games[gameId];
    } else {
      if (game.type === 'solo') {
        game.gamePhase = 'spinning';
        socket.emit('update', { yourTurn: true, question: null, score: game.score, questionsAnswered: game.questionsAnswered, totalQuestions: game.maxQuestions, gameOver: false, nextRound: true });
        setTimeout(() => { socket.emit('next_spin', { canSpin: true, yourTurn: true }); }, 1000);
      } else {
        game.currentPlayer = (game.currentPlayer + 1) % game.players.length;
        game.gamePhase = 'spinning';
        game.players.forEach((player, index) => {
          const isCurrentPlayer = index === game.currentPlayer;
          player.socket.emit('update', { yourTurn: false, question: null, score: game.score, questionsAnswered: game.questionsAnswered, totalQuestions: game.maxQuestions, gameOver: false, nextRound: true });
          setTimeout(() => { player.socket.emit('next_spin', { canSpin: isCurrentPlayer, yourTurn: isCurrentPlayer }); }, 1000);
        });
      }
    }
  });

  // Desconexión
  socket.on('disconnect', () => {
    const waitingIndex = waitingPlayers.findIndex(p => p.socket.id === socket.id);
    if (waitingIndex !== -1) waitingPlayers.splice(waitingIndex, 1);

    Object.keys(games).forEach(gameId => {
      const game = games[gameId];
      const playerIndex = game.players.findIndex(p => p.socket.id === socket.id);
      if (playerIndex !== -1) {
        if (game.type === '1vs1') {
          game.players.forEach(p => {
            if (p.socket.id !== socket.id) p.socket.emit('opponent_disconnected', { message: 'Tu oponente se ha desconectado. Has ganado por abandono.' });
          });
        }
        delete games[gameId];
      }
    });
  });
});

  // --------------------- Endpoints ---------------------
  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
  });

  // Ruta para verificar el estado del servidor
  app.get('/stats', (req, res) => {
    res.json({
      timestamp: new Date().toISOString(),
      server: 'Preguntados Backend',
      playersWaiting: waitingPlayers.length,
      activeGames: Object.keys(games).length
    });
  });

  // Iniciar el servidor
  server.listen(PORT, HOST, () => {
    console.log(`🚀 Servidor corriendo en http://${HOST}:${PORT}`);
    console.log('⚡ Socket.io listo para conexiones');
  });
}

// Iniciar la aplicación
startServer().catch(err => {
  console.error('❌ Error al iniciar el servidor:', err);
  process.exit(1);
});
