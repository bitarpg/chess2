const express = require('express');
const app = express();
const http = require('http');
const path = require('path');
const server = http.createServer(app);
const { Server } = require("socket.io");
const mqtt = require("mqtt");

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

const FILES = "ABCDEFGH";
const mqttState = {
    client: null,
    connected: false,
    boardId: process.env.MQTT_BOARD_ID || "board01",
    host: process.env.MQTT_HOST || "broker.mqttdashboard.com",
    port: Number(process.env.MQTT_PORT || 1883),
    username: process.env.MQTT_USER || "",
    password: process.env.MQTT_PASS || "",
    activeRoomId: null,
    physicalColor: null,
    seq: 0,
    pendingOutbound: new Set()
};

function getMqttPublicStatus(extra = {}) {
    return {
        connected: mqttState.connected,
        boardId: mqttState.boardId,
        host: mqttState.host,
        port: mqttState.port,
        activeRoomId: mqttState.activeRoomId,
        physicalColor: mqttState.physicalColor,
        ...extra
    };
}

function emitMqttStatus(extra = {}) {
    io.emit("mqtt_status", getMqttPublicStatus(extra));
}

function mqttTopic(suffix) {
    return `chess2/${mqttState.boardId}/${suffix}`;
}

function mqttPayload(type, fields = {}) {
    mqttState.seq += 1;
    return {
        type,
        board_id: mqttState.boardId,
        seq: mqttState.seq,
        ts: new Date().toISOString(),
        ...fields
    };
}

function publishMqtt(suffix, payload, retain = false) {
    if (!mqttState.client || !mqttState.connected) return false;
    mqttState.client.publish(mqttTopic(suffix), JSON.stringify(payload), { qos: 2, retain });
    return true;
}

function closeMqtt() {
    if (mqttState.client) mqttState.client.end(true);
    mqttState.client = null;
    mqttState.connected = false;
    mqttState.activeRoomId = null;
    mqttState.physicalColor = null;
    mqttState.pendingOutbound.clear();
    emitMqttStatus({ message: "MQTT disconnected" });
}

function openMqtt(config = {}) {
    closeMqtt();

    mqttState.boardId = String(config.boardId || process.env.MQTT_BOARD_ID || "board01").trim() || "board01";
    mqttState.host = String(config.host || process.env.MQTT_HOST || "broker.mqttdashboard.com").trim();
    mqttState.port = Number(config.port || process.env.MQTT_PORT || 1883);
    mqttState.username = String(config.username || process.env.MQTT_USER || "").trim();
    mqttState.password = String(config.password || process.env.MQTT_PASS || "");

    if (!mqttState.host || !Number.isInteger(mqttState.port)) {
        emitMqttStatus({ error: "Bad MQTT host or port" });
        return;
    }

    const options = {
        clientId: `chess2-render-${mqttState.boardId}-${Math.random().toString(16).slice(2)}`,
        clean: false,
        reconnectPeriod: 2000,
        connectTimeout: 10000
    };
    if (mqttState.username) {
        options.username = mqttState.username;
        options.password = mqttState.password;
    }

    const client = mqtt.connect(`mqtt://${mqttState.host}:${mqttState.port}`, options);
    mqttState.client = client;
    emitMqttStatus({ message: "MQTT connecting" });

    client.on("connect", () => {
        mqttState.connected = true;
        client.subscribe([
            mqttTopic("client/event"),
            mqttTopic("player/event"),
            mqttTopic("state")
        ], { qos: 2 });
        emitMqttStatus({ message: "MQTT connected" });
        publishMqtt("client/cmd", mqttPayload("request_state"));
    });

    client.on("reconnect", () => emitMqttStatus({ message: "MQTT reconnecting" }));
    client.on("close", () => {
        mqttState.connected = false;
        emitMqttStatus({ message: "MQTT closed" });
    });
    client.on("error", err => emitMqttStatus({ error: err.message }));
    client.on("message", (topic, message) => {
        let payload;
        try {
            payload = JSON.parse(message.toString("utf8"));
        } catch (err) {
            emitMqttStatus({ error: `Bad MQTT JSON: ${err.message}` });
            return;
        }
        handleMqttMessage(topic, payload);
    });
}

function squareToCell(square) {
    if (typeof square !== "string" || square.length < 2) return null;
    const file = FILES.indexOf(square[0].toUpperCase());
    const rank = Number(square[1]);
    if (file < 0 || rank < 1 || rank > 8) return null;
    return { r: 8 - rank, c: file };
}

function cellToSquare(cell) {
    if (!cell || cell.r < 0 || cell.r > 7 || cell.c < 0 || cell.c > 7) return null;
    return `${FILES[cell.c]}${8 - cell.r}`;
}

