// =============================================================================
// RULES.JS — шахматные правила, логика ходов и механики Chess 2.0 (FULL VERSION)
// =============================================================================

/**
 * Глобальные утилиты для работы с фигурами и доской.
 * Используем window, чтобы модули engine.js и render.js имели доступ.
 */
window.getCol = p => p ? (p === p.toUpperCase() ? "black" : "white") : null;
window.getType = p => p ? p.toLowerCase() : null;
window.onBd = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
window.isLight = (r, c) => (r + c) % 2 === 0;


// =========================================================
// ПРОВЕРКА АТАКИ (ИСПОЛЬЗУЕТСЯ ДЛЯ РОКИРОВКИ И ШАХА)
// =========================================================
window.isAttacked = function (r, c, attackerCol) {
    // Клонируем доску для виртуальной проверки
    const tempBoard = window.board.map(row => [...row]);

    // Определяем "жертву" (чей это будет король для проверки шаха)
    const myCol = attackerCol === "white" ? "black" : "white";
    const oldVal = tempBoard[r][c];

    // Временно ставим виртуального короля на клетку
    tempBoard[r][c] = (myCol === "white" ? "k" : "K");

    // Проверяем, находится ли эта клетка под боем врага
    const check = window.inCheck(myCol, tempBoard);

    // Возвращаем доску в исходное состояние (необязательно для клона, но для чистоты)
    tempBoard[r][c] = oldVal;

    return check;
};


