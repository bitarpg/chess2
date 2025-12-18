// ======================================================
// ONLINE.JS — сетевое взаимодействие Chess 2.0 (ПОЛНАЯ ВЕРСИЯ)
// ======================================================

// Глобальные переменные сетевого состояния
window.gameReady = false;
window.socket = null;
window.currentRoomId = null;
window.myOnlineColor = null;
window.isConnected = false;


// ======================================================
// ПОДКЛЮЧЕНИЕ К СЕРВЕРУ
// ======================================================

window.connectToServer = function () {
    // На Render и других хостингах window.location.origin дает правильный адрес
    const serverUrl = window.location.origin;

    const btn = document.getElementById("btn-connect");
    if (btn) {
        btn.innerText = "Подключение...";
        btn.disabled = true;
    }

    // Инициализация socket.io
    window.socket = io(serverUrl);

    // Событие успешного соединения
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

        window.log("Система: Связь с сервером установлена успешно.");
    });

    // Ошибка подключения
    window.socket.on("connect_error", (err) => {
        console.error("Socket Error:", err);
        if (btn) {
            btn.innerText = "Ошибка";
            btn.disabled = false;
        }
        window.log("Ошибка: Не удалось связаться с игровым сервером.");
    });

    // Инициализируем слушателей событий
    window.setupSocketListeners();
};


// ======================================================
// СОКЕТ-СЛУШАТЕЛИ (ОБРАБОТКА СОБЫТИЙ СЕТИ)
// ======================================================

