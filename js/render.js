// ===============================
// РЕНДЕР ДОСКИ
// ===============================

window.render = function () {
    const boardEl = document.getElementById("board");
    const svg = document.getElementById("svg-overlay");

    if (!boardEl || !svg) {
        console.warn("render(): DOM not ready");
        return;
    }

    // 1. Очищаем только клетки, не трогая сам SVG элемент
    const oldCells = boardEl.querySelectorAll('.cell');
    oldCells.forEach(c => c.remove());

    // 2. Очищаем содержимое SVG (линии хода)
    svg.innerHTML = "";

    // 3. Отрисовка клеток и фигур
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const cell = document.createElement("div");
            cell.className = "cell " + ((r + c) % 2 === 0 ? "light" : "dark");

            // Обработка клика
            cell.onclick = () => window.clickCell(r, c);

            // Подсветка выбранной клетки
            if (window.selected && window.selected.r === r && window.selected.c === c) {
                cell.classList.add("selected");
            }

            // Подсветка шаха (если функция есть)
            if (window.isCheckSquare && window.isCheckSquare(r, c)) {
                cell.classList.add("check");
            }

            // --- ОТРИСОВКА ФИГУРЫ ---
            const p = window.board[r][c];
            if (p) {
                const pc = document.createElement("div");
                pc.className = "piece";

                // Определяем цвет (регистр символа)
                if (p === p.toUpperCase()) pc.classList.add("black");
                else pc.classList.add("white");

                // Добавляем спец-классы для уникальных типов
                const type = p.toLowerCase();
                if (type === "a" || type === "c") pc.classList.add("archon");
                if (type === "h") pc.classList.add("legion");
                if (type === "x") pc.classList.add("chimera");
                if (type === "z") pc.classList.add("heavy");

                // Берем символ фигуры из глобального словаря GP
                pc.innerText = window.GP[p] || '';
                cell.appendChild(pc);
            }

            // --- ОТРИСОВКА ПОДСКАЗОК (ХОДОВ) ---
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

    // 4. Отрисовка SVG линии последнего хода
    if (window.lastMoveData && window.lastMoveData.from && window.lastMoveData.to) {
        const { from, to } = window.lastMoveData;

        const cellWidth = boardEl.clientWidth / 8;
        const cellHeight = boardEl.clientHeight / 8;

        const a = {
            x: from.c * cellWidth + cellWidth / 2,
            y: from.r * cellHeight + cellHeight / 2
        };
        const b = {
            x: to.c * cellWidth + cellWidth / 2,
            y: to.r * cellHeight + cellHeight / 2
        };

        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", a.x);
        line.setAttribute("y1", a.y);
        line.setAttribute("x2", b.x);
        line.setAttribute("y2", b.y);
        line.setAttribute("stroke", "#d946ef");
        line.setAttribute("stroke-width", "6");
        line.setAttribute("stroke-linecap", "round");
        line.classList.add("last-move-purple");

        svg.appendChild(line);
    }
};

// Прочие функции без изменений
window.setBoardFlip = function (flip) {
    const boardEl = document.getElementById("board");
    if (boardEl) {
        if (flip) boardEl.classList.add("flipped");
        else boardEl.classList.remove("flipped");
    }
};

window.syncBoardFromOnline = function (newBoard, newTurn, castlingState, chimeraState) {
    window.board = newBoard.map(row => [...row]);
    window.turn = newTurn;
    if (castlingState) window.castling = castlingState;
    if (chimeraState) window.chimeraTracker = chimeraState;
    render();
    updateUI();
};