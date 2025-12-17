// ======================================================
// ONLINE.JS — сетевое взаимодействие Chess 2.0
// ======================================================

// Глобальные переменные онлайн-режима
window.gameReady = false;

window.socket = null;
window.currentRoomId = null;
window.myOnlineColor = null;
window.isConnected = false;


// ======================================================
// ПОДКЛЮЧЕНИЕ К СЕРВЕРУ
// ======================================================

window.connectToServer = function () {
    const serverUrl = window.location.origin;

    const btn = document.getElementById("btn-connect");
    if (btn) {
        btn.innerText = "Подключение...";
        btn.disabled = true;
    }

    // автоматическое определение хоста
    socket = io();

    socket.on("connect", () => {
        isConnected = true;

        const os = document.getElementById("online-status");
        os.innerText = "СЕРВЕР: ПОДКЛЮЧЕН";
        os.classList.replace("text-gray-500", "text-emerald-400");

        if (btn) btn.innerText = "OK";

        const connPanel = document.getElementById("connection-panel");
        if (connPanel) connPanel.classList.add("hidden");

        document.getElementById("lobby-panel").classList.remove("hidden");
    });

    socket.on("connect_error", (err) => {
        console.log("Попытка подключения...", err);
    });

    setupSocketListeners();
};




// ======================================================
// СОКЕТ-СЛУШАТЕЛИ
// ======================================================

window.setupSocketListeners = function () {

    // список комнат
    socket.on("room_list", rooms => {
        const listEl = document.getElementById("room-list-container");
        listEl.innerHTML = "";

        if (rooms.length === 0) {
            listEl.innerHTML =
                '<div class="text-gray-500 text-[10px] italic">Нет доступных комнат</div>';
            return;
        }

        rooms.forEach(room => {
            const roomBtn = document.createElement("button");
            roomBtn.className =
                "w-full text-left bg-slate-800 hover:bg-slate-700 border border-slate-600 p-2 mb-1 rounded text-xs flex justify-between items-center group transition-all";

            roomBtn.onclick = () => {
                document.getElementById("room-input").value = room.id;
                joinGame();
            };

            roomBtn.innerHTML = `
                <span class="text-blue-400 font-mono font-bold group-hover:text-blue-300">#${room.id}</span>
                <span class="text-gray-400 text-[9px]">Игроков: ${room.count}/2</span>
            `;

            listEl.appendChild(roomBtn);
        });
    });

    socket.on("player_joined", data => {
        log(`Игрок подключился! Комната: ${data.roomId}`);
        document.getElementById("online-msg").innerText = "Соперник в игре!";
    });

    socket.on("game_start", data => {
        myOnlineColor = data.color;
        currentRoomId = data.roomId;
        moveCount = 0;

        window.syncBoardFromOnline(data.board, data.turn, data.castling);
        enterOnlineMode(
            data.roomId,
            `Вы играете за: ${myOnlineColor === 'white' ? 'БЕЛЫХ' : 'ЧЕРНЫХ'}`
        );

        log(`Игра началась! Ваш цвет: ${myOnlineColor.toUpperCase()}`);
    });

    socket.on("receive_move", data => {

        if (typeof data.moveCount !== "undefined") {
            moveCount = data.moveCount;
        }

        if (data.mode && gameMode !== data.mode) {
            gameMode = data.mode;
            if (data.mode === "new_mode") {
                kingDead = true;
                newModePlayer = data.turn;
            }
        }

        document.getElementById("dip-modal").classList.remove("active");

        if (data.lastMove && data.lastMove.proposal) {
            if (myOnlineColor && myOnlineColor === data.turn) {
                // Если ход наш (мы отправители), просто ждем
                log("Ожидание ответа соперника на союз...");
            } else {
                // Если мы получатели предложения:

                // 1. Сохраняем ПОЛНЫЕ данные хода (from и to)
                window.pendingMove = {
                    from: data.lastMove.from,
                    to: data.lastMove.to,
                    attackerColor: getCol(data.board[data.lastMove.to.r][data.lastMove.to.c])
                };

                // 2. Подсвечиваем фигуру для наглядности
                window.selected = data.lastMove.from;

                // 3. ОБЯЗАТЕЛЬНО перерисовываем доску, чтобы видеть предложение
                render();

                document.getElementById("dip-modal").classList.add("active");
                log("ПОЛУЧЕНО ПРЕДЛОЖЕНИЕ СОЮЗА!");
            }
        }
        else {

            window.syncBoardFromOnline(
                data.board,
                data.turn,
                data.castling,
                data.chimeraTracker
            );

            lastMoveData = data.lastMove || null;

            if (!window.gameReady) {
                console.warn("render() skipped — game not ready yet");
                return;
            }

            render();
            updateUI();
            checkGameState();

        }
    });

    socket.on("error_msg", msg => alert(msg));

    socket.on("opponent_left", () => {
        alert("Соперник отключился.");
        location.reload();
    });
};


// ======================================================
// УПРАВЛЕНИЕ ИГРОЙ ЧЕРЕЗ СЕТЬ
// ======================================================

window.hostGame = function () {
    if (!isConnected) return alert("Сначала подключитесь к серверу!");
    const roomId = Math.random().toString(36).substring(2, 7).toUpperCase();
    socket.emit("create_room", roomId);
    enterOnlineMode(roomId, "Ожидание соперника...");
};

window.joinGame = function () {
    if (!isConnected) return alert("Сначала подключитесь к серверу!");
    const roomId = document.getElementById("room-input").value.toUpperCase();
    if (!roomId) return alert("Введите ID комнаты");
    socket.emit("join_room", roomId);
};

window.enterOnlineMode = function (id, status) {
    document.getElementById("lobby-panel").classList.add("hidden");
    document.getElementById("online-active-ui").classList.remove("hidden");

    document.getElementById("room-display").innerText = id;
    document.getElementById("online-msg").innerText = status;
};


// ======================================================
// ОТПРАВКА ХОДА В СЕТЬ
// ======================================================

window.sendMoveToCloud = function (
    boardState,
    nextTurn,
    moveDetails,
    castlingState,
    modeState,
    mCount
) {
    if (!socket || !currentRoomId) return;

    socket.emit("make_move", {
        roomId: currentRoomId,
        board: boardState,
        turn: nextTurn,
        lastMove: moveDetails,
        castling: castlingState,
        mode: modeState || gameMode,
        moveCount: mCount,
        chimeraTracker: chimeraTracker
    });
};


// ======================================================
// Геттеры
// ======================================================

window.getOnlineColor = () => myOnlineColor;
window.isOnlineActive = function () {
    return window.isConnected === true && window.currentRoomId !== null;
};

