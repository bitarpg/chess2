const express = require('express');
const app = express();
const http = require('http');
const path = require('path');
const server = http.createServer(app);
const { Server } = require("socket.io");

// ==========================================
// РАЗДАЧА СТАТИЧЕСКИХ ФАЙЛОВ
// ==========================================

// Обслуживание файлов из корня и вложенных папок (js, css)
// Это позволяет Render корректно отображать ваш index.html и подключать скрипты
app.use(express.static(path.join(__dirname, './')));

// Главный маршрут: при заходе на домен отправляем index.html
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

// На Render порт назначается динамически через process.env.PORT
const PORT = process.env.PORT || 3000;

// Глобальное хранилище игровых комнат
let rooms = {};

/**
 * Функция рассылки списка доступных комнат.
 * Свободной считается комната, где ровно 1 участник.
 */
function broadcastRoomList() {
    const list = [];
    for (const [id, room] of Object.entries(rooms)) {
        if (room.players.length === 1) {
            list.push({ id: id, count: room.players.length });
        }
    }
    // Отправляем всем подключенным клиентам
    io.emit('room_list', list);
}

io.on('connection', (socket) => {
    console.log('Пользователь подключился к сокету:', socket.id);

    // Сразу при подключении отправляем актуальный список комнат
    broadcastRoomList();

    // --- СОЗДАНИЕ НОВОЙ КОМНАТЫ ---
    socket.on('create_room', (roomId) => {
        if (rooms[roomId]) {
            socket.emit('error_msg', 'Ошибка: Комната с таким ID уже занята!');
            return;
        }

        // Инициализируем объект комнаты со всеми необходимыми полями для синхронизации
        rooms[roomId] = {
            players: [socket.id],
            board: null,
            turn: 'white',
            castling: null,
            chimeraTracker: {},
            gameMode: 'classic',
            newModePlayer: null,
            whiteRevived: false,
            blackRevived: false
        };

        socket.join(roomId);

        // Отправляем создателю подтверждение и начальные данные
        socket.emit('game_start', {
            roomId: roomId,
            color: 'white',
            board: getDefaultBoard(),
            turn: 'white'
        });

        console.log(`Комната #${roomId} создана игроком ${socket.id}`);
        broadcastRoomList(); // Обновляем лобби для остальных
    });

    // --- ВХОД В СУЩЕСТВУЮЩУЮ КОМНАТУ ---
    socket.on('join_room', (roomId) => {
        const room = rooms[roomId];

        if (!room) {
            socket.emit('error_msg', 'Ошибка: Комната не существует!');
            return;
        }
        if (room.players.length >= 2) {
            socket.emit('error_msg', 'Ошибка: В комнате уже двое игроков!');
            return;
        }

        room.players.push(socket.id);
        socket.join(roomId);

        // Уведомляем Хоста, что соперник зашел
        io.to(room.players[0]).emit('player_joined', { roomId });

        // Отправляем Второму игроку (Черные) состояние игры
        socket.emit('game_start', {
            roomId: roomId,
            color: 'black',
            board: room.board || getDefaultBoard(),
            turn: room.turn
        });

        console.log(`Игрок ${socket.id} присоединился к комнате #${roomId}`);
        broadcastRoomList(); // Комната теперь полная, убираем из списка доступных
    });

    // --- ПЕРЕДАЧА И СИНХРОНИЗАЦИЯ ХОДА (ОБНОВЛЕНО ДЛЯ ПУНКТОВ 1-2) ---
    socket.on('make_move', (data) => {
        const {
            roomId,
            board,
            turn,
            lastMove,
            castling,
            mode,
            moveCount,
            chimeraTracker,
            newModePlayer,
            whiteRevived,
            blackRevived
        } = data;

        const room = rooms[roomId];

        if (room) {
            // Сохраняем состояние на стороне сервера
            room.board = board;
            room.turn = turn;
            room.castling = castling;
            room.chimeraTracker = chimeraTracker;
            room.gameMode = mode;
            room.newModePlayer = newModePlayer;
            room.whiteRevived = whiteRevived;
            room.blackRevived = blackRevived;

            // Транслируем ПОЛНЫЙ пакет данных всем участникам комнаты.
            // Это гарантирует, что флаги Revived и newModePlayer будут идентичны у обоих.
            io.in(roomId).emit('receive_move', {
                board: board,
                turn: turn,
                lastMove: lastMove,
                castling: castling,
                mode: mode,
                moveCount: moveCount,
                chimeraTracker: chimeraTracker,
                newModePlayer: newModePlayer,
                whiteRevived: whiteRevived,
                blackRevived: blackRevived
            });

            console.log(`Синхронизация хода в комнате ${roomId}. Очередь: ${turn}. Режим: ${mode}`);
        }
    });

    // --- ОБРАБОТКА ВЫХОДА ---
    socket.on('disconnect', () => {
        console.log('Пользователь покинул сеть:', socket.id);
        for (const id in rooms) {
            if (rooms[id].players.includes(socket.id)) {
                // Уведомляем оппонента о техническом поражении игрока
                socket.to(id).emit('opponent_left');
                // Удаляем комнату, чтобы освободить память и ID
                delete rooms[id];
                break;
            }
        }
        broadcastRoomList();
    });
});

/**
 * Вспомогательная функция для генерации стартовой позиции.
 */
function getDefaultBoard() {
    const r1 = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r']; // Белые фигуры (нижний регистр)
    const R1 = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R']; // Черные фигуры (верхний регистр)
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

// Запуск сервера
server.listen(PORT, () => {
    console.log(`[OK] Игровой сервер запущен на порту ${PORT}`);
    console.log(`[LOG] Статические файлы обслуживаются из текущего каталога.`);
});