// =========================================================
// ГЕНЕРАЦИЯ ВСЕХ ВОЗМОЖНЫХ ХОДОВ ФИГУРЫ
// =========================================================
window.getMoves = function (r, c, safe = true) {
    const p = window.board[r][c];
    if (!p) return [];

    const col = getCol(p);
    const type = getType(p);
    const m = [];

    // Базовые направления
    const dirs = [
        [0, 1], [0, -1], [1, 0], [-1, 0],        // Прямые (ладья)
        [1, 1], [1, -1], [-1, 1], [-1, -1]       // Диагонали (слон)
    ];

    // Ходы коня (малые Г)
    const kn = [
        [2, 1], [2, -1], [-2, 1], [-2, -1],
        [1, 2], [1, -2], [-1, 2], [-1, -2]
    ];

    // Ходы Легиона (большие Г)
    const bigKn = [
        [4, 1], [4, -1], [-4, 1], [-4, -1],
        [1, 4], [1, -4], [-1, 4], [-1, -4]
    ];

    // -----------------------------------------------------
    // ЛОГИКА ПЕШКИ (P)
    // -----------------------------------------------------
    if (type === "p") {
        const d = col === "white" ? -1 : 1;
        const start = col === "white" ? 6 : 1;

        // Ход вперед на 1
        if (onBd(r + d, c) && !window.board[r + d][c]) {
            m.push({ r: r + d, c });
            // Двойной ход со старта
            if (r === start && !window.board[r + d * 2][c]) {
                m.push({ r: r + d * 2, c });
            }
        }

        // Взятие врага по диагонали
        [[d, 1], [d, -1]].forEach(([dr, dc]) => {
            if (!onBd(r + dr, c + dc)) return;
            const t = window.board[r + dr][c + dc];
            if (t && getCol(t) !== col) {
                m.push({ r: r + dr, c: c + dc, atk: true });
            }
        });
    }

    // -----------------------------------------------------
    // ЛОГИКА ЛАДЬИ (R), СЛОНА (B), ФЕРЗЯ (Q) И КАНЦЛЕРОВ (A/C)
    // -----------------------------------------------------
    if (["r", "b", "q", "a", "c"].includes(type)) {
        let myDirs = [];

        // Ладья или Ферзь
        if (type === "r" || type === "q") {
            myDirs.push(...dirs.slice(0, 4));
        }
        // Слон или Ферзь
        if (type === "b" || type === "q") {
            myDirs.push(...dirs.slice(4));
        }

        // ПУНКТ №3 ФИКС: ЛОГИКА КАНЦЛЕРОВ (АРХОНТОВ)
        // Они всегда имеют ходы Ладьи, но Слон просыпается только на своей клетке
        if (type === "a" || type === "c") {
            myDirs = [...dirs.slice(0, 4)]; // Прямые всегда активны

            // Если белопольный (a) на белом поле ИЛИ чернопольный (c) на черном поле
            const isOriginMatch = (type === "a" && isLight(r, c)) || (type === "c" && !isLight(r, c));

            if (isOriginMatch) {
                myDirs.push(...dirs.slice(4)); // Добавляем диагонали
            }
        }

        // Просчет лучей движения
        for (const [dr, dc] of myDirs) {
            let tr = r + dr, tc = c + dc;
            while (onBd(tr, tc)) {
                const t = window.board[tr][tc];

                // Слияние (Fuse) — Ладья + Слон
                if (t && getCol(t) === col) {
                    if (type === "r" && getType(t) === "b") m.push({ r: tr, c: tc, fuse: true });
                    if (type === "b" && getType(t) === "r") m.push({ r: tr, c: tc, fuse: true });
                }

                if (!t) {
                    m.push({ r: tr, c: tc });
                } else {
                    if (getCol(t) !== col) {
                        m.push({ r: tr, c: tc, atk: true });
                    }
                    break; // Фигура преграждает путь
                }
                tr += dr; tc += dc;
            }
        }
    }

    // -----------------------------------------------------
    // ЛОГИКА КОНЯ (N), ЛЕГИОНА (H) И ХИМЕРЫ (X)
    // -----------------------------------------------------
    if (["n", "h", "x"].includes(type)) {
        const addJump = (rr, cc) => {
            if (!onBd(rr, cc)) return;
            const t = window.board[rr][cc];

            // Специальный дипломатический ход (Конь на коня)
            if (type === "n" && t && getType(t) === "n" && getCol(t) !== col) {
                m.push({ r: rr, c: cc, atk: true, prop: "chimera" });
                return;
            }

            // Обычный прыжок
            if (!t || getCol(t) !== col) {
                m.push({ r: rr, c: cc, atk: !!t });
            }

            // Слияние в Легион (Конь на союзного коня)
            if (type === "n" && t && getCol(t) === col && getType(t) === "n") {
                m.push({ r: rr, c: cc, merge: true });
            }
        };

        // Конь и Химера прыгают как N
        if (type === "n" || type === "x") {
            for (const [dr, dc] of kn) addJump(r + dr, c + dc);
        }
        // Легион и Химера прыгают как H
        if (type === "h" || type === "x") {
            for (const [dr, dc] of bigKn) addJump(r + dr, c + dc);
        }
    }

    // -----------------------------------------------------
    // ЛОГИКА КОРОЛЯ (K) И ТЯЖЕЛОГО ФЕРЗЯ (Z)
    // -----------------------------------------------------
    if (type === "k" || type === "z") {
        for (const [dr, dc] of dirs) {
            if (!onBd(r + dr, c + dc)) continue;
            const t = window.board[r + dr][c + dc];
            if (!t || getCol(t) !== col) {
                m.push({ r: r + dr, c: c + dc, atk: !!t });
            }
        }

        // Рокировка (доступна только живому Королю)
        if (safe && type === "k") {
            const row = col === "white" ? 7 : 0;
            if (!window.inCheck(col, window.board)) {
                const opp = col === "white" ? "black" : "white";

                // Короткая
                const rS = window.board[row][7];
                if (window.castling[col].k && window.castling[col].r && rS && getType(rS) === "r") {
                    if (!window.board[row][5] && !window.board[row][6] &&
                        !isAttacked(row, 5, opp) && !isAttacked(row, 6, opp)) {
                        m.push({ r: row, c: 6, castle: "short" });
                    }
                }
                // Длинная
                const rL = window.board[row][0];
                if (window.castling[col].k && window.castling[col].l && rL && getType(rL) === "r") {
                    if (!window.board[row][1] && !window.board[row][2] && !window.board[row][3] &&
                        !isAttacked(row, 3, opp) && !isAttacked(row, 2, opp)) {
                        m.push({ r: row, c: 2, castle: "long" });
                    }
                }
            }
        }
    }

    // -----------------------------------------------------
    // ФИЛЬТРАЦИЯ: НЕЛЬЗЯ РУБИТЬ МОНАРХОВ
    // -----------------------------------------------------
    const finalMoves = [];
    for (let mv of m) {
        const targetP = window.board[mv.r][mv.c];
        if (targetP) {
            const tType = getType(targetP);
            const tCol = getCol(targetP);

            // Короля рубить нельзя никогда
            if (tType === "k") continue;

            // Тяжелого ферзя нельзя рубить, если он сейчас заменяет короля
            const isTargetZActingKing = (window.gameMode === "new_mode" && tType === "z" && tCol === window.newModePlayer);
            if (isTargetZActingKing) continue;
        }
        finalMoves.push(mv);
    }

    // Если safe=false, возвращаем грязный список (для inCheck)
    if (!safe) return finalMoves;

    // Проверка на шах после хода (чтобы не подставиться)
    const legal = [];
    for (const mv of finalMoves) {
        const tmp = window.board.map(row => [...row]);
        tmp[mv.r][mv.c] = tmp[r][c];
        tmp[r][c] = null;
        if (!window.inCheck(col, tmp)) legal.push(mv);
    }
    return legal;
};


