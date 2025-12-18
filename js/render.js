// =========================================================
// RENDER.JS — визуализация доски и фигур Chess 2.0
// =========================================================

window.render = function () {
    const boardEl = document.getElementById("board");
    const svg = document.getElementById("svg-overlay");

    if (!boardEl || !svg) {
        console.warn("render(): DOM не найден");
        return;
    }

    // 1. Очищаем старые клетки
    const oldCells = boardEl.querySelectorAll('.cell');
    oldCells.forEach(c => c.remove());

    // 2. Очищаем SVG слой (линии последнего хода)
    svg.innerHTML = "";

    // 3. Отрисовка сетки 8x8
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const cell = document.createElement("div");
            // Определяем цвет клетки (белая/черная)
            cell.className = "cell " + ((r + c) % 2 === 0 ? "light" : "dark");

            // Назначаем обработчик клика
            cell.onclick = () => window.clickCell(r, c);

            // Подсветка выбранной фигуры
            if (window.selected && window.selected.r === r && window.selected.c === c) {
                cell.classList.add("selected");
            }

            // Подсветка шаха королю или Heavy Queen
            if (window.isCheckSquare && window.isCheckSquare(r, c)) {
                cell.classList.add("check");
            }

            // --- РЕНДЕР ФИГУР ---
            const p = window.board[r][c];
            if (p) {
                const pc = document.createElement("div");
                pc.className = "piece";

                // Определяем цвет (Верхний регистр = Черные, Нижний = Белые)
                if (p === p.toUpperCase()) pc.classList.add("black");
                else pc.classList.add("white");

                const type = p.toLowerCase();

                // ПУНКТ №3 ФИКС: РАЗНЫЕ КАНЦЛЕРЫ (АРХОНТЫ)
                // Вид теперь зависит от символа (происхождения), а не от клетки
                if (type === "a" || type === "c") {
                    pc.classList.add("archon");

                    // a/A — Белопольный (Золотой), c/C — Чернопольный (Фиолетовый)
                    if (type === "a") {
                        pc.classList.add("archon-light");
                    } else {
                        pc.classList.add("archon-dark");
                    }
                }

                // Стили для других спец-фигур
                if (type === "h") pc.classList.add("legion");
                if (type === "x") pc.classList.add("chimera");
                if (type === "z") pc.classList.add("heavy");

                // Вставляем символ фигуры из словаря GP
                pc.innerText = window.GP[p] || '';
                cell.appendChild(pc);
            }

            // --- ПОДСКАЗКИ ХОДОВ ---
            const mv = window.moves.find(m => m.r === r && m.c === c);
            if (mv) {
                const hint = document.createElement("div");
                hint.className = "hint";

                if (mv.atk) hint.classList.add("attack-hint");
                else if (mv.merge) hint.classList.add("union-hint");
                else if (mv.castle) hint.classList.add("special-hint", "castle");
                else if (mv.fuse) hint.classList.add("special-hint", "fuse");
                else if (mv.prop) hint.classList.add("special-hint", "union");
                else hint.classList.add("move-hint");

                cell.appendChild(hint);
            }

            boardEl.appendChild(cell);
        }
    }

    // 4. Отрисовка фиолетовой неоновой линии последнего хода
    if (window.lastMoveData && window.lastMoveData.from && window.lastMoveData.to) {
        const { from, to } = window.lastMoveData;

        const cellWidth = boardEl.clientWidth / 8;
        const cellHeight = boardEl.clientHeight / 8;

        const startPos = {
            x: from.c * cellWidth + cellWidth / 2,
            y: from.r * cellHeight + cellHeight / 2
        };
        const endPos = {
            x: to.c * cellWidth + cellWidth / 2,
            y: to.r * cellHeight + cellHeight / 2
        };

        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", startPos.x);
        line.setAttribute("y1", startPos.y);
        line.setAttribute("x2", endPos.x);
        line.setAttribute("y2", endPos.y);
        line.setAttribute("stroke", "#d946ef"); // Неоновый фиолетовый
        line.setAttribute("stroke-width", "6");
        line.setAttribute("stroke-linecap", "round");
        line.classList.add("last-move-purple");

        svg.appendChild(line);
    }
};

/**
 * Переворот доски для черного игрока
 */
window.setBoardFlip = function (flip) {
    const boardEl = document.getElementById("board");
    if (boardEl) {
        if (flip) boardEl.classList.add("flipped");
        else boardEl.classList.remove("flipped");
    }
};

/**
 * Синхронизация состояния доски из онлайн-пакета
 */
window.syncBoardFromOnline = function (newBoard, newTurn, castlingState, chimeraState) {
    window.board = newBoard.map(row => [...row]);
    window.turn = newTurn;
    if (castlingState) window.castling = castlingState;
    if (chimeraState) window.chimeraTracker = chimeraState;
    window.render();
    if (window.updateUI) window.updateUI();
};