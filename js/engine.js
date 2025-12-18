// =========================================================
// ENGINE.JS — игровой движок Chess 2.0 (ИСПРАВЛЕННЫЙ)
// =========================================================

// Глобальные переменные
window.board = [];
window.turn = "white";
window.selected = null;
window.moves = [];
window.gameMode = "classic";

window.chimeraTracker = {};    // { "r,c": count }
window.kingDead = false;
window.loyalty = 3;
window.pendingMove = null;
window.newModePlayer = null;

window.whiteRevived = false;
window.blackRevived = false;
window.moveCount = 0;

window.lastMoveData = null;
window.aiEnabled = false;
window.aiColor = "black";

window.whiteMorale = 10;
window.blackMorale = 10;

window.castling = {
    white: { k: true, l: true, r: true },
    black: { k: true, l: true, r: true }
};

// ПУНКТ №9: Состояние выбора для атакующего
window.choiceMade = false;
window.pendingChoiceMove = null;


// =========================================================
// Включение / выключение ИИ
// =========================================================

window.toggleAI = function () {
    window.aiEnabled = !window.aiEnabled;

    if (window.aiEnabled) {
        window.log("Режим ИИ включён. Вы играете против робота.");
        window.currentRoomId = null;
        window.myOnlineColor = null;
        window.isConnected = false;
    } else {
        window.log("Режим ИИ выключен.");
    }
};


// =========================================================
// Новая партия
// =========================================================

window.initGame = function () {
    window.board = [];
    const r1 = ["r", "n", "b", "q", "k", "b", "n", "r"];
    const R1 = ["R", "N", "B", "Q", "K", "B", "N", "R"];

    for (let i = 0; i < 8; i++) {
        if (i === 0) window.board.push([...R1]);
        else if (i === 1) window.board.push(Array(8).fill("P"));
        else if (i === 6) window.board.push(Array(8).fill("p"));
        else if (i === 7) window.board.push([...r1]);
        else window.board.push(Array(8).fill(null));
    }

    window.chimeraTracker = {};
    window.turn = "white";
    window.selected = null;
    window.moves = [];
    window.gameMode = "classic";
    window.kingDead = false;
    window.moveCount = 0; // Сброс счетчика ходов

    window.loyalty = 3;
    window.pendingMove = null;
    window.newModePlayer = null;
    window.lastMoveData = null;

    window.castling = {
        white: { k: true, l: true, r: true },
        black: { k: true, l: true, r: true }
    };

    const endModal = document.getElementById("end-modal");
    if (endModal) endModal.classList.remove("active");

    const dipModal = document.getElementById("dip-modal");
    if (dipModal) dipModal.classList.remove("active");

    const attackModal = document.getElementById("attacker-choice-modal");
    if (attackModal) attackModal.classList.remove("active");

    window.render();
    window.updateUI();

    setTimeout(() => {
        window.render();
        window.updateUI();
        window.log("Новая партия началась.");
    }, 0);
};


// =========================================================
// ClickCell — выбор и ход фигуры
// =========================================================

window.clickCell = function (r, c) {
    if (window.isOnlineActive() && window.getOnlineColor() && window.turn !== window.getOnlineColor())
        return;

    if (window.selected) {
        const mv = window.moves.find(m => m.r === r && m.c === c);
        if (mv) {
            window.doMove(mv);
            return;
        }
    }

    if (window.board[r][c] && window.getCol(window.board[r][c]) === window.turn) {
        if (window.isOnlineActive() && window.getOnlineColor() && window.getCol(window.board[r][c]) !== window.getOnlineColor())
            return;

        window.selected = { r, c };
        window.moves = window.getMoves(r, c);
        window.render();
    }
    else {
        window.selected = null;
        window.moves = [];
        window.render();
    }
};


// =========================================================
// doMove — выполнение хода
// =========================================================