window.setupSocketListeners = function () {
    if (!window.socket) return;

    // ПУНКТ №2: Обновление списка доступных комнат
    window.socket.on("room_list", rooms => {
        const listEl = document.getElementById("room-list-container");
        if (!listEl) return;

        listEl.innerHTML = ""; // Очистка списка

        if (rooms.length === 0) {
            listEl.innerHTML = '<div class="text-gray-500 text-[10px] italic p-1">Нет активных комнат</div>';
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
                <span class="text-gray-500 text-[9px]">Игроков: ${room.count}/2</span>
            `;

            listEl.appendChild(roomBtn);
        });
    });

    // Уведомление о входе соперника
    window.socket.on("player_joined", data => {
        window.log(`Событие: Противник вошел в комнату ${data.roomId}`);
        const msg = document.getElementById("online-msg");
        if (msg) msg.innerText = "Противник на месте! Битва начинается...";
    });

    // Начало игры и распределение цветов
    window.socket.on("game_start", data => {
        window.myOnlineColor = data.color;
        window.currentRoomId = data.roomId;
        window.moveCount = 0;

        // Полная синхронизация состояния доски
        window.syncBoardFromOnline(data.board, data.turn, data.castling);

        // ПУНКТ №3: Автоматический переворот доски для черных
        if (window.setBoardFlip) {
            window.setBoardFlip(window.myOnlineColor === 'black');
        }

        window.enterOnlineMode(
            data.roomId,
            `ВАШ ЦВЕТ: ${window.myOnlineColor === 'white' ? 'БЕЛЫЕ' : 'ЧЕРНЫЕ'}`
        );

        window.log(`Игра началась! Вы командуете ${window.myOnlineColor === 'white' ? 'белыми' : 'черными'} силами.`);
    });

    // ПЕРЕДАЧА ХОДА И СИНХРОНИЗАЦИЯ СОСТОЯНИЯ
    window.socket.on("receive_move", data => {
        // 1. Синхронизация общих счетчиков
        if (typeof data.moveCount !== "undefined") {
            window.moveCount = data.moveCount;
        }

        // 2. СИНХРОНИЗАЦИЯ РЕЖИМА И ФЛАГОВ ВОЗРОЖДЕНИЯ (Исправление рассинхрона)
        const oldMode = window.gameMode;
        if (data.mode) window.gameMode = data.mode;
        if (data.whiteRevived !== undefined) window.whiteRevived = data.whiteRevived;
        if (data.blackRevived !== undefined) window.blackRevived = data.blackRevived;

        if (window.gameMode === "new_mode") {
            window.kingDead = true;
            window.newModePlayer = data.newModePlayer || window.newModePlayer;

            // ИСПРАВЛЕНИЕ: Выводим в лог только один раз при смене режима, чтобы не спамить каждый ход
            if (oldMode !== "new_mode") {
                window.log("Синхронизация: Активен НОВЫЙ РЕЖИМ (Воскрешение).");
            }
        }

        // 3. ПРОВЕРКА НА ПРЕДЛОЖЕНИЕ СОЮЗА (ХИМЕРА)
        if (data.lastMove && data.lastMove.proposal) {
            if (window.myOnlineColor !== data.turn) {
                window.pendingMove = {
                    from: data.lastMove.from,
                    to: data.lastMove.to,
                    attackerColor: window.getCol(data.board[data.lastMove.to.r][data.lastMove.to.c])
                };
                window.selected = data.lastMove.from;
                window.render();
                const dipModal = document.getElementById("dip-modal");
                if (dipModal) dipModal.classList.add("active");
                window.log("ДИПЛОМАТИЯ: Получено предложение союза!");
            } else {
                window.log("Система: Ожидание ответа по дипломатии...");
                window.selected = null;
                window.moves = [];
                window.render();
            }
        }
        else {
            // 4. ОБЫЧНЫЙ ХОД — полная синхронизация данных
            const dipModal = document.getElementById("dip-modal");
            if (dipModal) dipModal.classList.remove("active");

            // Синхронизируем массив доски и состояние рокировок
            window.syncBoardFromOnline(
                data.board,
                data.turn,
                data.castling,
                data.chimeraTracker
            );

            window.lastMoveData = data.lastMove || null;

            // Обновляем визуальную часть и интерфейс
            window.render();
            if (window.updateUI) window.updateUI();

            // Проверяем состояние игры (мат/пат) с новыми данными
            if (window.checkGameState) window.checkGameState();
        }
    });

    // Ошибки от сервера
    window.socket.on("error_msg", msg => {
        window.log(`Ошибка сервера: ${msg}`);
    });

    // Выход соперника
    window.socket.on("opponent_left", () => {
        window.log("ВНИМАНИЕ: Соперник покинул поле боя. Перезагрузка...");
        setTimeout(() => location.reload(), 3000);
    });
};


// ======================================================
// УПРАВЛЕНИЕ КОМНАТАМИ
// ======================================================

window.hostGame = function () {
    if (!window.isConnected) return window.log("Ошибка: Нет связи с сервером!");

    const roomId = Math.random().toString(36).substring(2, 7).toUpperCase();
    window.socket.emit("create_room", roomId);

    window.enterOnlineMode(roomId, "Ожидание противника...");
};

window.joinGame = function () {
    if (!window.isConnected) return window.log("Ошибка: Нет связи с сервером!");

    const input = document.getElementById("room-input");
    const roomId = input ? input.value.toUpperCase() : "";

    if (!roomId) return window.log("Ошибка: Введите ID комнаты.");

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
// ОТПРАВКА ХОДА В ОБЛАКО (ОБНОВЛЕНО: ПОЛНЫЙ ПАКЕТ ДАННЫХ)
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

    // ОТПРАВЛЯЕМ ПОЛНЫЙ ПАКЕТ: чтобы у второго игрока движок работал по тем же правилам
    window.socket.emit("make_move", {
        roomId: window.currentRoomId,
        board: boardState,
        turn: nextTurn,
        lastMove: moveDetails,
        castling: castlingState,
        mode: modeState || window.gameMode,
        moveCount: mCount,
        chimeraTracker: window.chimeraTracker,

        // Флаги состояния (чтобы оппонент знал о воскрешении и смене цели мата)
        newModePlayer: window.newModePlayer,
        whiteRevived: window.whiteRevived,
        blackRevived: window.blackRevived
    });
};


// ======================================================
// ГЕТТЕРЫ И ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ======================================================

window.getOnlineColor = () => window.myOnlineColor;

window.isOnlineActive = function () {
    return window.isConnected === true && window.currentRoomId !== null;
};