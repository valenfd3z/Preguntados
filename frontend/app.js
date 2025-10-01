// app.js - Configuración mejorada para Socket.IO con manejo de errores

// Obtener la URL base del servidor
function getServerUrl() {
  // Si estamos en un entorno de desarrollo o en localhost
  if (window.location.hostname === 'localhost' || 
      window.location.hostname === '127.0.0.1' || 
      window.location.protocol === 'file:') {
    // Usar la IP local del servidor con el puerto 4000
    return 'http://' + window.location.hostname + ':4000';
  }
  // En producción, usar el mismo origen
  return window.location.origin;
}

const serverUrl = getServerUrl();
console.log('Conectando al servidor en:', serverUrl);

// Configuración de Socket.IO
const socket = io(serverUrl, {
  // Configuración para mejor compatibilidad móvil
  reconnection: true,
  reconnectionAttempts: 10,  // Aumentar los intentos de reconexión
  reconnectionDelay: 1000,   // 1 segundo de espera inicial
  reconnectionDelayMax: 5000, // 5 segundos máximo de espera
  timeout: 20000,            // 20 segundos de timeout
  transports: ['websocket', 'polling'],
  upgrade: true,
  forceNew: true,           // Forzar nueva conexión
  autoConnect: true,        // Conectar automáticamente
  withCredentials: false,
  path: '/socket.io/'       // Ruta del endpoint de Socket.IO
});

// Manejar eventos de conexión
document.addEventListener('DOMContentLoaded', () => {
  const turnInfo = document.getElementById('turnInfo');
  if (turnInfo) {
    turnInfo.textContent = 'Conectando al servidor...';
    turnInfo.style.color = '#4ecdc4';
  }
});

// Manejar eventos de conexión
document.addEventListener('offline', () => {
  console.log('Sin conexión a internet');
  if (turnInfo) {
    turnInfo.innerText = 'Sin conexión. Intentando reconectar...';
    turnInfo.style.color = '#ff6b6b';
  }
});

document.addEventListener('online', () => {
  console.log('Conexión restablecida');
  if (turnInfo) {
    turnInfo.innerText = 'Conectando al servidor...';
    turnInfo.style.color = '#4ecdc4';
  }
  if (!socket.connected) {
    socket.connect();
  }
});

// Manejar eventos de conexión del socket
socket.on('connect', () => {
  console.log('Conectado al servidor');
  if (turnInfo && turnInfo.innerText.includes('conexión')) {
    turnInfo.innerText = '¡Conectado! Elige un modo de juego.';
    turnInfo.style.color = '#4ecdc4';
  }
});

socket.on('disconnect', (reason) => {
  console.log('Desconectado del servidor:', reason);
  if (turnInfo) {
    turnInfo.innerText = 'Desconectado. Reconectando...';
    turnInfo.style.color = '#ff6b6b';
  }
});

socket.on('connect_error', (error) => {
  console.error('Error de conexión:', error);
  if (turnInfo) {
    turnInfo.innerText = 'Error de conexión. Verifica tu conexión a internet.';
    turnInfo.style.color = '#ff6b6b';
  }
});

const joinBtn = document.getElementById('joinBtn');
const soloBtn = document.getElementById('soloBtn');
const usernameInput = document.getElementById('username');
const loginDiv = document.getElementById('login');
const gameDiv = document.getElementById('game');
const questionDiv = document.getElementById('question');
const optionsDiv = document.getElementById('options');
const turnInfo = document.getElementById('turnInfo');
const scoreDiv = document.getElementById('score');
const progressBar = document.getElementById('progressBar');
const timerBar = document.getElementById('timerBar');
const rouletteCanvas = document.getElementById('roulette');

let currentGameId = null;
let gameMode = null; // 'solo' or '1vs1'
let timerInterval;
let isSpinning = false;
let canSpin = false;
let currentRotation = 0;
let categoryImages = {}; // Cache para las imágenes

let categories = [
  { name: 'geografia', icon: 'icons/geografia.png', color: '#ff6b6b' },
  { name: 'deportes', icon: 'icons/deportes.png', color: '#4ecdc4' },
  { name: 'historia', icon: 'icons/historia.png', color: '#45b7d1' },
  { name: 'entretenimiento', icon: 'icons/entretenimiento.png', color: '#f9ca24' },
  { name: 'arte', icon: 'icons/arte.png', color: '#6c5ce7' },
  { name: 'ciencia', icon: 'icons/ciencia.png', color: '#a0e7e5' }
];

