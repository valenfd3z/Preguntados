function getServerUrl() {
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:') {
    return 'http://' + window.location.hostname + ':4000';
  }
  return window.location.origin;
}

const serverUrl = getServerUrl();
const socket = io(serverUrl, {
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 20000,
  transports: ['websocket', 'polling']
});

const POINTER_ANGLE = 270;
const joinBtn = document.getElementById('joinBtn');
const soloBtn = document.getElementById('soloBtn');
const usernameInput = document.getElementById('username');
const loginDiv = document.getElementById('login');
const gameDiv = document.getElementById('game');
const questionDiv = document.getElementById('question');
const optionsDiv = document.getElementById('options');
const turnInfo = document.getElementById('turnInfo');
const progressBar = document.getElementById('progressBar');
const timerBar = document.getElementById('timerBar');
const rouletteCanvas = document.getElementById('roulette');

let currentGameId = null;
let gameMode = null;
let timerInterval = null;
let isSpinning = false;
let canSpin = false;
let currentRotation = 0;
let categoryImages = {};
let answerSubmitted = false; // MEJORADO: Flag para evitar envíos duplicados

const categories = [
  { name: 'geografia', icon: 'icons/geografia.png', color: '#ff6b6b' },
  { name: 'deportes', icon: 'icons/deportes.png', color: '#4ecdc4' },
  { name: 'historia', icon: 'icons/historia.png', color: '#45b7d1' },
  { name: 'entretenimiento', icon: 'icons/entretenimiento.png', color: '#f9ca24' },
  { name: 'arte', icon: 'icons/arte.png', color: '#6c5ce7' },
  { name: 'ciencia', icon: 'icons/ciencia.png', color: '#a0e7e5' }
];

const ctx = rouletteCanvas.getContext('2d');
rouletteCanvas.width = 500;
rouletteCanvas.height = 500;
const radius = rouletteCanvas.width / 2;
const centerX = radius;
const centerY = radius;

function preloadImages() {
  return Promise.all(categories.map((cat, i) => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => { categoryImages[i] = img; resolve(); };
    img.onerror = () => { categoryImages[i] = null; resolve(); };
    img.src = cat.icon;
  })));
}

function shuffleArray(array) {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
}