function moveToUci(move) {
    if (!move || !move.from || !move.to) return null;
    const from = cellToSquare(move.from);
    const to = cellToSquare(move.to);
    if (!from || !to) return null;
    return `${from}${to}`.toUpperCase();
}

function uciToMove(uci) {
    const text = String(uci || "").trim().toUpperCase();
    if (!/^[A-H][1-8][A-H][1-8][QRBN]?$/.test(text)) return null;
    const from = squareToCell(text.slice(0, 2));
    const to = squareToCell(text.slice(2, 4));
    if (!from || !to) return null;
    return { from, to, promotion: text[4] ? text[4].toLowerCase() : null };
}

function oppositeColor(color) {
    return color === "white" ? "black" : "white";
}

function pieceColor(piece) {
    if (!piece) return null;
    const type = typeof piece === "object" ? piece.type : piece;
    return type === type.toUpperCase() ? "black" : "white";
}

function pieceType(piece) {
    if (!piece) return null;
    const type = typeof piece === "object" ? piece.type : piece;
    return type.toLowerCase();
}

function clonePiece(piece) {
    if (!piece || typeof piece !== "object") return piece;
    return { ...piece };
}

function cloneBoard(board) {
    return board.map(row => row.map(clonePiece));
}

function getDefaultCastling() {
    return {
        white: { k: true, l: true, r: true },
        black: { k: true, l: true, r: true }
    };
}

function updateCastlingState(castlingState, move, piece, captured) {
    const castling = castlingState || getDefaultCastling();
    const color = pieceColor(piece);
    const type = pieceType(piece);
    if (!color) return castling;

    if (type === "k") {
        castling[color].k = false;
        castling[color].l = false;
        castling[color].r = false;
    }

    if (type === "r") {
        const homeRow = color === "white" ? 7 : 0;
        if (move.from.r === homeRow && move.from.c === 0) castling[color].l = false;
        if (move.from.r === homeRow && move.from.c === 7) castling[color].r = false;
    }

    if (captured && pieceType(captured) === "r") {
        const capturedColor = pieceColor(captured);
        const homeRow = capturedColor === "white" ? 7 : 0;
        if (move.to.r === homeRow && move.to.c === 0) castling[capturedColor].l = false;
        if (move.to.r === homeRow && move.to.c === 7) castling[capturedColor].r = false;
    }

    return castling;
}

function applyUciMoveToBoard(board, uci, castlingState) {
    const move = uciToMove(uci);
    if (!move) return null;

    const nextBoard = cloneBoard(board);
    const piece = nextBoard[move.from.r][move.from.c];
    if (!piece) return null;

    const captured = nextBoard[move.to.r][move.to.c];
    const color = pieceColor(piece);
    const type = pieceType(piece);
    const castling = updateCastlingState(castlingState, move, piece, captured);

    if (type === "p" && move.from.c !== move.to.c && !captured) {
        nextBoard[move.from.r][move.to.c] = null;
    }

    let placedPiece = piece;
    if (move.promotion) {
        placedPiece = color === "white" ? move.promotion : move.promotion.toUpperCase();
    }

    nextBoard[move.to.r][move.to.c] = placedPiece;
    nextBoard[move.from.r][move.from.c] = null;

    if (type === "k" && Math.abs(move.to.c - move.from.c) === 2) {
        const row = move.from.r;
        if (move.to.c === 6) {
            nextBoard[row][5] = nextBoard[row][7];
            nextBoard[row][7] = null;
        } else if (move.to.c === 2) {
            nextBoard[row][3] = nextBoard[row][0];
            nextBoard[row][0] = null;
        }
    }

    return {
        board: nextBoard,
        turn: oppositeColor(color),
        lastMove: { from: move.from, to: move.to },
        castling
    };
}

function isClassicBoard(board) {
    const allowed = new Set(["p", "n", "b", "r", "q", "k"]);
    return board.every(row => row.every(piece => !piece || allowed.has(pieceType(piece))));
}

