// =====================================================
// CHIMERA.JS — УНИКАЛЬНАЯ МЕХАНИКА ХИМЕРЫ (ИСПРАВЛЕННЫЙ)
// =====================================================

// ---------------------------------------------
// Проверка: является ли фигура химерой
// ---------------------------------------------
window.isChimera = function (p) {
    if (!p) return false;
    return window.getType(p) === "x";
};

// ---------------------------------------------
// Перемещение химерного счётчика при ходе
// (вызов из doMove перед заменой фигуры)
// ---------------------------------------------
window.transferChimeraCounter = function (start, target) {
    const startKey = `${start.r},${start.c}`;
    const targetKey = `${target.r},${target.c}`;

    // Чистим старое, если на целевой клетке что-то было
    if (window.chimeraTracker[targetKey] !== undefined) {
        delete window.chimeraTracker[targetKey];
    }

    // Переносим значение счетчика на новую клетку
    if (window.chimeraTracker[startKey] !== undefined) {
        window.chimeraTracker[targetKey] = window.chimeraTracker[startKey];
        delete window.chimeraTracker[startKey];
    } else {
        window.chimeraTracker[targetKey] = 0;
    }
};

// ---------------------------------------------
// Создать дипломатическое предложение Химеры
// ---------------------------------------------
window.beginChimeraProposal = function (mv, start) {
    // Подготовка данных для модального окна
    window.pendingMove = mv;
    window.pendingMove.from = start;
    window.pendingMove.to = { r: mv.r, c: mv.c };
    window.pendingMove.attackerColor = window.getCol(window.board[start.r][start.c]);

    // Показываем окно дипломатии
    const modal = document.getElementById("dip-modal");
    if (modal) modal.classList.add("active");
    window.log("ДИПЛОМАТИЯ: Предложено создание ХИМЕРЫ");
};

// ---------------------------------------------
// Слияние двух коней → появление Химеры (локально)
// ---------------------------------------------
window.mergeIntoLegionOrChimera = function (start, mv) {
    const p = window.board[start.r][start.c];
    const col = window.getCol(p);

    if (window.getType(p) === "n") {
        const target = window.board[mv.r][mv.c];
        if (target && window.getCol(target) === col && window.getType(target) === "n") {
            window.board[mv.r][mv.c] = (col === "white" ? "h" : "H");
            window.board[start.r][start.c] = null;
            window.log("ЛЕГИОН: Объединение завершено.");
            return true;
        }
    }
    return false;
};

// ---------------------------------------------
// ГЛАВНЫЙ МОДУЛЬ: обновление химеры после каждого хода
// ---------------------------------------------
window.updateChimerasAfterTurn = function (justFinishedPlayer) {
    for (const key in window.chimeraTracker) {
        const [r, c] = key.split(",").map(Number);
        const p = window.board[r][c];

        // Если фигура исчезла или перестала быть химерой — удаляем из трекера
        if (!p || window.getType(p) !== "x") {
            delete window.chimeraTracker[key];
            continue;
        }

        const owner = window.getCol(p);

        // Обновляем счётчик Химеры только для игрока, который только что сделал ход
        if (owner === justFinishedPlayer) {
            window.chimeraTracker[key]++;

            // Если химера совершила 2 хода подряд, она меняет сторону
            if (window.chimeraTracker[key] >= 2) {
                const newType = (p === "x") ? "X" : "x";
                window.board[r][c] = newType;
                window.chimeraTracker[key] = 0;
                window.log(`ХИМЕРА на ${String.fromCharCode(97 + c)}${8 - r} сменила лояльность!`);
            }
        }
    }
};

// ---------------------------------------------
// ПРИНЯТЬ СОЮЗ (Пункт №4: Исправление кнопок)
// ---------------------------------------------
window.acceptProp = function () {
    const mv = window.pendingMove;
    if (!mv || !mv.from) {
        console.error("acceptProp: Нет активного предложения.");
        return;
    }

    const from = mv.from;
    // ИСПРАВЛЕНИЕ: Пытаемся достать координаты 'to', если они вложены (для онлайна)
    const target = mv.to || { r: mv.r, c: mv.c };

    const p = window.board[from.r][from.c];
    if (!p) {
        window.log("ОШИБКА: Фигура атакующего не найдена на доске.");
        document.getElementById("dip-modal").classList.remove("active");
        return;
    }

    const col = window.getCol(p);

    // 1. Ставим Химеру на место цели
    window.board[target.r][target.c] = (col === "white" ? "x" : "X");

    // 2. Убираем исходную фигуру
    window.board[from.r][from.c] = null;

    // 3. Сбрасываем счетчик химеры для новой позиции
    window.chimeraTracker[`${target.r},${target.c}`] = 0;

    window.log("ДИПЛОМАТИЯ: Союз принят! Появилась новая Химера.");

    document.getElementById("dip-modal").classList.remove("active");

    // 4. Завершаем ход (это синхронизирует состояние в онлайне)
    window.endTurn(from.r, from.c, target);
};

// ---------------------------------------------
// ОТКЛОНИТЬ СОЮЗ (Обычный бой)
// ---------------------------------------------
window.declineProp = function () {
    const mv = window.pendingMove;
    if (!mv || !mv.from) {
        document.getElementById("dip-modal").classList.remove("active");
        return;
    }

    const from = mv.from;
    const target = mv.to || { r: mv.r, c: mv.c };

    const p = window.board[from.r][from.c];
    if (!p) {
        document.getElementById("dip-modal").classList.remove("active");
        return;
    }

    // Обычный ход конем (рубим фигуру)
    window.board[target.r][target.c] = p;
    window.board[from.r][from.c] = null;

    window.log("ДИПЛОМАТИЯ: В союзе отказано. Начался бой!");

    document.getElementById("dip-modal").classList.remove("active");
    window.endTurn(from.r, from.c, target);
};

// ---------------------------------------------
// Полная зачистка мусора в chimeraTracker
// ---------------------------------------------
window.cleanChimeraTracker = function () {
    for (const key in window.chimeraTracker) {
        const [r, c] = key.split(",").map(Number);
        const p = window.board[r][c];
        if (!p || window.getType(p) !== "x") {
            delete window.chimeraTracker[key];
        }
    }
};