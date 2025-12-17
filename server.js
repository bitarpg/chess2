const express = require('express');
const app = express();
const http = require('http');
const path = require('path'); // Добавлено для работы с путями
const server = http.createServer(app);
const { Server } = require("socket.io");

// ==========================================
// РАЗДАЧА ФАЙЛОВ (STATIC FILES)
// ==========================================

// Разрешаем серверу отдавать все файлы из текущей папки (styles.css, темы и т.д.)
app.use(express.static(path.join(__dirname, './')));

// Отправляем index.html при заходе на главную страницу
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ==========================================
// НАСТРОЙКА SOCKET.IO
// ==========================================

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// На Render порт назначается автоматически, 3000 — это запасной вариант
const PORT = process.env.PORT || 3000;

// Хранилище игровых комнат
let rooms = {};

io.on('connection', (socket) => {
  console.log('Новое подключение:', socket.id);

  // Создание комнаты
  socket.on('create_room', (roomId) => {
    if (rooms[roomId]) {
      socket.emit('error_msg', 'Комната уже существует!');
      return;
    }
    
    rooms[roomId] = {
      players: [socket.id],
      board: null,
      turn: 'white'
    };
    
    socket.join(roomId);
    
    socket.emit('game_start', { 
        roomId: roomId, 
        color: 'white',
        board: getDefaultBoard(),
        turn: 'white'
    });
    
    console.log(`Комната ${roomId} создана игроком ${socket.id}`);
  });

  // Вход в комнату
  socket.on('join_room', (roomId) => {
    const room = rooms[roomId];
    
    if (!room) {
      socket.emit('error_msg', 'Комната не найдена!');
      return;
    }
    if (room.players.length >= 2) {
      socket.emit('error_msg', 'Комната полна!');
      return;
    }

    room.players.push(socket.id);
    socket.join(roomId);

    io.to(room.players[0]).emit('player_joined', { roomId });

    socket.emit('game_start', { 
        roomId: roomId, 
        color: 'black',
        board: room.board || getDefaultBoard(),
        turn: room.turn 
    });

    console.log(`Игрок ${socket.id} вошел в ${roomId}`);
  });

  // Ход
  socket.on('make_move', (data) => {
    const { roomId, board, turn, lastMove, castling, mode, moveCount, chimeraTracker } = data;
    const room = rooms[roomId];
    
    if (room) {
      room.board = board;
      room.turn = turn;

      io.in(roomId).emit('receive_move', {
        board: board,
        turn: turn,
        lastMove: lastMove,
        castling: castling,
        mode: mode,
        moveCount: moveCount,
        chimeraTracker: chimeraTracker
      });
      console.log(`Ход в комнате ${roomId}: ${turn}`);
    }
  });

  // Отключение
  socket.on('disconnect', () => {
    console.log('Игрок отключился:', socket.id);
    for (const id in rooms) {
      if (rooms[id].players.includes(socket.id)) {
        socket.to(id).emit('opponent_left');
        delete rooms[id];
        break;
      }
    }
  });
});

function getDefaultBoard() {
    const r1 = ['r','n','b','q','k','b','n','r'];
    const R1 = ['R','N','B','Q','K','B','N','R'];
    let b = [];
    for(let i=0;i<8;i++) {
        if(i===0) b.push([...R1]);
        else if(i===1) b.push(Array(8).fill('P'));
        else if(i===6) b.push(Array(8).fill('p'));
        else if(i===7) b.push([...r1]);
        else b.push(Array(8).fill(null));
    }
    return b;
}

server.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});