function handleMqttMessage(topic, payload) {
    io.emit("mqtt_board_event", { topic, payload });

    if (payload.type !== "move" || !payload.move) return;

    const uci = String(payload.move).toUpperCase();
    if (mqttState.pendingOutbound.has(uci)) {
        mqttState.pendingOutbound.delete(uci);
        return;
    }
    if (payload.source === "remote") return;

    const room = rooms[mqttState.activeRoomId];
    if (!room || !room.physical) return;

    const applied = applyUciMoveToBoard(room.board || getDefaultBoard(), uci, room.castling);
    if (!applied) {
        emitMqttStatus({ error: `Cannot apply board move ${uci}` });
        return;
    }

    const mover = oppositeColor(applied.turn);
    if (room.physicalColor && mover !== room.physicalColor) return;

    room.board = applied.board;
    room.turn = applied.turn;
    room.castling = applied.castling;
    room.moveCount = (room.moveCount || 0) + 1;

    io.in(room.id).emit("receive_move", {
        board: room.board,
        turn: room.turn,
        lastMove: applied.lastMove,
        castling: room.castling,
        mode: room.gameMode,
        moveCount: room.moveCount,
        chimeraTracker: room.chimeraTracker,
        newModePlayer: room.newModePlayer,
        whiteRevived: room.whiteRevived,
        blackRevived: room.blackRevived
    });
}

/**
 * Функция рассылки списка доступных комнат.
 * Свободной считается комната, где ровно 1 участник.
 */
function broadcastRoomList() {
    const list = [];
    for (const [id, room] of Object.entries(rooms)) {
        if (!room.physical && room.players.length === 1) {
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
    socket.emit("mqtt_status", getMqttPublicStatus());

    socket.on("mqtt_connect", (config = {}) => {
        openMqtt(config);
    });

    socket.on("mqtt_disconnect", () => {
        closeMqtt();
    });

    socket.on("mqtt_start_board_game", (data = {}) => {
        if (!mqttState.connected) {
            socket.emit("mqtt_status", getMqttPublicStatus({ error: "MQTT is not connected" }));
            return;
        }

        const physicalColor = data.physicalColor === "black" ? "black" : "white";
        const playerColor = oppositeColor(physicalColor);
        const roomId = `BRD-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

        if (mqttState.activeRoomId && rooms[mqttState.activeRoomId]) {
            delete rooms[mqttState.activeRoomId];
        }

        rooms[roomId] = {
            id: roomId,
            players: [socket.id],
            board: getDefaultBoard(),
            turn: "white",
            castling: getDefaultCastling(),
            chimeraTracker: {},
            gameMode: "classic",
            newModePlayer: null,
            whiteRevived: false,
            blackRevived: false,
            moveCount: 0,
            physical: true,
            physicalColor
        };

        mqttState.activeRoomId = roomId;
        mqttState.physicalColor = physicalColor;
        mqttState.pendingOutbound.clear();
        socket.join(roomId);

        socket.emit("game_start", {
            roomId,
            color: playerColor,
            board: rooms[roomId].board,
            turn: rooms[roomId].turn,
            castling: rooms[roomId].castling,
            physicalBoard: true,
            physicalColor
        });

        publishMqtt(
            "client/cmd",
            mqttPayload("cmd", { cmd: `START_GAME:${physicalColor.toUpperCase()}`, origin: "render-site" })
        );
        emitMqttStatus({ message: `Board game started: board is ${physicalColor}` });
        broadcastRoomList();
    });

    // --- СОЗДАНИЕ НОВОЙ КОМНАТЫ ---
    socket.on('create_room', (roomId) => {
        if (rooms[roomId]) {
            socket.emit('error_msg', 'Ошибка: Комната с таким ID уже занята!');
            return;
        }

        // Инициализируем объект комнаты со всеми необходимыми полями для синхронизации
        rooms[roomId] = {
            id: roomId,
            players: [socket.id],
            board: null,
            turn: 'white',
            castling: getDefaultCastling(),
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
            turn: 'white',
            castling: rooms[roomId].castling
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
            turn: room.turn,
            castling: room.castling
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
            room.moveCount = moveCount;

            if (room.physical) {
                const mover = oppositeColor(turn);
                const uci = moveToUci(lastMove);

                if (mode !== "classic" || !isClassicBoard(board)) {
                    socket.emit("error_msg", "MQTT-доска поддерживает только классический режим.");
                    return;
                }

                if (!uci) {
                    socket.emit("error_msg", "Не удалось преобразовать ход для MQTT.");
                    return;
                }

                if (mover !== room.physicalColor) {
                    mqttState.pendingOutbound.add(uci);
                    publishMqtt("player/cmd", mqttPayload("move", { move: uci, origin: "render-site" }));
                }
            }

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
                if (rooms[id].physical && mqttState.activeRoomId === id) {
                    publishMqtt(
                        "client/cmd",
                        mqttPayload("cmd", { cmd: "STOP_GAME", origin: "render-site" })
                    );
                    mqttState.activeRoomId = null;
                    mqttState.physicalColor = null;
                    mqttState.pendingOutbound.clear();
                    emitMqttStatus({ message: "Board game stopped" });
                }
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
