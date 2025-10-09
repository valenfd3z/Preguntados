const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const { Pool, Client } = require('pg');
const fs = require('fs').promises; // Para verificar si el archivo existe
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 4000;
const HOST = '0.0.0.0';

// Verificar conexión a la base de datos
const testDatabaseConnection = async () => {
  console.log('🔍 Intentando conectar con la base de datos...');
  const dbConfig = {
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: parseInt(process.env.DB_PORT) || 5432,
    ssl: { rejectUnauthorized: false },
  };

  const client = new Client(dbConfig);
  try {
    await client.connect();
    console.log('✅ Conexión exitosa a la base de datos');
    await client.end();
    return true;
  } catch (error) {
    console.error('❌ Error al conectar:', error.message);
    return false;
  }
};

// Configuración de CORS
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:4000',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:4000',
  'https://preguntados.onrender.com',
  'file://',
  'null',
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin) || origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) {
        return callback(null, true);
      }
      return callback(new Error('Origen no permitido'));
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: true,
  })
);

app.use(express.json());

// Servir archivos estáticos desde la carpeta 'frontend' (un nivel arriba)
const frontendPath = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendPath));

// Verificar si index.html existe
const checkIndexHtml = async () => {
  try {
    await fs.access(path.join(frontendPath, 'index.html'));
    return true;
  } catch {
    console.error(`⚠️ No se encontró index.html en ${frontendPath}`);
    return false;
  }
};

