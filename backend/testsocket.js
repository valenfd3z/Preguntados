// testsocket.js
const io = require('socket.io-client');

const SERVER_URL = 'http://localhost:3000';

// Simular dos jugadores
const players = [
  { username: 'Jugador1', socket: null },
  { username: 'Jugador2', socket: null }
];

// Función para conectarse y manejar eventos
function connectPlayer(player) {
  player.socket = io(SERVER_URL);

  player.socket.on('connect', () => {
    console.log(`${player.username} conectado con id: ${player.socket.id}`);
    // Unirse a partida 1vs1
    player.socket.emit('join_1vs1', { username: player.username });
  });

  player.socket.on('game_start', (data) => {
    console.log(`${player.username} comenzó la partida:`, data);
    if (data.yourTurn) {
      answerQuestion(player, data.question, data.gameId);
    }
  });

  player.socket.on('update', (data) => {
    console.log(`${player.username} actualización:`, data);
    if (data.gameOver) {
      console.log(`${player.username} fin de la partida. Puntaje:`, data.score);
      player.socket.disconnect();
    } else if (data.yourTurn && data.question) {
      answerQuestion(player, data.question, data.gameId);
    }
  });

  player.socket.on('disconnect', () => {
    console.log(`${player.username} desconectado`);
  });
}

// Función para responder automáticamente
function answerQuestion(player, question, gameId) {
  // Elegir una opción al azar
  const randomAnswer = question.options[Math.floor(Math.random() * question.options.length)];
  console.log(`${player.username} responde: ${randomAnswer}`);
  player.socket.emit('answer', { gameId, answer: randomAnswer });
}

// Conectar ambos jugadores
players.forEach(connectPlayer);
