// ======================================
// RULES.JS — шахматные правила и логика ходов
// ======================================

// Глобальные функции-утилиты
window.getCol = p => p ? (p === p.toUpperCase() ? "black" : "white") : null;
window.getType = p => p ? p.toLowerCase() : null;
window.onBd = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
window.isLight = (r, c) => (r + c) % 2 === 0;


// ===============================
// ПРОВЕРКА АТАКИ (для рокировки)
// ===============================
window.isAttacked = function (r, c, attackerCol) {
    const tempBoard = window.board.map(row => [...row]);
    const myCol = attackerCol === "white" ? "black" : "white";
    const oldVal = tempBoard[r][c];

    // Временно ставим короля, чтобы проверить шах
    tempBoard[r][c] = (myCol === "white" ? "k" : "K");
    const check = window.inCheck(myCol, tempBoard);

    tempBoard[r][c] = oldVal;

    return check;
};


// ===============================
// ГЕНЕРАЦИЯ ВСЕХ ВОЗМОЖНЫХ ХОДОВ
// ===============================
window.getMoves = function (r, c, safe = true) {
    const p = window.board[r][c];
    if (!p) return [];

    const col = getCol(p), type = getType(p);
    const m = [];

    const dirs = [
        [0, 1], [0, -1], [1, 0], [-1, 0],
        [1, 1], [1, -1], [-1, 1], [-1, -1]
    ];

    const kn = [
        [2, 1], [2, -1], [-2, 1], [-2, -1],
        [1, 2], [1, -2], [-1, 2], [-1, -2]
    ];

    const bigKn = [
        [4, 1], [4, -1], [-4, 1], [-4, -1],
        [1, 4], [1, -4], [-1, 4], [-1, -4]
    ];

    // ------------------------------
    // ПЕШКА
    // ------------------------------
    if (type === "p") {
        const d = col === "white" ? -1 : 1;
        const start = col === "white" ? 6 : 1;

        if (onBd(r + d, c) && !window.board[r + d][c]) {
            m.push({ r: r + d, c });
            if (r === start && !window.board[r + d * 2][c])
                m.push({ r: r + d * 2, c });
        }

        [[d, 1], [d, -1]].forEach(([dr, dc]) => {
            if (!onBd(r + dr, c + dc)) return;
            const t = window.board[r + dr][c + dc];
            if (t && getCol(t) !== col)
                m.push({ r: r + dr, c: c + dc, atk: true });
        });
    }


    // ------------------------------
    // ЛАДЬЯ, СЛОН, ФЕРЗЬ, АРХОНТЫ
    // ------------------------------
    if (["r", "b", "q", "a", "c"].includes(type)) {
        let myDirs = [];

        if (type === "r" || type === "q") myDirs.push(...dirs.slice(0, 4));
        if (type === "b" || type === "q") myDirs.push(...dirs.slice(4));

        if (type === "a" || type === "c") {
            myDirs = [...dirs.slice(0, 4)];
            const okDiag = (type === "a" && isLight(r, c)) || (type === "c" && !isLight(r, c));
            if (okDiag) myDirs.push(...dirs.slice(4));
        }

        for (const [dr, dc] of myDirs) {
            let tr = r + dr, tc = c + dc;
            while (onBd(tr, tc)) {
                const t = window.board[tr][tc];
                if (t && getCol(t) === col) {
                    if (type === "r" && getType(t) === "b") m.push({ r: tr, c: tc, fuse: true });
                    if (type === "b" && getType(t) === "r") m.push({ r: tr, c: tc, fuse: true });
                }
                if (!t) m.push({ r: tr, c: tc });
                else {
                    if (getCol(t) !== col)
                        m.push({ r: tr, c: tc, atk: true });
                    break;
                }
                tr += dr; tc += dc;
            }
        }
    }


    // ------------------------------
    // КОНЬ, ЛЕГИОН, ХИМЕРА
    // ------------------------------
    if (["n", "h", "x"].includes(type)) {
        const add = (rr, cc) => {
            if (!onBd(rr, cc)) return;
            const t = window.board[rr][cc];

            if (type === "n" && t && getType(t) === "n" && getCol(t) !== col) {
                m.push({ r: rr, c: cc, atk: true, prop: "chimera" });
                return;
            }
            if (!t || getCol(t) !== col)
                m.push({ r: rr, c: cc, atk: !!t });

            if (type === "n" && t && getCol(t) === col && getType(t) === "n")
                m.push({ r: rr, c: cc, merge: true });
        };

        if (type === "n" || type === "x")
            for (const [dr, dc] of kn) add(r + dr, c + dc);

        if (type === "h" || type === "x")
            for (const [dr, dc] of bigKn) add(r + dr, c + dc);
    }


    // ------------------------------
    // КОРОЛЬ и ТЯЖЁЛЫЙ ФЕРЗЬ (Z)
    // ------------------------------
    if (type === "k" || type === "z") {
        for (const [dr, dc] of dirs) {
            if (!onBd(r + dr, c + dc)) continue;
            const t = window.board[r + dr][c + dc];
            if (!t || getCol(t) !== col)
                m.push({ r: r + dr, c: c + dc, atk: !!t });
        }

        // Рокировка
        if (safe && type === "k") {
            const row = col === "white" ? 7 : 0;
            if (!window.inCheck(col, window.board)) {
                const opp = col === "white" ? "black" : "white";

                const rookShort = window.board[row][7];
                if (window.castling[col].k && window.castling[col].r &&
                    rookShort && getType(rookShort) === "r" && getCol(rookShort) === col
                ) {
                    if (!window.board[row][5] && !window.board[row][6] &&
                        !isAttacked(row, 5, opp) &&
                        !isAttacked(row, 6, opp)) {
                        m.push({ r: row, c: 6, castle: "short" });
                    }
                }

                const rookLong = window.board[row][0];
                if (window.castling[col].k && window.castling[col].l &&
                    rookLong && getType(rookLong) === "r" && getCol(rookLong) === col
                ) {
                    if (!window.board[row][1] && !window.board[row][2] && !window.board[row][3] &&
                        !isAttacked(row, 3, opp) &&
                        !isAttacked(row, 2, opp)) {
                        m.push({ r: row, c: 2, castle: "long" });
                    }
                }
            }
        }
    }


    // ------------------------------
    // ФИЛЬТРАЦИЯ ХОДОВ
    // ------------------------------
    const finalMoves = [];
    for (let mv of m) {
        const targetP = window.board[mv.r][mv.c];
        if (targetP) {
            const tType = getType(targetP);
            const tCol = getCol(targetP);
            if (tType === "k") continue;
            if (window.gameMode === "new_mode" &&
                tType === "z" &&
                tCol === window.newModePlayer)
                continue;
        }
        finalMoves.push(mv);
    }

    if (!safe) return finalMoves;

    const legal = [];
    for (const mv of finalMoves) {
        const tmp = window.board.map(row => [...row]);

        tmp[mv.r][mv.c] = tmp[r][c];
        tmp[r][c] = null;

        if (!window.inCheck(col, tmp)) legal.push(mv);
    }
    return legal;
};