// Canvas setup
const ctx = rouletteCanvas.getContext('2d');
rouletteCanvas.width = 500;
rouletteCanvas.height = 500;
const radius = rouletteCanvas.width / 2;
const centerX = radius;
const centerY = radius;

// Precargar todas las imágenes
function preloadImages() {
  return new Promise((resolve) => {
    let imagesLoaded = 0;
    const totalImages = categories.length;

    categories.forEach((category, index) => {
      const img = new Image();
      img.onload = () => {
        categoryImages[index] = img;
        imagesLoaded++;
        if (imagesLoaded === totalImages) {
          console.log('Todas las imágenes cargadas');
          resolve();
        }
      };
      img.onerror = () => {
        console.warn(`No se pudo cargar la imagen: ${category.icon}`);
        categoryImages[index] = null; // Marcar como no disponible
        imagesLoaded++;
        if (imagesLoaded === totalImages) {
          resolve();
        }
      };
      img.src = category.icon;
    });
  });
}

function drawRoulette() {
  ctx.clearRect(0, 0, rouletteCanvas.width, rouletteCanvas.height);
  const anglePerSlice = (2 * Math.PI) / categories.length;

  // Guardar estado actual y rotar para la rueda
  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.rotate(currentRotation * Math.PI / 180);
  ctx.translate(-centerX, -centerY);

  // Dibujar sectores
  categories.forEach((cat, i) => {
    const startAngle = i * anglePerSlice;
    const endAngle = startAngle + anglePerSlice;

    // Usar colores específicos para cada categoría
    ctx.fillStyle = cat.color;
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, radius - 20, startAngle, endAngle);
    ctx.closePath();
    ctx.fill();

    // Borde
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Dibujar icono sin rotación adicional
    const middleAngle = startAngle + anglePerSlice / 2;
    const iconRadius = radius - 80;
    const iconX = centerX + Math.cos(middleAngle) * iconRadius;
    const iconY = centerY + Math.sin(middleAngle) * iconRadius;

    if (categoryImages[i]) {
      const iconSize = 60;
      ctx.save();
      ctx.translate(iconX, iconY);
      ctx.drawImage(categoryImages[i], -iconSize / 2, -iconSize / 2, iconSize, iconSize);
      ctx.restore();
    } else {
      ctx.save();
      ctx.beginPath();
      ctx.arc(iconX, iconY, 20, 0, 2 * Math.PI);
      ctx.fillStyle = '#888';
      ctx.fill();
      ctx.restore();
    }
  });

  ctx.restore(); // Restaurar estado para elementos fijos

  // Círculo central (fijo)
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(centerX, centerY, 40, 0, 2 * Math.PI);
  ctx.fill();
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 3;
  ctx.stroke();

  // Texto central (fijo)
  ctx.fillStyle = '#333';
  ctx.font = 'bold 12px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'transparent';
  if (canSpin && !isSpinning) {
    ctx.fillText('¡GIRA!', centerX, centerY);
  } else if (isSpinning) {
    ctx.fillText('...', centerX, centerY);
  } else {
    ctx.fillText('ESPERA', centerX, centerY);
  }

  // Flecha indicadora (arriba, fija)
  ctx.fillStyle = '#ff4757';
  ctx.beginPath();
  ctx.moveTo(centerX, 5);
  ctx.lineTo(centerX - 20, 45);
  ctx.lineTo(centerX + 20, 45);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 3;
  ctx.stroke();
}

function getSelectedCategory(rotation) {
  const normalizedRotation = ((rotation % 360) + 360) % 360;
  const anglePerSlice = 360 / categories.length;
  const pointerAngle = 270; // Ángulo para la flecha en la parte superior (top en canvas)
  const effectiveAngle = (pointerAngle - normalizedRotation + 360) % 360;
  const selectedIndex = Math.floor(effectiveAngle / anglePerSlice);
  return categories[selectedIndex];
}