window.doMove = function (mv) {
    const start = window.selected;
    if (!start) return;

    const p = window.board[start.r][start.c];
    const type = window.getType(p);
    const col = window.getCol(p);

    // ПУНКТ №9: ПЕРЕХВАТ ДЛЯ ВЫБОРА АТАКИ
    if (type === "n" && mv.prop === "chimera" && !window.choiceMade) {
        if (window.isOnlineActive() && window.getOnlineColor() !== window.turn) return;

        window.pendingChoiceMove = mv;
        const modal = document.getElementById("attacker-choice-modal");
        if (modal) {
            modal.classList.add("active");
            window.log("ВСТРЕЧА ВСАДНИКОВ: Выберите действие...");
            return;
        }
    }
    window.choiceMade = false;

    const moveDetails = {
        from: start,
        to: mv,
        proposal: !!mv.prop
    };

    // СЕТЕВОЙ СОЮЗ
    if (mv.prop && window.isOnlineActive()) {
        window.sendMoveToCloud(window.board, window.turn, moveDetails, window.castling, window.gameMode, window.moveCount);
        window.log("Предложение союза отправлено...");
        window.selected = null;
        window.moves = [];
        window.render();
        return;
    }

    const targetKey = `${mv.r},${mv.c}`;
    if (window.chimeraTracker[targetKey] !== undefined)
        delete window.chimeraTracker[targetKey];

    // Если ходит Химера — переносим счётчик
    if (type === "x") {
        const startKey = `${start.r},${start.c}`;
        if (window.chimeraTracker[startKey] !== undefined) {
            window.chimeraTracker[targetKey] = window.chimeraTracker[startKey];
            delete window.chimeraTracker[startKey];
        } else {
            window.chimeraTracker[targetKey] = 0;
        }
    }

    // Запрет рокировки
    if (type === "k") window.castling[window.turn].k = false;

    if (type === "r") {
        const row = window.turn === "white" ? 7 : 0;
        if (start.r === row && start.c === 0) window.castling[window.turn].l = false;
        if (start.r === row && start.c === 7) window.castling[window.turn].r = false;
    }

    // Легион / Локальная Химера
    if (type === "n") {
        const target = window.board[mv.r][mv.c];

        if (target && window.getCol(target) === col && window.getType(target) === "n") {
            window.board[mv.r][mv.c] = (col === "white" ? "h" : "H");
            window.board[start.r][start.c] = null;
            window.log("ЛЕГИОН: Объединение завершено.");
            window.endTurn(start.r, start.c, mv, moveDetails);
            return;
        }

        if (mv.prop === "chimera") {
            const targetP = window.board[mv.r][mv.c];
            if (targetP && window.getType(targetP) === "n" && window.getCol(targetP) !== col) {
                window.pendingMove = mv;
                window.pendingMove.from = start;
                window.pendingMove.to = { r: mv.r, c: mv.c };
                window.pendingMove.attackerColor = col;
                const dipModal = document.getElementById("dip-modal");
                if (dipModal) dipModal.classList.add("active");
                window.log("Предложение: создать ХИМЕРУ");
                return;
            }
        }
    }

    // Archon fuse
    if (mv.fuse) {
        const isL = window.isLight(start.r, start.c);
        const code = window.turn === "white"
            ? (isL ? "a" : "c")
            : (isL ? "A" : "C");

        window.board[mv.r][mv.c] = code;
        window.board[start.r][start.c] = null;
        window.log("СЛИЯНИЕ: Канцлер создан.");
    }

    // Рокировка
    else if (mv.castle) {
        window.board[mv.r][mv.c] = p;
        window.board[start.r][start.c] = null;
        window.castling[window.turn].k = false;

        const row = window.turn === "white" ? 7 : 0;

        if (mv.castle === "short") {
            window.board[row][5] = window.board[row][7];
            window.board[row][7] = null;
        } else {
            window.board[row][3] = window.board[row][0];
            window.board[row][0] = null;
        }

        window.log("РОКИРОВКА!");
    }

    // Обычный ход
    else {
        window.board[mv.r][mv.c] = p;
        window.board[start.r][start.c] = null;

        if (type === "p" && (mv.r === 0 || mv.r === 7)) {
            // ИСПРАВЛЕН БАГ: Теперь черная пешка в Новом режиме становится Q (черным ферзем)
            if (window.gameMode === "new_mode") {
                window.board[mv.r][mv.c] = window.turn === "white" ? "q" : "Q";
                window.log("ПРОМОУШН: Создан Ферзь.");
            } else {
                window.board[mv.r][mv.c] = window.turn === "white" ? "q" : "Q";
            }
        }
    }

    window.endTurn(start.r, start.c, mv, moveDetails);
};

// ПУНКТ №9: ОБРАБОТКА ВЫБОРА АТАКУЮЩЕГО
window.resolveAttackerChoice = function (action) {
    const mv = window.pendingChoiceMove;
    if (!mv) return;

    const modal = document.getElementById("attacker-choice-modal");
    if (modal) modal.classList.remove("active");
    window.choiceMade = true;

    if (action === 'attack') {
        window.log("ДИПЛОМАТИЯ: Вы выбрали атаку.");
        mv.prop = null; // Убираем флаг химеры, делаем обычный ход
        window.doMove(mv);
    } else {
        window.log("ДИПЛОМАТИЯ: Вы предложили союз.");
        window.doMove(mv);
    }
};


// =========================================================
// endTurn — завершение хода
// =========================================================