// ===============================
// ПРОВЕРКА ШАХА
// ===============================
window.inCheck = function (col, bd) {
    let kr = -1, kc = -1;

    let kingSymbol = col === "white" ? "k" : "K";
    if (window.gameMode === "new_mode" && window.kingDead && col === window.newModePlayer) {
        kingSymbol = col === "white" ? "z" : "Z";
    }

    for (let r = 0; r < 8; r++)
        for (let c = 0; c < 8; c++)
            if (bd[r][c] === kingSymbol) { kr = r; kc = c; }

    if (kr === -1) return true;

    const opp = col === "white" ? "black" : "white";

    // ПЕШКИ
    const pawnDir = (opp === "white") ? 1 : -1;
    for (let dc of [-1, 1]) {
        let pr = kr + pawnDir, pc = kc + dc;
        if (!onBd(pr, pc)) continue;
        const p = bd[pr][pc];
        if (p && getCol(p) === opp && getType(p) === "p") return true;
    }

    // МАЛЫЕ КОНЁ
    const knightSmall = [
        [2, 1], [2, -1], [-2, 1], [-2, -1],
        [1, 2], [1, -2], [-1, 2], [-1, -2]
    ];

    for (let [dr, dc] of knightSmall) {
        const rr = kr + dr, cc = kc + dc;
        if (!onBd(rr, cc)) continue;
        const p = bd[rr][cc];
        if (p && getCol(p) === opp && getType(p) === "n") return true;
    }

    // БОЛЬШИЕ КОНЁ (ЛЕГИОН)
    const knightLarge = [
        [4, 1], [4, -1], [-4, 1], [-4, -1],
        [1, 4], [1, -4], [-1, 4], [-1, -4]
    ];

    for (let [dr, dc] of knightLarge) {
        const rr = kr + dr, cc = kc + dc;
        if (!onBd(rr, cc)) continue;
        const p = bd[rr][cc];
        if (p && getCol(p) === opp && getType(p) === "h") return true;
    }

    // ХИМЕРА (оба типа ходов)
    for (let [dr, dc] of [...knightSmall, ...knightLarge]) {
        const rr = kr + dr, cc = kc + dc;
        if (!onBd(rr, cc)) continue;
        const p = bd[rr][cc];
        if (p && getCol(p) === opp && getType(p) === "x") return true;
    }

    // ЛАДЬИ / ФЕРЗЬ / АРХОНТЫ / Z — прямые линии
    const rookDirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (let [dr, dc] of rookDirs) {
        let rr = kr + dr, cc = kc + dc;
        while (onBd(rr, cc)) {
            const p = bd[rr][cc];
            if (p) {
                if (getCol(p) === opp) {
                    let t = getType(p);
                    if (["r", "q", "z", "a", "c"].includes(t)) return true;
                }
                break;
            }
            rr += dr; cc += dc;
        }
    }

    // ДИАГОНАЛИ
    const diag = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
    for (let [dr, dc] of diag) {
        let rr = kr + dr, cc = kc + dc;
        while (onBd(rr, cc)) {
            const p = bd[rr][cc];
            if (p) {
                if (getCol(p) === opp) {
                    let t = getType(p);
                    if (t === "b" || t === "q" || t === "z") return true;
                    if (t === "a" && isLight(rr, cc)) return true;
                    if (t === "c" && !isLight(rr, cc)) return true;
                }
                break;
            }
            rr += dr; cc += dc;
        }
    }

    // КОРОЛЬ
    for (let dr of [-1, 0, 1])
        for (let dc of [-1, 0, 1]) {
            if (dr === 0 && dc === 0) continue;
            const rr = kr + dr, cc = kc + dc;
            if (!onBd(rr, cc)) continue;
            const p = bd[rr][cc];
            if (p && getCol(p) === opp && getType(p) === "k") return true;
        }

    return false;
};


