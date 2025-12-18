// ======================================================
// ONLINE.JS — сетевое взаимодействие Chess 2.0
// ======================================================

// Глобальные переменные онлайн-режима
window.gameReady = false;

window.socket = null;
window.currentRoomId = null;
window.myOnlineColor = null; // 'white' или 'black'
window.isConnected = false;


// ======================================================
// ПОДКЛЮЧЕНИЕ К СЕРВЕРУ
// ======================================================

window.connectToServer = function () {
    // На Render или других хостингах используем текущий домен
    const serverUrl = window.location.origin;

    const btn = document.getElementById("btn-connect");
    if (btn) {
        btn.innerText = "Подключение...";
        btn.disabled = true;
    }

    // Инициализация socket.io
    window.socket = io(serverUrl);

    window.socket.on("connect", () => {
        window.isConnected = true;

        const os = document.getElementById("online-status");
        if (os) {
            os.innerText = "СЕРВЕР: ПОДКЛЮЧЕН";
            os.classList.remove("text-gray-500");
            os.classList.add("text-emerald-400");
        }

        if (btn) btn.innerText = "OK";

        const connPanel = document.getElementById("connection-panel");
        if (connPanel) connPanel.classList.add("hidden");

        const lobby = document.getElementById("lobby-panel");
        if (lobby) lobby.classList.remove("hidden");

        log("Успешное подключение к серверу.");
    });

    window.socket.on("connect_error", (err) => {
        console.error("Ошибка подключения:", err);
        if (btn) {
            btn.innerText = "Ошибка";
            btn.disabled = false;
        }
    });

    setupSocketListeners();
};


// ======================================================
// СОКЕТ-СЛУШАТЕЛИ
// ======================================================

window.setupSocketListeners = function () {
    if (!window.socket) return;

    // ПУНКТ №2: Список доступных комнат
    window.socket.on("room_list", rooms => {
        const listEl = document.getElementById("room-list-container");
        if (!listEl) return;

        listEl.innerHTML = "";

        if (rooms.length === 0) {
            listEl.innerHTML = '<div class="text-gray-500 text-[10px] italic">Нет свободных комнат</div>';
            return;
        }

        rooms.forEach(room => {
            const roomBtn = document.createElement("button");
            roomBtn.className = "w-full text-left bg-slate-800 hover:bg-slate-700 border border-slate-600 p-2 mb-1 rounded text-xs flex justify-between items-center group transition-all";

            roomBtn.onclick = () => {
                const input = document.getElementById("room-input");
                if (input) input.value = room.id;
                window.joinGame();
            };

            roomBtn.innerHTML = `
                <span class="text-blue-400 font-mono font-bold group-hover:text-blue-300">#${room.id}</span>
                <span class="text-gray-400 text-[9px]">Игроков: ${room.count}/2</span>
            `;

            listEl.appendChild(roomBtn);
        });
    });

    window.socket.on("player_joined", data => {
        log(`Противник вошел в комнату: ${data.roomId}`);
        const msg = document.getElementById("online-msg");
        if (msg) msg.innerText = "Противник в игре! Начинаем...";
    });

    window.socket.on("game_start", data => {
        window.myOnlineColor = data.color;
        window.currentRoomId = data.roomId;
        window.moveCount = 0;

        // Синхронизируем состояние
        window.syncBoardFromOnline(data.board, data.turn, data.castling);

        // ПУНКТ №3: Переворот доски для черного игрока
        if (window.setBoardFlip) {
            window.setBoardFlip(window.myOnlineColor === 'black');
        }

        enterOnlineMode(
            data.roomId,
            `Цвет: ${window.myOnlineColor === 'white' ? 'БЕЛЫЕ' : 'ЧЕРНЫЕ'}`
        );

        log(`Битва началась! Вы играете за ${window.myOnlineColor === 'white' ? 'БЕЛЫХ' : 'ЧЕРНЫХ'}`);
    });

    window.socket.on("receive_move", data => {
        if (typeof data.moveCount !== "undefined") {
            window.moveCount = data.moveCount;
        }

        // Синхронизация режима (например, Воскрешение)
        if (data.mode && window.gameMode !== data.mode) {
            window.gameMode = data.mode;
            if (data.mode === "new_mode") {
                window.kingDead = true;
                window.newModePlayer = data.newModePlayer || data.turn;
            }
        }

        // ПУНКТ №4: Обработка предложения союза (Химера) в онлайне
        if (data.lastMove && data.lastMove.proposal) {
            // Если ход не наш — показываем окно дипломатии
            if (window.myOnlineColor !== data.turn) {
                window.pendingMove = {
                    from: data.lastMove.from,
                    to: data.lastMove.to,
                    attackerColor: window.getCol(data.board[data.lastMove.to.r][data.lastMove.to.c])
                };

                // Подсвечиваем фигуру агрессора для наглядности
                window.selected = data.lastMove.from;

                window.render();
                document.getElementById("dip-modal").classList.add("active");
                log("ПОЛУЧЕНО ПРЕДЛОЖЕНИЕ СОЮЗА!");
            } else {
                log("Предложение союза передано оппоненту...");
                // Очищаем выделение у отправителя, чтобы не мешало
                window.selected = null;
                window.moves = [];
                window.render();
            }
        }
        else {
            // Обычный ход — полная синхронизация
            document.getElementById("dip-modal").classList.remove("active");

            window.syncBoardFromOnline(
                data.board,
                data.turn,
                data.castling,
                data.chimeraTracker
            );

            window.lastMoveData = data.lastMove || null;

            window.render();
            window.updateUI();
            window.checkGameState();
        }
    });

    window.socket.on("error_msg", msg => {
        log(`Ошибка: ${msg}`);
    });

    window.socket.on("opponent_left", () => {
        log("ВНИМАНИЕ: Соперник покинул игру.");
        setTimeout(() => location.reload(), 3000);
    });
};