// Event listener para hacer clic en la ruleta
rouletteCanvas.addEventListener('click', (event) => {
  if (!canSpin || isSpinning) return;

  const rect = rouletteCanvas.getBoundingClientRect();
  const clickX = event.clientX - rect.left;
  const clickY = event.clientY - rect.top;
  
  const distance = Math.sqrt((clickX - centerX) ** 2 + (clickY - centerY) ** 2);
  if (distance <= radius - 20) {
    spinRoulette();
  }
});

rouletteCanvas.addEventListener('mousemove', (event) => {
  if (!canSpin || isSpinning) {
    rouletteCanvas.style.cursor = 'default';
    return;
  }

  const rect = rouletteCanvas.getBoundingClientRect();
  const mouseX = event.clientX - rect.left;
  const mouseY = event.clientY - rect.top;
  const distance = Math.sqrt((mouseX - centerX) ** 2 + (mouseY - centerY) ** 2);
  
  rouletteCanvas.style.cursor = distance <= radius - 20 ? 'pointer' : 'default';
});

function spinRoulette() {
  if (!canSpin || isSpinning) return;
  
  isSpinning = true;
  canSpin = false;
  
  const minRotation = 1080;
  const maxRotation = 2160;
  const targetRotation = currentRotation + minRotation + Math.random() * (maxRotation - minRotation);
  const duration = 3000;
  const startTime = performance.now();

  function animate(time) {
    const elapsed = time - startTime;
    const progress = elapsed / duration;
    const ease = progress * (2 - progress);

    currentRotation = currentRotation + (targetRotation - currentRotation) * ease;

    drawRoulette();

    if (elapsed < duration) {
      requestAnimationFrame(animate);
    } else {
      currentRotation = targetRotation % 360;
      isSpinning = false;
      const selectedCategory = getSelectedCategory(currentRotation);
      console.log('Categoría seleccionada:', selectedCategory.name); // Depuración para verificar sincronización
      
      // Mostrar solo el icono de la categoría seleccionada (sin nombre)
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.8)';
      ctx.fillRect(0, 0, rouletteCanvas.width, rouletteCanvas.height);
      
      const categoryIndex = categories.findIndex(cat => cat.name === selectedCategory.name);
      if (categoryImages[categoryIndex]) {
        ctx.drawImage(categoryImages[categoryIndex], centerX - 40, centerY - 60, 80, 80);
      }
      
      ctx.restore();
      
      setTimeout(() => {
        drawRoulette();
        socket.emit('request_question_by_category', {
          gameId: currentGameId,
          category: selectedCategory.name
        });
      }, 1500);
    }
  }

  requestAnimationFrame(animate);
}

// === Botones ===
joinBtn.addEventListener('click', () => joinGame('1vs1'));
soloBtn.addEventListener('click', () => joinGame('solo'));

function joinGame(mode) {
  const username = usernameInput.value.trim();
  if (!username) return alert('Ingresa tu nombre');

  gameMode = mode;
  loginDiv.style.display = 'none';
  gameDiv.style.display = 'block';

  if (mode === '1vs1') {
    socket.emit('join_1vs1', { username });
  } else {
    socket.emit('join_solo', { username });
  }

  joinBtn.disabled = true;
  soloBtn.disabled = true;
}

// === Socket.io ===
socket.on('game_start', (data) => {
  currentGameId = data.gameId;
  canSpin = data.yourTurn;
  drawRoulette();
  
  if (gameMode === '1vs1') {
    turnInfo.innerText = data.yourTurn ? '¡Tu turno! Haz clic en la ruleta' : `Esperando a ${data.opponent}...`;
  } else {
    turnInfo.innerText = '¡Haz clic en la ruleta para comenzar!';
  }
});

socket.on('question_by_category', (data) => {
  renderQuestion(data.question, data.yourTurn || true, data.questionsAnswered || 0);
});

socket.on('next_spin', (data) => {
  console.log('Next spin recibido:', data);
  canSpin = data.canSpin;
  drawRoulette();
  if (data.canSpin) {
    turnInfo.innerText = data.yourTurn ? '¡Tu turno! Gira la ruleta' : 'Turno del oponente';
  }
});