window.endTurn = function (sr, sc, mv, moveDetails) {

    const nextTurn = window.turn === "white" ? "black" : "white";
    window.moveCount++;

    const justFinishedPlayer = window.turn;

    // Химера
    for (const key in window.chimeraTracker) {
        const [r, c] = key.split(",").map(Number);
        const p = window.board[r][c];

        if (p && window.getType(p) === "x") {
            const owner = window.getCol(p);

            if (owner === justFinishedPlayer) {
                window.chimeraTracker[key]++;

                if (window.chimeraTracker[key] >= 2) {
                    const newType = (p === "x") ? "X" : "x";
                    window.board[r][c] = newType;
                    window.chimeraTracker[key] = 0;

                    window.log(`ХИМЕРА на ${String.fromCharCode(97 + c)}${8 - r} сменила лояльность!`);
                }
            }
        } else {
            delete window.chimeraTracker[key];
        }
    }

    if (!moveDetails && typeof sr !== "undefined")
        moveDetails = { from: { r: sr, c: sc }, to: mv };

    if (window.isOnlineActive()) {
        window.sendMoveToCloud(
            window.board,
            nextTurn,
            moveDetails,
            window.castling,
            window.gameMode,
            window.moveCount
        );
    }

    window.loyalty--;
    if (window.loyalty <= 0) {
        window.consultGeminiLoyalty();
        window.loyalty = 3;
    }

    window.turn = nextTurn;
    window.selected = null;
    window.moves = [];

    window.lastMoveData = moveDetails;

    window.updateLossCounters();
    window.updateUI();
    window.render();
    window.updateMoraleUI();

    if (window.aiEnabled && window.turn === window.aiColor) {
        setTimeout(() => {
            const before = window.lastMoveData;
            window.makeAIMove();
            setTimeout(() => {
                if (before === window.lastMoveData) window.checkGameState();
            }, 50);
        }, 150);
        return;
    }

    window.checkGameState();
};


// =========================================================
// consultGeminiLoyalty — мораль
// =========================================================

window.consultGeminiLoyalty = function () {
    const lossWEl = document.getElementById("loss-w");
    const lossBEl = document.getElementById("loss-b");

    const whiteLoss = lossWEl ? parseInt(lossWEl.innerText) : 0;
    const blackLoss = lossBEl ? parseInt(lossBEl.innerText) : 0;

    window.whiteMorale = Math.max(0, 10 - whiteLoss / 3);
    window.blackMorale = Math.max(0, 10 - blackLoss / 3);

    for (let r = 0; r < 8; r++)
        for (let c = 0; c < 8; c++) {
            const p = window.board[r][c];
            if (!p || window.getType(p) !== "p") continue;

            const color = window.getCol(p);
            const morale = (color === "white") ? window.whiteMorale : window.blackMorale;

            if (morale > 3) continue;

            let chance = 0;
            if (morale <= 3) chance = 0.05 + Math.random() * 0.10;
            if (morale <= 1) chance = 0.20 + Math.random() * 0.10;

            let enemyNearby = false;
            const dirs = [
                [1, 0], [-1, 0], [0, 1], [0, -1],
                [1, 1], [1, -1], [-1, 1], [-1, -1]
            ];

            for (const [dr, dc] of dirs) {
                const rr = r + dr, cc = c + dc;
                if (!window.onBd(rr, cc)) continue;
                const piece = window.board[rr][cc];
                if (piece && window.getCol(piece) !== color) enemyNearby = true;
            }

            if (!enemyNearby) continue;

            if (Math.random() < chance) {
                window.board[r][c] = color === "white" ? "P" : "p";
                window.log(`⚠ Пешка на (${r},${c}) изменила сторону!`);
            }
        }

    window.updateMoraleUI();
    window.render();
};


// =========================================================
// activateNewMode — Resurrection Mode
// =========================================================

window.activateNewMode = function () {
    const player = window.turn;

    if (player === "white") window.whiteRevived = true;
    else window.blackRevived = true;

    window.gameMode = "new_mode";
    window.newModePlayer = player;
    window.kingDead = true;

    const endModal = document.getElementById("end-modal");
    if (endModal) endModal.classList.remove("active");

    let legions = 0;
    let archons = 0;

    for (let r = 0; r < 8; r++)
        for (let c = 0; c < 8; c++) {
            const p = window.board[r][c];
            if (p && window.getCol(p) === player) {
                if (["h", "x"].includes(window.getType(p))) legions++;
                if (["a", "c"].includes(window.getType(p))) archons++;
            }
        }

    for (let r = 0; r < 8; r++)
        for (let c = 0; c < 8; c++)
            if (window.board[r][c] && window.getCol(window.board[r][c]) === player)
                window.board[r][c] = null;

    const baseR = player === "white" ? 7 : 0;
    const pawnR = player === "white" ? 6 : 1;

    const rowTemplate = player === "white"
        ? ["r", "n", "b", "q", "k", "b", "n", "r"]
        : ["R", "N", "B", "Q", "K", "B", "N", "R"];

    window.board[baseR] = [...rowTemplate];
    window.board[pawnR] = Array(8).fill(player === "white" ? "p" : "P");

    for (let c = 0; c < 8; c++) {
        const p = window.board[baseR][c];

        if (window.getType(p) === "n" && legions > 0) {
            window.board[baseR][c] = player === "white" ? "h" : "H";
            legions--;
        }

        if (window.getType(p) === "r" && archons > 0) {
            const isL = window.isLight(baseR, c);
            window.board[baseR][c] = player === "white"
                ? (isL ? "a" : "c")
                : (isL ? "A" : "C");
            archons--;
        }
    }

    window.board[baseR][4] = null;
    window.board[baseR][3] = player === "white" ? "z" : "Z";

    window.log("НОВЫЙ РЕЖИМ! Король мертв. Ферзь установлен на трон.");
    window.render();
};