// ======================================================
// УПРАВЛЕНИЕ ИГРОЙ ЧЕРЕЗ СЕТЬ
// ======================================================

window.hostGame = function () {
    if (!window.isConnected) return log("Ошибка: Нет связи с сервером.");
    const roomId = Math.random().toString(36).substring(2, 7).toUpperCase();
    window.socket.emit("create_room", roomId);
    enterOnlineMode(roomId, "Ожидание соперника...");
};

window.joinGame = function () {
    if (!window.isConnected) return log("Ошибка: Нет связи с сервером.");
    const input = document.getElementById("room-input");
    const roomId = input ? input.value.toUpperCase() : "";

    if (!roomId) return log("Ошибка: Введите ID комнаты.");
    window.socket.emit("join_room", roomId);
};

window.enterOnlineMode = function (id, status) {
    const lobby = document.getElementById("lobby-panel");
    const activeUI = document.getElementById("online-active-ui");

    if (lobby) lobby.classList.add("hidden");
    if (activeUI) activeUI.classList.remove("hidden");

    const rd = document.getElementById("room-display");
    const om = document.getElementById("online-msg");

    if (rd) rd.innerText = id;
    if (om) om.innerText = status;
};


// ======================================================
// ОТПРАВКА ДАННЫХ В СЕТЬ
// ======================================================

window.sendMoveToCloud = function (
    boardState,
    nextTurn,
    moveDetails,
    castlingState,
    modeState,
    mCount
) {
    if (!window.socket || !window.currentRoomId) return;

    window.socket.emit("make_move", {
        roomId: window.currentRoomId,
        board: boardState,
        turn: nextTurn,
        lastMove: moveDetails,
        castling: castlingState,
        mode: modeState || window.gameMode,
        moveCount: mCount,
        chimeraTracker: window.chimeraTracker,
        newModePlayer: window.newModePlayer
    });
};


// ======================================================
// ГЕТТЕРЫ И СТАТУС
// ======================================================

window.getOnlineColor = () => window.myOnlineColor;

window.isOnlineActive = function () {
    return window.isConnected === true && window.currentRoomId !== null;
};