socket.on('update', (data) => {
  console.log('Update recibido:', data);
  
  if (data.gameOver) {
    clearInterval(timerInterval);
    canSpin = false;
    drawRoulette();
    
    if (gameMode === 'solo') {
      // Mostrar resultados en la misma página para modo solo
      const score = data.score[socket.id] || 0;
      const total = data.totalQuestions || 10;
      const scorePercentage = (score / total) * 100;
      
      // Ocultar la ruleta y la pregunta
      rouletteCanvas.style.display = 'none';
      questionDiv.style.display = 'none';
      optionsDiv.innerHTML = '';
      
      // Mostrar mensaje de resultado
      if (scorePercentage >= 70) {
        turnInfo.innerHTML = `
          <h2>¡Felicidades! Has ganado</h2>
          <p>Puntuación: ${score} de ${total} (${scorePercentage.toFixed(0)}%)</p>
          <button onclick="location.reload()" class="btn">Jugar de nuevo</button>
        `;
      } else {
        turnInfo.innerHTML = `
          <h2>¡Juego terminado!</h2>
          <p>Puntuación: ${score} de ${total} (${scorePercentage.toFixed(0)}%)</p>
          <p>Necesitas al menos un 70% para ganar. ¡Sigue intentándolo!</p>
          <button onclick="location.reload()" class="btn">Reintentar</button>
        `;
      }
    } else {
      // Lógica para 1vs1
      const playerIds = Object.keys(data.score);
      
      if (playerIds.length === 2) {
        const player1Score = data.score[playerIds[0]] || 0;
        const player2Score = data.score[playerIds[1]] || 0;
        const isPlayer1 = playerIds[0] === socket.id;
        
        if (player1Score > player2Score) {
          // Jugador 1 gana
          window.location.href = isPlayer1 ? 'ganador.html' : 'perdedor.html';
        } else if (player2Score > player1Score) {
          // Jugador 2 gana
          window.location.href = isPlayer1 ? 'perdedor.html' : 'ganador.html';
        } else {
          // Empate
          window.location.href = `empate.html?score=${player1Score}`;
        }
      } else {
        // Caso inesperado, recargar
        location.reload();
      }
    }
    
    return;
  }

  if (gameMode === 'solo') {
    scoreDiv.innerText = `Puntaje: ${data.score[socket.id]} | Pregunta ${data.questionsAnswered} de ${data.totalQuestions}`;
  } else {
    scoreDiv.innerText = `Puntaje: ${JSON.stringify(data.score)}`;
  }
  
  if (data.nextRound) {
    questionDiv.innerText = '';
    optionsDiv.innerHTML = '';
    clearInterval(timerInterval);
    timerBar.style.width = '100%';
    canSpin = data.yourTurn;
    drawRoulette();
    turnInfo.innerText = data.yourTurn ? '¡Tu turno! Gira la ruleta' : 'Esperando al oponente...';
  }
});

socket.on('opponent_disconnected', (data) => {
  alert(data.message);
  location.reload();
});

socket.on('error', (data) => {
  alert(`Error: ${data.message}`);
  if (data.message.includes('No hay preguntas disponibles')) {
    canSpin = true;
    drawRoulette();
    turnInfo.innerText = '¡Gira la ruleta de nuevo!';
  }
});