const startServer = async () => {
  const dbConnected = await testDatabaseConnection();
  if (!dbConnected) {
    console.error('🚫 No se pudo conectar a la base de datos. Cerrando servidor.');
    process.exit(1);
  }

  const indexHtmlExists = await checkIndexHtml();
  if (!indexHtmlExists) {
    console.error('🚫 No se puede iniciar el servidor: falta index.html en la carpeta frontend.');
    process.exit(1);
  }

  const server = http.createServer(app);
  const io = new Server(server, {
    cors: {
      origin: function (origin, callback) {
        if (!origin || allowedOrigins.includes(origin) || origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) {
          return callback(null, true);
        }
        return callback(new Error('Origen no permitido'));
      },
      methods: ['GET', 'POST', 'OPTIONS'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: parseInt(process.env.DB_PORT) || 5432,
    ssl: { rejectUnauthorized: false },
  });

  const waitingPlayers = [];
  const games = {};

  const categoryMap = {
    geografia: 'geografía',
    deportes: 'deportes',
    historia: 'historia',
    entretenimiento: 'entretenimiento',
    arte: 'arte',
    ciencia: 'ciencia',
    geografía: 'geografía',
  };

  function normalizeCategory(category) {
    if (!category) return '';
    const normalized = category.toLowerCase().trim();
    return categoryMap[normalized] || normalized;
  }

  async function getRandomQuestions(limit = 5, category = null, excludeIds = []) {
    try {
      let query = 'SELECT id, category, text, options, correct_answer FROM questions';
      let params = [];

      if (category) {
        const normalizedCategory = normalizeCategory(category).toLowerCase();
        query += ' WHERE LOWER(category) = LOWER($1)';
        params = [normalizedCategory];
      }

      if (excludeIds.length > 0) {
        const offset = params.length;
        query += (category ? ' AND' : ' WHERE') + ` id NOT IN (${excludeIds.map((_, i) => `$${i + offset + 1}`).join(',')})`;
        params.push(...excludeIds);
      }

      query += ` ORDER BY RANDOM() LIMIT $${params.length + 1}`;
      params.push(limit);

      const res = await pool.query(query, params);
      return res.rows.map((q) => ({
        id: q.id,
        category: q.category,
        text: q.text,
        options: q.options,
        correct: q.correct_answer,
      }));
    } catch (err) {
      console.error('Error al obtener preguntas:', err.message);
      return [];
    }
  }

  io.on('connection', (socket) => {
    console.log('Jugador conectado:', socket.id);

    socket.on('join_1vs1', (data) => {
      waitingPlayers.push({ socket, username: data.username });
      if (waitingPlayers.length >= 2) {
        const player1 = waitingPlayers.shift();
        const player2 = waitingPlayers.shift();
        const gameId = `game_${Date.now()}`;
        games[gameId] = {
          type: '1vs1',
          players: [
            { socket: player1.socket, username: player1.username, id: player1.socket.id },
            { socket: player2.socket, username: player2.username, id: player2.socket.id },
          ],
          currentPlayer: 0,
          score: { [player1.socket.id]: 0, [player2.socket.id]: 0 },
          usedQuestionIds: [],
          questionsAnswered: 0,
          maxQuestions: 10,
          gamePhase: 'spinning',
          currentQuestion: null,
          answersReceived: 0,
        };
        player1.socket.emit('game_start', { gameId, yourTurn: true, opponent: player2.username });
        player2.socket.emit('game_start', { gameId, yourTurn: false, opponent: player1.username });
        console.log(`🎮 Juego 1vs1 iniciado: ${gameId}`);
      }
    });

    socket.on('join_solo', (data) => {
      const gameId = `solo_${socket.id}_${Date.now()}`;
      games[gameId] = {
        type: 'solo',
        players: [{ socket, username: data.username, id: socket.id }],
        currentPlayer: 0,
        score: { [socket.id]: 0 },
        usedQuestionIds: [],
        questionsAnswered: 0,
        maxQuestions: 5,
        gamePhase: 'spinning',
        currentQuestion: null,
      };
      socket.emit('game_start', { gameId, yourTurn: true });
      console.log(`🎮 Juego solo iniciado: ${gameId}`);
    });

    socket.on('request_question_by_category', async (data) => {
      const { gameId, category } = data;
      const game = games[gameId];

      if (!game) {
        console.error('❌ Juego no encontrado:', gameId);
        socket.emit('error', { message: 'Juego no encontrado' });
        return;
      }

      if (game.type === '1vs1' && socket.id !== game.players[game.currentPlayer].socket.id) {
        socket.emit('error', { message: 'No es tu turno' });
        return;
      }

      const questions = await getRandomQuestions(1, category, game.usedQuestionIds);

      if (questions.length === 0) {
        socket.emit('error', { message: `No hay más preguntas disponibles para la categoría ${category}` });
        return;
      }

      const question = questions[0];
      console.log('📝 Enviando pregunta:', { id: question.id, category: question.category, text: question.text });

      game.currentQuestion = question;
      game.gamePhase = 'answering';
      game.usedQuestionIds.push(question.id);
      game.answersReceived = 0;

      game.players.forEach((player, index) => {
        player.socket.emit('question_by_category', {
          question,
          yourTurn: index === game.currentPlayer,
          questionsAnswered: game.questionsAnswered,
          totalQuestions: game.maxQuestions,
        });
      });
    });

    socket.on('answer', (data) => {
      const { gameId, answer } = data;
      const game = games[gameId];

      if (!game) {
        console.error('❌ Juego no encontrado en answer:', gameId);
        return;
      }

      if (game.type === '1vs1' && socket.id !== game.players[game.currentPlayer].socket.id) {
        console.log('⚠️ Respuesta fuera de turno ignorada');
        return;
      }

      if (game.gamePhase !== 'answering') {
        console.log('⚠️ Respuesta en fase incorrecta ignorada');
        return;
      }

      game.answersReceived++;
      if (game.answersReceived > 1) {
        console.log('⚠️ Respuesta duplicada ignorada');
        return;
      }

      const correct =
        game.currentQuestion && answer !== null && answer !== undefined
          ? String(answer).trim().toLowerCase() === String(game.currentQuestion.correct).trim().toLowerCase()
          : false;

      console.log('✅ Respuesta procesada:', { answer, correctAnswer: game.currentQuestion?.correct, correct });

      if (correct) {
        game.score[socket.id] = (game.score[socket.id] || 0) + 1;
      }

      game.currentQuestion = null;
      game.gamePhase = 'spinning';

      let nextPlayerIndex = game.currentPlayer;

      if (game.type === '1vs1') {
        nextPlayerIndex = (game.currentPlayer + 1) % 2;
        game.currentPlayer = nextPlayerIndex;
        if (nextPlayerIndex === 0) {
          game.questionsAnswered += 1;
        }
      } else {
        game.questionsAnswered += 1;
      }

      const gameOver = game.questionsAnswered >= game.maxQuestions;

      if (gameOver) {
        console.log('🏁 Juego terminado:', gameId);
        const player1 = game.players[0];
        const player2 = game.players[1] || null;
        const player1Score = game.score[player1.id] || 0;
        const player2Score = player2 ? game.score[player2.id] || 0 : 0;

        let winnerId = null;
        let isDraw = false;

        if (game.type === '1vs1') {
          if (player1Score > player2Score) winnerId = player1.id;
          else if (player2Score > player1Score) winnerId = player2.id;
          else isDraw = true;
        } else {
          winnerId = player1.id;
        }

        const updateData = {
          yourTurn: false,
          question: null,
          score: game.score,
          questionsAnswered: game.questionsAnswered,
          totalQuestions: game.maxQuestions,
          gameOver: true,
          winner: winnerId,
          isDraw,
          player1: { id: player1.id, username: player1.username, score: player1Score },
          player2: player2 ? { id: player2.id, username: player2.username, score: player2Score } : null,
        };

        game.players.forEach((p) => p.socket.emit('update', updateData));
        delete games[gameId];
      } else {
        const updateData = {
          yourTurn: false,
          question: null,
          score: game.score,
          questionsAnswered: game.questionsAnswered,
          totalQuestions: game.maxQuestions,
          gameOver: false,
          nextRound: true,
        };

        game.players.forEach((player, index) => {
          player.socket.emit('update', { ...updateData, yourTurn: index === nextPlayerIndex });
          if (index === nextPlayerIndex) {
            player.socket.emit('next_spin', { canSpin: true });
          } else {
            player.socket.emit('next_spin', { canSpin: false });
          }
        });
      }
    });

    socket.on('disconnect', () => {
      console.log('Jugador desconectado:', socket.id);
      const waitingIndex = waitingPlayers.findIndex((p) => p.socket.id === socket.id);
      if (waitingIndex !== -1) waitingPlayers.splice(waitingIndex, 1);

      Object.keys(games).forEach((gameId) => {
        const game = games[gameId];
        const playerIndex = game.players.findIndex((p) => p.socket.id === socket.id);
        if (playerIndex !== -1) {
          if (game.type === '1vs1') {
            game.players.forEach((p) => {
              if (p.socket.id !== socket.id) {
                p.socket.emit('opponent_disconnected', { message: 'Tu oponente se ha desconectado. Has ganado por abandono.' });
              }
            });
          }
          delete games[gameId];
        }
      });
    });
  });

  // Ruta explícita para index.html
  app.get('/', async (req, res) => {
    const filePath = path.join(frontendPath, 'index.html');
    try {
      await fs.access(filePath); // Verificar si el archivo existe
      res.sendFile(filePath);
    } catch {
      res.status(404).send('Archivo index.html no encontrado. Verifica que exista en la carpeta frontend.');
    }
  });

  // Manejo de rutas SPA
  app.get(/\/.*/, async (req, res) => {
    const filePath = path.join(frontendPath, 'index.html');
    try {
      await fs.access(filePath); // Verificar si el archivo existe
      res.sendFile(filePath);
    } catch {
      res.status(404).send('Archivo index.html no encontrado. Verifica que exista en la carpeta frontend.');
    }
  });

  // Manejador de errores
  app.use((err, req, res, next) => {
    console.error('Error:', err.message);
    res.status(500).send('Error interno del servidor');
  });

  server.listen(PORT, HOST, () => {
    console.log(`🚀 Servidor corriendo en http://${HOST}:${PORT}`);
  });
};

startServer();