function drawRoulette() {
  ctx.clearRect(0, 0, rouletteCanvas.width, rouletteCanvas.height);
  const anglePerSlice = (2 * Math.PI) / categories.length;

  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.rotate(currentRotation * Math.PI / 180);
  ctx.translate(-centerX, -centerY);

  categories.forEach((cat, i) => {
    const startAngle = i * anglePerSlice;
    const endAngle = startAngle + anglePerSlice;

    ctx.fillStyle = cat.color;
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, radius - 20, startAngle, endAngle);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#333';
    ctx.lineWidth = 3;
    ctx.stroke();

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

  ctx.restore();

  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(centerX, centerY, 40, 0, 2 * Math.PI);
  ctx.fill();
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.fillStyle = '#333';
  ctx.font = 'bold 12px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(canSpin && !isSpinning ? '¡GIRA!' : isSpinning ? '...' : 'ESPERA', centerX, centerY);

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
  const effectiveAngle = (POINTER_ANGLE - normalizedRotation + 360) % 360;
  const selectedIndex = Math.floor(effectiveAngle / anglePerSlice);
  return categories[selectedIndex];
}

rouletteCanvas.addEventListener('click', () => {
  if (!canSpin || isSpinning) return;
  spinRoulette();
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
  const startTime = performance.now();
  const duration = 3000;
  const startRotation = currentRotation;
  const categoryAngle = 360 / categories.length;
  const categoryIndex = Math.floor(Math.random() * categories.length);
  const targetAngle = categoryIndex * categoryAngle;
  const rotations = 3;
  const targetRotation = startRotation + (360 * rotations) + ((targetAngle - (startRotation % 360) + 360) % 360);

  function animate(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(1, elapsed / duration);
    const easeOutCubic = 1 - Math.pow(1 - progress, 3);
    currentRotation = startRotation + (targetRotation - startRotation) * easeOutCubic;
    drawRoulette();
    if (progress < 1) {
      requestAnimationFrame(animate);
    } else {
      currentRotation = targetRotation % 360;
      drawRoulette();
      const finalCategory = getSelectedCategory(currentRotation);
      setTimeout(() => {
        socket.emit('request_question_by_category', { gameId: currentGameId, category: finalCategory.name });
        isSpinning = false;
      }, 100);
    }
  }
  requestAnimationFrame(animate);
}

joinBtn.addEventListener('click', () => joinGame('1vs1'));
soloBtn.addEventListener('click', () => joinGame('solo'));

function joinGame(mode) {
  const username = usernameInput.value.trim();
  if (!username) return alert('Ingresa tu nombre');
  gameMode = mode;
  loginDiv.style.display = 'none';
  gameDiv.style.display = 'block';
  if (mode === 'solo') {
    socket.emit('join_solo', { username });
  } else {
    canSpin = false;
    socket.emit('join_1vs1', { username });
  }
  joinBtn.disabled = true;
  soloBtn.disabled = true;
  drawRoulette();
}

socket.on('game_start', (data) => {
  currentGameId = data.gameId;
  canSpin = data.yourTurn;
  turnInfo.innerText = gameMode === 'solo' ? '¡Haz clic en la ruleta para comenzar!' :
    data.yourTurn ? '¡Tu turno! Haz clic en la ruleta' : `Esperando a ${data.opponent}...`;
  drawRoulette();
});

socket.on('question_by_category', (data) => {
  console.log('Pregunta recibida:', data.question);
  answerSubmitted = false; // MEJORADO: Reset flag al recibir nueva pregunta
  renderQuestion(data.question, data.yourTurn, data.questionsAnswered || 0);
});

socket.on('next_spin', (data) => {
  canSpin = data.canSpin;
  turnInfo.innerText = gameMode === 'solo' ? '¡Haz clic en la ruleta para continuar!' :
    data.canSpin ? '¡Tu turno! Gira la ruleta' : 'Esperando al oponente...';
  drawRoulette();
});

socket.on('update', (data) => {
  if (data.gameOver) {
    clearInterval(timerInterval);
    canSpin = false;
    drawRoulette();
    
    // MEJORADO: Redirigir según el resultado
    if (gameMode === 'solo') {
      showSoloResults(data);
    } else {
      redirect1vs1Results(data);
    }
    return;
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
  // MEJORADO: Redirigir a ganador si el oponente se desconecta
  window.location.href = 'ganador.html';
});

socket.on('error', (data) => {
  if (data.message !== 'No es tu turno') {
    console.error('Error:', data.message);
  }
});

function renderQuestion(question, yourTurn, answeredCount) {
  clearInterval(timerInterval);
  timerBar.style.width = '100%';
  canSpin = false;
  drawRoulette();
  const isSoloMode = gameMode === 'solo';
  if (isSoloMode) yourTurn = true;

  turnInfo.innerText = yourTurn ? 'Responde la pregunta' : 'Turno del oponente';
  questionDiv.innerText = question?.text || 'Pregunta no disponible';
  optionsDiv.innerHTML = '';

  if (!yourTurn && !isSoloMode) {
    const waitMessage = document.createElement('div');
    waitMessage.textContent = 'ESPERA TU TURNO PARA RESPONDER';
    waitMessage.style.fontSize = '24px';
    waitMessage.style.fontWeight = 'bold';
    waitMessage.style.color = '#ff6b6b';
    waitMessage.style.textAlign = 'center';
    waitMessage.style.margin = '20px 0';
    optionsDiv.appendChild(waitMessage);
    return;
  }

  const options = Array.isArray(question?.options) ? question.options : [];
  const correctAnswer = String(question?.correct || '').trim().toLowerCase();
  const optionsWithText = options.map(text => ({
    text: text || 'Opción no disponible',
    isCorrect: String(text).trim().toLowerCase() === correctAnswer
  }));

  const shuffledOptions = shuffleArray(optionsWithText);

  shuffledOptions.forEach((option, index) => {
    const btn = document.createElement('button');
    btn.innerText = option.text;
    btn.classList.add('option-btn');
    btn.addEventListener('click', () => submitAnswer(option.text, correctAnswer, shuffledOptions));
    optionsDiv.appendChild(btn);
  });

  let time = 15;
  timerInterval = setInterval(() => {
    time--;
    timerBar.style.width = `${(time / 15) * 100}%`;
    turnInfo.innerText = isSoloMode ? `Responde en ${time} segundos` : `Tu turno - Responde en ${time} segundos`;
    if (time <= 0) {
      clearInterval(timerInterval);
      if (!answerSubmitted) { // MEJORADO: Evitar envío duplicado
        document.querySelectorAll('.option-btn').forEach(b => b.disabled = true);
        turnInfo.innerText = '¡Tiempo agotado!';
        answerSubmitted = true;
        socket.emit('answer', { gameId: currentGameId, answer: null });
      }
    }
  }, 1000);

  const totalQuestions = gameMode === 'solo' ? 5 : 10;
  progressBar.style.width = `${((answeredCount + 1) / totalQuestions) * 100}%`;
}

function submitAnswer(selectedText, correctAnswer, shuffledOptions) {
  // MEJORADO: Evitar envíos duplicados
  if (answerSubmitted) return;
  answerSubmitted = true;
  
  const buttons = document.querySelectorAll('.option-btn');
  const isCorrect = String(selectedText).trim().toLowerCase() === String(correctAnswer).trim().toLowerCase();
  const correctAnswerText = correctAnswer || 'Respuesta no disponible';

  console.log('Enviando respuesta:', { selectedText, correctAnswer, isCorrect });

  const answerElement = document.createElement('div');
  answerElement.className = 'answer-feedback';
  answerElement.innerHTML = isCorrect ?
    `<p class="correct-answer">¡Correcto! La respuesta es: <strong>${correctAnswerText}</strong></p><button id="continueBtn" class="continue-btn">Continuar</button>` :
    `<p class="incorrect-answer">Incorrecto. Seleccionaste: <strong>${selectedText}</strong></p><p>La respuesta correcta era: <strong>${correctAnswerText}</strong></p><button id="continueBtn" class="continue-btn">Continuar</button>`;

  buttons.forEach((btn, index) => {
    btn.disabled = true;
    if (String(shuffledOptions[index].text).trim().toLowerCase() === correctAnswer) {
      btn.classList.add('correct');
    } else if (String(shuffledOptions[index].text).trim().toLowerCase() === String(selectedText).trim().toLowerCase()) {
      btn.classList.add('wrong');
    }
  });
  optionsDiv.appendChild(answerElement);

  clearInterval(timerInterval);

  const sendAnswer = () => {
    socket.emit('answer', {
      gameId: currentGameId,
      answer: selectedText,
      isCorrect
    });
  };

  const continueBtn = document.getElementById('continueBtn');
  if (continueBtn) {
    continueBtn.addEventListener('click', () => {
      answerElement.remove();
      sendAnswer();
    });
  }

  setTimeout(() => {
    if (document.body.contains(answerElement)) {
      answerElement.remove();
      sendAnswer();
    }
  }, 3000);
}

// MEJORADO: Función para modo solo con retroalimentación completa
function showSoloResults(data) {
  rouletteCanvas.style.display = 'none';
  questionDiv.innerText = '';
  optionsDiv.innerHTML = '';
  
  const playerScore = data.score[socket.id] || 0;
  const totalQuestions = data.totalQuestions || 5;
  const percentage = Math.round((playerScore / totalQuestions) * 100);
  const incorrectAnswers = totalQuestions - playerScore;
  
  let message = '', messageColor = '', emoji = '', encouragement = '';
  
  if (percentage >= 80) { 
    message = '¡Excelente!'; 
    messageColor = '#4caf50'; 
    emoji = '🎉';
    encouragement = '¡Eres un experto en trivia!';
  } else if (percentage >= 60) { 
    message = '¡Muy bien!'; 
    messageColor = '#4cc9f0'; 
    emoji = '👍';
    encouragement = '¡Buen trabajo! Sigue así.';
  } else if (percentage >= 40) { 
    message = '¡Buen intento!'; 
    messageColor = '#ff9800'; 
    emoji = '💪';
    encouragement = 'Con práctica mejorarás aún más.';
  } else { 
    message = '¡Sigue practicando!'; 
    messageColor = '#f44336'; 
    emoji = '📚';
    encouragement = 'Cada intento te hace más fuerte.';
  }
  
  turnInfo.innerHTML = `
    <div style="text-align:center;padding:2rem;max-width:600px;margin:0 auto;">
      <div style="font-size:4rem;margin-bottom:1rem;">${emoji}</div>
      <h2 style="color:${messageColor};margin-bottom:0.5rem;font-size:2.5rem;">${message}</h2>
      <p style="color:#aaa;font-size:1.1rem;margin-bottom:2rem;">${encouragement}</p>
      
      <div style="background: rgba(26,26,46,0.9); padding:2rem; border-radius:1.5rem; color:white; margin-bottom:1.5rem; box-shadow: 0 8px 32px rgba(0,0,0,0.3);">
        <h3 style="margin-bottom:1.5rem;font-size:1.5rem;color:#fff;border-bottom:2px solid ${messageColor};padding-bottom:0.5rem;">Resumen de tu partida</h3>
        
        <div style="display:flex;justify-content:space-around;margin-bottom:1.5rem;flex-wrap:wrap;">
          <div style="text-align:center;padding:1rem;flex:1;min-width:150px;">
            <div style="font-size:3rem;font-weight:bold;color:${messageColor};">${playerScore}</div>
            <div style="font-size:0.9rem;color:#aaa;margin-top:0.5rem;">Respuestas correctas ✓</div>
          </div>
          
          <div style="text-align:center;padding:1rem;flex:1;min-width:150px;">
            <div style="font-size:3rem;font-weight:bold;color:#f44336;">${incorrectAnswers}</div>
            <div style="font-size:0.9rem;color:#aaa;margin-top:0.5rem;">Respuestas incorrectas ✗</div>
          </div>
        </div>
        
        <div style="background:rgba(0,0,0,0.3);padding:1.5rem;border-radius:1rem;margin-bottom:1rem;">
          <div style="font-size:1.2rem;margin-bottom:0.5rem;color:#ccc;">Porcentaje de aciertos</div>
          <div style="font-size:3.5rem;font-weight:bold;color:${messageColor};">${percentage}%</div>
          <div style="background:#333;height:20px;border-radius:10px;overflow:hidden;margin-top:1rem;">
            <div style="background:${messageColor};height:100%;width:${percentage}%;transition:width 1s ease;border-radius:10px;"></div>
          </div>
        </div>
        
        <div style="font-size:0.95rem;color:#888;margin-top:1rem;">
          Total de preguntas: <strong style="color:#fff;">${totalQuestions}</strong>
        </div>
      </div>
      
      <button id="backToMenuBtn" style="
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        border: none;
        padding: 1.2rem 3rem;
        font-size: 1.3rem;
        border-radius: 0.8rem;
        cursor: pointer;
        font-weight: bold;
        transition: all 0.3s ease;
        box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
      " onmouseover="this.style.transform='scale(1.05)';this.style.boxShadow='0 6px 20px rgba(102, 126, 234, 0.6)';" onmouseout="this.style.transform='scale(1)';this.style.boxShadow='0 4px 15px rgba(102, 126, 234, 0.4)';">
        🏠 Volver al Menú Principal
      </button>
    </div>`;
  
  const backBtn = document.getElementById('backToMenuBtn');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      window.location.href = 'index.html';
    });
  }
}

// MEJORADO: Función para redirigir según resultado 1vs1
function redirect1vs1Results(data) {
  const isWinner = data.winner === socket.id;
  const isDraw = data.isDraw;
  
  // Guardar datos en localStorage para mostrarlos en la página de resultados
  const resultData = {
    player1: data.player1,
    player2: data.player2,
    myScore: data.score[socket.id] || 0,
    opponentScore: data.player1.id === socket.id ? data.player2.score : data.player1.score,
    totalQuestions: data.totalQuestions || 10
  };
  
  localStorage.setItem('gameResult', JSON.stringify(resultData));
  
  // Redirigir directamente según el resultado
  if (isDraw) {
    window.location.href = 'empate.html';
  } else if (isWinner) {
    window.location.href = 'ganador.html';
  } else {
    window.location.href = 'perdedor.html';
  }
}

window.addEventListener('online', () => {
  console.log('Conexión restaurada');
  if (!socket.connected && !socket.connecting) socket.connect();
});
window.addEventListener('offline', () => console.log('Conexión perdida'));

preloadImages().then(drawRoulette);