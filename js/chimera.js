// =====================================================
// CHIMERA.JS — УНИКАЛЬНАЯ МЕХАНИКА ХИМЕРЫ
// =====================================================


// ---------------------------------------------
// Проверка: является ли фигура химерой
// ---------------------------------------------
window.isChimera = function (p) {
    if (!p) return false;
    return getType(p) === "x";
};


// ---------------------------------------------
// Перемещение химерного счётчика при ходе
// (вызов из doMove перед заменой фигуры)
// ---------------------------------------------
window.transferChimeraCounter = function (start, target) {
    const startKey = `${start.r},${start.c}`;
    const targetKey = `${target.r},${target.c}`;

    // чистим старое, если на target что-то было
    if (chimeraTracker[targetKey] !== undefined) {
        delete chimeraTracker[targetKey];
    }

    if (chimeraTracker[startKey] !== undefined) {
        chimeraTracker[targetKey] = chimeraTracker[startKey];
        delete chimeraTracker[startKey];
    } else {
        chimeraTracker[targetKey] = 0;
    }
};


// ---------------------------------------------
// Создать дипломатическое предложение Химеры
// (используется в doMove на этапе prop)
// ---------------------------------------------
window.beginChimeraProposal = function (mv, start) {
    pendingMove = mv;
    pendingMove.from = start;
    pendingMove.to = { r: mv.r, c: mv.c };
    pendingMove.attackerColor = getCol(board[start.r][start.c]);

    document.getElementById("dip-modal").classList.add("active");
    log("Предложение: создать ХИМЕРУ");
};


// ---------------------------------------------
// Слияние двух коней → появление Химеры
// (вызовается из doMove)
// ---------------------------------------------
window.mergeIntoLegionOrChimera = function (start, mv) {
    const p = board[start.r][start.c];
    const col = getCol(p);

    // обычное легионное объединение (n+n = h/H)
    if (getType(p) === "n") {
        const target = board[mv.r][mv.c];
        if (target && getCol(target) === col && getType(target) === "n") {
            board[mv.r][mv.c] = (col === "white" ? "h" : "H");
            board[start.r][start.c] = null;
            log("ЛЕГИОН: Объединение завершено.");
            return true;
        }
    }

    return false;
};


// ---------------------------------------------
// Проверка дипломатического союза для химер
// ---------------------------------------------
window.handleChimeraUnionRequest = function (mv, start) {
    const p = board[start.r][start.c];
    const col = getCol(p);

    if (mv.prop === "chimera") {
        const target = board[mv.r][mv.c];
        if (target && getType(target) === "n" && getCol(target) !== col) {
            beginChimeraProposal(mv, start);
            return true;
        }
    }

    return false;
};


// ---------------------------------------------
// ГЛАВНЫЙ МОДУЛЬ: обновление химеры после каждого хода
// (вызывается В САМОМ НАЧАЛЕ endTurn)
// ---------------------------------------------
window.updateChimerasAfterTurn = function (justFinishedPlayer) {

    for (const key in chimeraTracker) {

        const [r, c] = key.split(",").map(Number);
        const p = board[r][c];

        // мусор — чистим
        if (!p || getType(p) !== "x") {
            delete chimeraTracker[key];
            continue;
        }

        const owner = getCol(p);

        // обновляем счётчик Химеры только для игрока, завершившего ход
        if (owner === justFinishedPlayer) {

            chimeraTracker[key]++;

            // Химера должна дважды походить со стороны владельца, чтобы сменить цвет
            if (chimeraTracker[key] >= 2) {

                const newType = (p === "x") ? "X" : "x";
                board[r][c] = newType;
                chimeraTracker[key] = 0;

                log(`ХИМЕРА на ${String.fromCharCode(97 + c)}${8 - r} сменила лояльность!`);
            }
        }
    }
};


// ---------------------------------------------
// Полная зачистка мусора в chimeraTracker
// (вызов по необходимости)
// ---------------------------------------------
window.cleanChimeraTracker = function () {
    for (const key in chimeraTracker) {
        const [r, c] = key.split(",").map(Number);
        const p = board[r][c];

        if (!p || getType(p) !== "x") {
            delete chimeraTracker[key];
        }
    }
};
// ---------------------------------------------
// ПРИНЯТЬ СОЮЗ (Создание Химеры)
// ---------------------------------------------
window.acceptProp = function () {
    const mv = window.pendingMove;
    if (!mv) return;

    const from = mv.from;
    const p = window.board[from.r][from.c];
    const col = getCol(p);

    // Создаем Химеру (x/X) на месте цели
    window.board[mv.r][mv.c] = (col === "white" ? "x" : "X");
    window.board[from.r][from.c] = null;

    // Инициализируем счетчик лояльности
    window.chimeraTracker[`${mv.r},${mv.c}`] = 0;

    log("ДИПЛОМАТИЯ: Союз принят! Появилась Химера.");

    document.getElementById("dip-modal").classList.remove("active");
    window.endTurn(from.r, from.c, mv);
};

// ---------------------------------------------
// ОТКЛОНИТЬ СОЮЗ (Обычный бой)
// ---------------------------------------------
window.declineProp = function () {
    const mv = window.pendingMove;
    if (!mv) return;

    const from = mv.from;
    const p = window.board[from.r][from.c];

    // Обычный ход конем (взятие фигуры)
    window.board[mv.r][mv.c] = p;
    window.board[from.r][from.c] = null;

    log("ДИПЛОМАТИЯ: В союзе отказано. Начался бой!");

    document.getElementById("dip-modal").classList.remove("active");
    window.endTurn(from.r, from.c, mv);
};