// =========================================================
// ПРОВЕРКА ШАХА (СИНХРОНИЗИРОВАНО)
// =========================================================
window.inCheck = function (col, bd) {
    let kr = -1, kc = -1;

    // ПУНКТ №1: Определение цели защиты
    // Если игрок воскрес (Revived), мы ищем Heavy Queen (z/Z). Иначе ищем Короля.
    let kingSymbol = (col === "white") ? "k" : "K";
    const isPlayerRevived = (col === "white" ? window.whiteRevived : window.blackRevived);

    if (window.gameMode === "new_mode" && isPlayerRevived) {
        kingSymbol = (col === "white") ? "z" : "Z";
    }

    // Ищем координаты цели на доске
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if (bd[r][c] === kingSymbol) {
                kr = r; kc = c;
                break;
            }
        }
        if (kr !== -1) break;
    }

    // Если цель не найдена (срублена), считаем что шах есть
    if (kr === -1) return true;

    const opp = col === "white" ? "black" : "white";

    // 1. Атаки пешек
    const pD = (opp === "white") ? 1 : -1;
    for (let dc of [-1, 1]) {
        let pr = kr + pD, pc = kc + dc;
        if (onBd(pr, pc) && bd[pr][pc] && getCol(bd[pr][pc]) === opp && getType(bd[pr][pc]) === "p") return true;
    }

    // 2. Кони и Химеры
    const knS = [[2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [1, -2], [-1, 2], [-1, -2]];
    for (let [dr, dc] of knS) {
        const rr = kr + dr, cc = kc + dc;
        if (onBd(rr, cc) && bd[rr][cc] && getCol(bd[rr][cc]) === opp) {
            const t = getType(bd[rr][cc]);
            if (t === "n" || t === "x") return true;
        }
    }

    // 3. Легионы (Большие кони)
    const knB = [[4, 1], [4, -1], [-4, 1], [-4, -1], [1, 4], [1, -4], [-1, 4], [-1, -4]];
    for (let [dr, dc] of knB) {
        const rr = kr + dr, cc = kc + dc;
        if (onBd(rr, cc) && bd[rr][cc] && getCol(bd[rr][cc]) === opp) {
            const t = getType(bd[rr][cc]);
            if (t === "h" || t === "x") return true;
        }
    }

    // 4. Линии (Ладьи, Ферзи, Канцлеры, Тяжелые Ферзи)
    const rookDirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (let [dr, dc] of rookDirs) {
        let rr = kr + dr, cc = kc + dc;
        while (onBd(rr, cc)) {
            const p = bd[rr][cc];
            if (p) {
                if (getCol(p) === opp && ["r", "q", "z", "a", "c"].includes(getType(p))) return true;
                break;
            }
            rr += dr; cc += dc;
        }
    }

    // 5. Диагонали
    const diag = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
    for (let [dr, dc] of diag) {
        let rr = kr + dr, cc = kc + dc;
        while (onBd(rr, cc)) {
            const p = bd[rr][cc];
            if (p) {
                if (getCol(p) === opp) {
                    const t = getType(p);
                    if (t === "b" || t === "q" || t === "z") return true;
                    // Архонты атакуют только на своих цветах по диагонали
                    if (t === "a" && isLight(rr, cc)) return true;
                    if (t === "c" && !isLight(rr, cc)) return true;
                }
                break;
            }
            rr += dr; cc += dc;
        }
    }

    // 6. Короли (нельзя подходить вплотную)
    for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const rr = kr + dr, cc = kc + dc;
            if (onBd(rr, cc) && bd[rr][cc] && getCol(bd[rr][cc]) === opp && getType(bd[rr][cc]) === "k") return true;
        }

    return false;
};