// === Renderizado de preguntas ===
function renderQuestion(question, yourTurn, answeredCount) {
  clearInterval(timerInterval);
  timerBar.style.width = '100%';
  canSpin = false;
  drawRoulette();

  if (!question) {
    questionDiv.innerText = 'Esperando pregunta...';
    optionsDiv.innerHTML = '';
    turnInfo.innerText = '';
    return;
  }

  turnInfo.innerText = yourTurn ? 'Tu turno - Responde la pregunta' : 'Turno del oponente';
  questionDiv.innerText = question.text;
  optionsDiv.innerHTML = '';

  // Función para mezclar un array (algoritmo Fisher-Yates)
  function shuffleArray(array) {
    const newArray = [...array];
    for (let i = newArray.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
    }
    return newArray;
  }

  // Verificar que question.options sea un array
  if (!Array.isArray(question.options) || question.options.length === 0) {
    console.error('No hay opciones disponibles para la pregunta:', question);
    return;
  }

  // Crear un array de objetos con el texto y el índice original
  const optionsWithIndex = question.options.map((text, index) => ({
    text,
    originalIndex: index,
    isCorrect: false
  }));
  
  // Determinar el índice correcto en las opciones originales
  let correctAnswerIndex;
  
  if (typeof question.correct === 'number') {
    correctAnswerIndex = question.correct;
  } else if (question.correct !== undefined) {
    // Si question.correct es un valor, buscamos su índice en las opciones
    correctAnswerIndex = question.options.findIndex(opt => opt === question.correct);
  } else {
    // Si no hay un índice correcto definido, usamos 0 como valor por defecto
    console.warn('No se encontró un índice correcto definido, usando 0 como predeterminado');
    correctAnswerIndex = 0;
  }
  
  // Asegurarse de que el índice esté dentro de los límites
  if (correctAnswerIndex < 0 || correctAnswerIndex >= question.options.length) {
    console.warn('Índice correcto fuera de rango, usando 0 como valor predeterminado');
    correctAnswerIndex = 0;
  }
  
  // Marcar la opción correcta
  if (optionsWithIndex[correctAnswerIndex]) {
    optionsWithIndex[correctAnswerIndex].isCorrect = true;
  }
  
  // Mezclar las opciones (incluyendo la correcta)
  const shuffledOptions = shuffleArray([...optionsWithIndex]);
  
  // Encontrar el nuevo índice de la respuesta correcta después de mezclar
  const correctIndex = shuffledOptions.findIndex(opt => opt.isCorrect);
  
  if (correctIndex === -1) {
    console.error('No se pudo encontrar la opción correcta después de mezclar');
    console.log('Opciones originales:', question.options);
    console.log('Opciones mezcladas:', shuffledOptions);
    // Usar la primera opción como fallback
    return renderQuestion({
      ...question,
      correct: 0
    }, yourTurn, answeredCount);
  }
  
  // Depuración
  console.log('=== Información de la pregunta ===');
  console.log('Pregunta:', question.text);
  console.log('Opciones originales:', question.options);
  console.log('Opciones mezcladas:', shuffledOptions.map(o => o.text));
  console.log('Índice correcto original:', correctAnswerIndex);
  console.log('Índice correcto en opciones mezcladas:', correctIndex);
  console.log('Texto correcto:', shuffledOptions[correctIndex]?.text);
  console.log('==============================');
  
  // Mostrar las opciones mezcladas
  shuffledOptions.forEach((option, index) => {
    const btn = document.createElement('button');
    btn.innerText = option.text;
    btn.classList.add('option-btn');
    btn.disabled = !yourTurn;
    
    // Usar el índice de la opción en el array mezclado
    btn.addEventListener('click', () => {
      console.log('Opción seleccionada:', index, 'Texto:', option.text);
      console.log('Índice correcto:', correctIndex, 'Texto correcto:', shuffledOptions[correctIndex]?.text);
      submitAnswer(index, correctIndex);
    });
    optionsDiv.appendChild(btn);
  });
  
  // Depuración detallada
  console.log('=== Información de la pregunta ===');
  console.log('Pregunta:', question.text);
  console.log('Opciones originales:', question.options);
  console.log('Opciones mezcladas:', shuffledOptions.map(o => o.text));
  console.log('Índice correcto:', correctIndex);
  console.log('Respuesta correcta:', shuffledOptions[correctIndex]?.text || 'No disponible');
  console.log('==============================');

  if (yourTurn) {
    let time = 15;
    turnInfo.innerText = `Tu turno - Responde en ${time} segundos`;
    timerInterval = setInterval(() => {
      time--;
      timerBar.style.width = `${(time/15)*100}%`;
      turnInfo.innerText = `Tu turno - Responde en ${time} segundos`;
      if (time <= 0) {
        clearInterval(timerInterval);
        document.querySelectorAll('.option-btn').forEach(b => b.disabled = true);
        turnInfo.innerText = '¡Tiempo agotado!';
        socket.emit('answer', { gameId: currentGameId, answer: null });
      }
    }, 1000);
  }

  const totalQuestions = gameMode === 'solo' ? 5 : 10;
  progressBar.style.width = `${(answeredCount/totalQuestions)*100}%`;
}