// ===============================
// ПРОВЕРКА СОСТОЯНИЯ ИГРЫ (мат/пат)
// ===============================
window.checkGameState = function () {
    let hasMoves = false;

    // Считаем ВСЕ возможные ходы
    for (let r = 0; r < 8; r++)
        for (let c = 0; c < 8; c++)
            if (window.board[r][c] && getCol(window.board[r][c]) === window.turn) {
                // ПУНКТ 5 ФИКС: Все ходы (включая спец-ходы) теперь учитываются для защиты от мата
                const ms = getMoves(r, c, true);
                if (ms.length > 0) hasMoves = true;
            }

    const isCheck = inCheck(window.turn, window.board);

    if (!hasMoves && isCheck) {
        log(`МАТ! Победили ${window.turn === 'white' ? 'Черные' : 'Белые'}`);
        document.getElementById("end-title").innerText =
            (window.turn === "white" ? "БЕЛЫМ" : "ЧЕРНЫМ") + " МАТ";
        document.getElementById("end-desc").innerText = "Король пал. Возродить армию?";

        const btnMode = document.getElementById("btn-new-mode");
        // ПУНКТ №5: Кнопка воскрешения только если еще не использовали
        btnMode.style.display = window.turn === "white"
            ? (window.whiteRevived ? "none" : "inline-flex")
            : (window.blackRevived ? "none" : "inline-flex");

        const buttons = document.getElementById("end-buttons");
        const wait = document.getElementById("winner-wait-msg");

        if (window.isOnlineActive() && window.getOnlineColor() && window.getOnlineColor() !== window.turn) {
            buttons.classList.add("hidden");
            wait.classList.remove("hidden");
        } else {
            buttons.classList.remove("hidden");
            wait.classList.add("hidden");
        }

        document.getElementById("end-modal").classList.add("active");
    }

    else if (!hasMoves && !isCheck) {
        log("ПАТ! Ничья.");
        document.getElementById("end-title").innerText = "ПАТ";
        document.getElementById("end-desc").innerText = "Ничья. Ни один игрок не может сделать ход.";

        document.getElementById("btn-new-mode").style.display = "none";
        document.getElementById("end-buttons").classList.remove("hidden");
        document.getElementById("winner-wait-msg").classList.add("hidden");

        document.getElementById("end-modal").classList.add("active");
    }

    else {
        document.getElementById("end-modal").classList.remove("active");
    }
};


// ===============================
// ЛОКАЛЬНАЯ ЛОЯЛЬНОСТЬ ПЕШЕК (ранняя версия)
// ===============================
window.checkLoyaltyLocal = function (wLoss, bLoss) {
    const lossDiff = wLoss - bLoss;

    for (let r = 0; r < 8; r++)
        for (let c = 0; c < 8; c++) {
            const p = window.board[r][c];
            if (!p || getType(p) !== "p") continue;

            let isolated = true;
            for (let dc of [-1, 1]) {
                if (onBd(r, c + dc) && window.board[r][c + dc] &&
                    getCol(window.board[r][c + dc]) === getCol(p))
                    isolated = false;
            }

            let chance = 0.1;
            if (isolated) chance += 0.2;

            if (getCol(p) === "white" && lossDiff >= 2 && Math.random() < chance) {
                window.board[r][c] = "P";
                log("ИЗМЕНА! Белая пешка перешла к черным.");
            }
            if (getCol(p) === "black" && lossDiff <= -2 && Math.random() < chance) {
                window.board[r][c] = "p";
                log("ИЗМЕНА! Черная пешка перешла к белым.");
            }
        }
};


// ===============================
// ПРОВЕРКА ДЛЯ ПОДСВЕТКИ ШАХА
// ===============================
window.isCheckSquare = function (r, c) {
    const p = window.board[r][c];
    if (!p) return false;

    const col = getCol(p);

    // Определяем символ "королевской" фигуры (учитываем Новый Режим)
    let kingSymbol = col === "white" ? "k" : "K";
    if (window.gameMode === "new_mode" && window.kingDead && col === window.newModePlayer) {
        kingSymbol = col === "white" ? "z" : "Z";
    }

    // Если в клетке стоит наш Король, проверяем, есть ли ему шах
    if (p === kingSymbol) {
        return window.inCheck(col, window.board);
    }
    return false;
};