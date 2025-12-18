const express = require('express');
const app = express();
const http = require('http');
const path = require('path');
const server = http.createServer(app);
const { Server } = require("socket.io");

// ==========================================
// РАЗДАЧА СТАТИЧЕСКИХ ФАЙЛОВ
// ==========================================

// Обслуживание файлов из корня и папок (js, css)
app.use(express.static(path.join(__dirname, './')));

// Главный маршрут для загрузки игры
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

// Render сам подставит PORT через окружение, 3000 - для локалки
const PORT = process.env.PORT || 3000;

// Хранилище игровых комнат
let rooms = {};

/**
 * Рассылает актуальный список доступных комнат всем подключенным игрокам.
 * Свободной считается комната, где ровно 1 игрок.
 */
function broadcastRoomList() {
    const list = [];
    for (const [id, room] of Object.entries(rooms)) {
        if (room.players.length === 1) {
            list.push({ id: id, count: room.players.length });
        }
    }
    io.emit('room_list', list);
}

io.on('connection', (socket) => {
    console.log('Новый пользователь подключился:', socket.id);

    // Сразу отправляем список комнат при входе
    broadcastRoomList();

    // СОЗДАНИЕ КОМНАТЫ
    socket.on('create_room', (roomId) => {
        if (rooms[roomId]) {
            socket.emit('error_msg', 'Ошибка: Комната с таким ID уже существует!');
            return;
        }

        rooms[roomId] = {
            players: [socket.id],
            board: null,
            turn: 'white',
            castling: null,
            chimeraTracker: {}
        };

        socket.join(roomId);

        socket.emit('game_start', {
            roomId: roomId,
            color: 'white',
            board: getDefaultBoard(),
            turn: 'white'
        });

        console.log(`Игрок ${socket.id} создал комнату ${roomId}`);
        broadcastRoomList();
    });

    // ВХОД В КОМНАТУ
    socket.on('join_room', (roomId) => {
        const room = rooms[roomId];

        if (!room) {
            socket.emit('error_msg', 'Ошибка: Комната не найдена!');
            return;
        }
        if (room.players.length >= 2) {
            socket.emit('error_msg', 'Ошибка: Комната уже заполнена!');
            return;
        }

        room.players.push(socket.id);
        socket.join(roomId);

        // Уведомляем первого игрока
        io.to(room.players[0]).emit('player_joined', { roomId });

        // Отправляем данные второму игроку
        socket.emit('game_start', {
            roomId: roomId,
            color: 'black',
            board: room.board || getDefaultBoard(),
            turn: room.turn
        });

        console.log(`Игрок ${socket.id} вошел в комнату ${roomId}`);
        broadcastRoomList();
    });

    // ПЕРЕДАЧА ХОДА
    socket.on('make_move', (data) => {
        const { roomId, board, turn, lastMove, castling, mode, moveCount, chimeraTracker } = data;
        const room = rooms[roomId];

        if (room) {
            room.board = board;
            room.turn = turn;
            room.castling = castling;
            room.chimeraTracker = chimeraTracker;

            // Транслируем ход всем участникам комнаты
            io.in(roomId).emit('receive_move', {
                board: board,
                turn: turn,
                lastMove: lastMove,
                castling: castling,
                mode: mode,
                moveCount: moveCount,
                chimeraTracker: chimeraTracker
            });
            console.log(`Ход в комнате ${roomId}. Очередь: ${turn}`);
        }
    });

    // ОТКЛЮЧЕНИЕ
    socket.on('disconnect', () => {
        console.log('Пользователь отключился:', socket.id);
        for (const id in rooms) {
            if (rooms[id].players.includes(socket.id)) {
                socket.to(id).emit('opponent_left');
                delete rooms[id]; // Удаляем комнату, если один из игроков вышел
                break;
            }
        }
        broadcastRoomList();
    });
});

/**
 * Стандартная расстановка фигур
 */
function getDefaultBoard() {
    const r1 = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
    const R1 = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];
    let b = [];
    for (let i = 0; i < 8; i++) {
        if (i === 0) b.push([...R1]);
        else if (i === 1) b.push(Array(8).fill('P'));
        else if (i === 6) b.push(Array(8).fill('p'));
        else if (i === 7) b.push([...r1]);
        else b.push(Array(8).fill(null));
    }
    return b;
}

server.listen(PORT, () => {
    console.log(`Сервер активен на порту ${PORT}`);
});