// =========================================================
// ПРОВЕРКА СОСТОЯНИЯ ИГРЫ (МАТ / ПАТ)
// =========================================================
window.checkGameState = function () {
    let hasMoves = false;

    // Считаем абсолютно все возможные ходы текущего игрока
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if (window.board[r][c] && getCol(window.board[r][c]) === window.turn) {
                // ПУНКТ №1 ФИКС: Учитываем все типы ходов, включая слияния и союзы.
                // Если хоть один ход есть — мата нет.
                const ms = getMoves(r, c, true);
                if (ms.length > 0) {
                    hasMoves = true;
                    break;
                }
            }
        }
        if (hasMoves) break;
    }

    const isCheck = inCheck(window.turn, window.board);

    // Логика завершения
    if (!hasMoves) {
        if (isCheck) {
            log(`МАТ! Победили ${window.turn === 'white' ? 'Черные' : 'Белые'}`);
            document.getElementById("end-title").innerText = (window.turn === "white" ? "БЕЛЫМ" : "ЧЕРНЫМ") + " МАТ";

            // Проверка: можно ли воскреснуть?
            const canRevive = (window.turn === "white" ? !window.whiteRevived : !window.blackRevived);
            document.getElementById("btn-new-mode").style.display = canRevive ? "inline-flex" : "none";

            document.getElementById("end-modal").classList.add("active");
        } else {
            log("ПАТ! Ничья.");
            document.getElementById("end-title").innerText = "ПАТ";
            document.getElementById("btn-new-mode").style.display = "none";
            document.getElementById("end-modal").classList.add("active");
        }
    } else {
        // Если ходы есть, окно должно быть скрыто
        document.getElementById("end-modal").classList.remove("active");
    }
};


// =========================================================
// ЛОКАЛЬНАЯ ЛОЯЛЬНОСТЬ ПЕШЕК
// =========================================================
window.checkLoyaltyLocal = function (wLoss, bLoss) {
    const lossDiff = wLoss - bLoss;

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const p = window.board[r][c];
            if (!p || getType(p) !== "p") continue;

            // Проверка изоляции
            let isolated = true;
            for (let dc of [-1, 1]) {
                if (onBd(r, c + dc) && window.board[r][c + dc] &&
                    getCol(window.board[r][c + dc]) === getCol(p)) {
                    isolated = false;
                }
            }

            let chance = 0.1;
            if (isolated) chance += 0.2;

            // Измена белой пешки
            if (getCol(p) === "white" && lossDiff >= 2 && Math.random() < chance) {
                window.board[r][c] = "P";
                log("ИЗМЕНА! Белая пешка перешла к черным.");
            }
            // Измена черной пешки
            if (getCol(p) === "black" && lossDiff <= -2 && Math.random() < chance) {
                window.board[r][c] = "p";
                log("ИЗМЕНА! Черная пешка перешла к белым.");
            }
        }
    }
};


// =========================================================
// ПОДСВЕТКА ШАХА (ДЛЯ РЕНДЕРА)
// =========================================================
window.isCheckSquare = function (r, c) {
    const p = window.board[r][c];
    if (!p) return false;

    const col = getCol(p);

    // Определяем символ монарха для подсветки
    let kingSymbol = col === "white" ? "k" : "K";
    const isPlayerRevived = (col === "white" ? window.whiteRevived : window.blackRevived);

    if (window.gameMode === "new_mode" && isPlayerRevived) {
        kingSymbol = col === "white" ? "z" : "Z";
    }

    // Если в этой клетке стоит наш монарх, проверяем шах
    if (p === kingSymbol) {
        return window.inCheck(col, window.board);
    }
    return false;
};