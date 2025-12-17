const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");

// Настройка CORS
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = 3000;

// Хранилище игровых комнат
let rooms = {};

// Функция рассылки списка комнат всем
function broadcastRoomList() {
    const list = [];
    for (const [id, room] of Object.entries(rooms)) {
        // Показываем только комнаты, где есть место (меньше 2 игроков)
        if (room.players.length < 2) {
            list.push({ id: id, count: room.players.length });
        }
    }
    io.emit('room_list', list);
}

io.on('connection', (socket) => {
  console.log('Новое подключение:', socket.id);
  
  // Сразу отправляем список комнат новому игроку
  broadcastRoomList();

  // Создание комнаты
  socket.on('create_room', (roomId) => {
    if (rooms[roomId]) {
      socket.emit('error_msg', 'Комната уже существует!');
      return;
    }
    
    rooms[roomId] = {
      players: [socket.id],
      board: null,
      turn: 'white',
      mode: 'classic' // Храним режим игры
    };
    
    socket.join(roomId);
    
    socket.emit('game_start', { 
        roomId: roomId, 
        color: 'white',
        board: getDefaultBoard(),
        turn: 'white',
        mode: 'classic'
    });
    
    console.log(`Комната ${roomId} создана игроком ${socket.id}`);
    broadcastRoomList(); // Обновляем список у всех
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

    // Уведомляем создателя
    io.to(room.players[0]).emit('player_joined', { roomId });

    // Запускаем игру для вошедшего (Черные)
    socket.emit('game_start', { 
        roomId: roomId, 
        color: 'black',
        board: room.board || getDefaultBoard(),
        turn: room.turn,
        mode: room.mode || 'classic'
    });

    console.log(`Игрок ${socket.id} вошел в ${roomId}`);
    broadcastRoomList(); // Комната заполнилась, обновляем список
  });

  // Ход
  socket.on('make_move', (data) => {
    const { roomId, board, turn, lastMove, mode } = data;
    const room = rooms[roomId];
    
    if (room) {
      room.board = board;
      room.turn = turn;
      if (mode) room.mode = mode; // Обновляем режим на сервере

      io.in(roomId).emit('receive_move', {
        board: board,
        turn: turn,
        lastMove: lastMove,
        mode: mode
      });
    }
  });

  // Отключение
  socket.on('disconnect', () => {
    console.log('Игрок отключился:', socket.id);
    for (const id in rooms) {
        const room = rooms[id];
        const index = room.players.indexOf(socket.id);
        if (index !== -1) {
            room.players.splice(index, 1); // Удаляем игрока из списка
            
            // Если в комнате никого не осталось - удаляем комнату
            if (room.players.length === 0) {
                delete rooms[id];
            } else {
                // Если кто-то остался, уведомляем его
                socket.to(id).emit('opponent_left');
                // Можно также удалить комнату, чтобы не висела "сломанная" игра
                delete rooms[id]; 
            }
            break;
        }
    }
    broadcastRoomList(); // Обновляем список
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