function submitAnswer(selectedIndex, correctIndex) {
  const optionsContainer = document.getElementById('options');
  const buttons = Array.from(document.querySelectorAll('.option-btn'));
  
  // Verificar que los índices sean válidos
  if (correctIndex < 0 || correctIndex >= buttons.length) {
    console.error('Índice de respuesta correcta inválido:', correctIndex);
    return;
  }
  
  const correctAnswerText = buttons[correctIndex]?.innerText || 'Respuesta no disponible';
  
  // Crear el mensaje de respuesta
  const answerElement = document.createElement('div');
  answerElement.className = 'answer-feedback';
  
  // Determinar si la respuesta fue correcta
  const isCorrect = selectedIndex === correctIndex;
  
  // Configurar el mensaje según si la respuesta fue correcta o no
  if (isCorrect) {
    answerElement.innerHTML = `
      <p class="correct-answer">¡Correcto! La respuesta es: <strong>${correctAnswerText}</strong></p>
      <button id="continueBtn" class="continue-btn">Continuar</button>
    `;
  } else {
    const selectedText = buttons[selectedIndex]?.innerText || 'Opción seleccionada';
    answerElement.innerHTML = `
      <p class="incorrect-answer">Incorrecto. Seleccionaste: <strong>${selectedText}</strong></p>
      <p>La respuesta correcta era: <strong>${correctAnswerText}</strong></p>
      <button id="continueBtn" class="continue-btn">Continuar</button>
    `;
  }
  
  // Deshabilitar todos los botones de opción
  buttons.forEach(btn => {
    btn.disabled = true;
  });
  
  // Resaltar la respuesta correcta e incorrecta (si aplica)
  if (buttons[correctIndex]) {
    buttons[correctIndex].classList.add('correct');
  }
  
  if (selectedIndex >= 0 && selectedIndex < buttons.length && selectedIndex !== correctIndex) {
    buttons[selectedIndex].classList.add('wrong');
  }
  
  // Añadir el mensaje al contenedor
  optionsContainer.appendChild(answerElement);
  
  // Configurar el botón de continuar
  const continueBtn = document.getElementById('continueBtn');
  if (continueBtn) {
    continueBtn.addEventListener('click', () => {
      answerElement.remove();
      // Enviar la respuesta al servidor
      socket.emit('answer', { 
        gameId: currentGameId, 
        selectedIndex: selectedIndex,
        correctIndex: correctIndex
      });
    });
  }
  
  // Limpiar el temporizador si existe
  if (timerInterval) {
    clearInterval(timerInterval);
  }
  
  // Continuar automáticamente después de 5 segundos
  const autoContinue = setTimeout(() => {
    if (document.body.contains(answerElement)) {
      answerElement.remove();
      socket.emit('answer', { 
        gameId: currentGameId, 
        selectedIndex: selectedIndex,
        correctIndex: correctIndex
      });
    }
  }, 5000);
  
  // Limpiar el timeout si se hace clic en continuar
  if (continueBtn) {
    continueBtn.addEventListener('click', () => {
      clearTimeout(autoContinue);
    });
  }
}

// Inicializar la aplicación
async function initApp() {
  console.log('Inicializando aplicación...');
  
  // Registrar el service worker
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.register('service-worker.js');
      console.log('ServiceWorker registrado con éxito:', registration);
      
      // Forzar la actualización del service worker
      if (registration.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      }
      
      // Escuchar actualizaciones del service worker
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            console.log('Nueva versión disponible. Por favor, actualiza la página.');
            // Aquí podrías mostrar un botón para actualizar
          }
        });
      });
      
      // Verificar actualizaciones periódicamente
      setInterval(() => {
        registration.update().catch(err => 
          console.log('Error al verificar actualizaciones:', err)
        );
      }, 60 * 60 * 1000); // Cada hora
      
    } catch (error) {
      console.error('Error al registrar el ServiceWorker:', error);
    }
  }
  
  // Cargar recursos
  console.log('Cargando iconos de categorías...');
  await preloadImages();
  drawRoulette();
  console.log('Aplicación lista!');
  
  // Limpiar cachés antiguos
  if ('caches' in window) {
    caches.keys().then(cacheNames => {
      cacheNames.forEach(cacheName => {
        if (cacheName !== 'preguntados-cache-v2') {
          caches.delete(cacheName);
        }
      });
    });
  }
}

// Inicializar cuando se carga la página
window.addEventListener('load', initApp);
