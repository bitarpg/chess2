// =====================================================
// AI.JS — искусственный интеллект для Chess 2.0
// =====================================================
// ------------------------------
// ЦЕННОСТИ ФИГУР
// ------------------------------
const PIECE_VALUE = {
    p: 1,   // пешка
    n: 3,   // конь
    b: 3,   // слон
    r: 5,   // ладья
    q: 10,  // ферзь
    z: 200,
    h: 6,   // легион (конь + конь)
    a: 8,   // канцлер (ладья + слон, белопольный)
    c: 8,   // канцлер (ладья + слон, чернопольный)
    x: 3    // химера
    // короля намеренно НЕ оцениваем
};
// ------------------------------
// ОЦЕНКА МАТЕРИАЛА
// ------------------------------
function evaluateMaterial(board) {
    let score = 0;

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const p = board[r][c];
            if (!p) continue;

            const type = p.toLowerCase();
            const val = PIECE_VALUE[type];
            if (!val) continue;

            // свои фигуры — плюс, чужие — минус
            score += (getCol(p) === turn) ? val : -val;
        }
    }

    return score;
}
// ------------------------------
// ПРОВЕРКА: бьётся ли клетка фигурой противника
// ------------------------------
function isSquareAttacked(board, r, c, byColor) {
    for (let rr = 0; rr < 8; rr++) {
        for (let cc = 0; cc < 8; cc++) {
            const p = board[rr][cc];
            if (!p) continue;
            if (getCol(p) !== byColor) continue;
            const moves = withBoard(board, () => getMoves(rr, cc, false));
            if (moves.some(m => m.r === r && m.c === c)) {
                return true;
            }
        }
    }
    return false;
}
// ------------------------------
// ПРОВЕРКА: защищена ли клетка своей фигурой
// ------------------------------
function isSquareDefended(board, r, c, byColor) {
    return withBoard(board, () => {
        for (let rr = 0; rr < 8; rr++) {
            for (let cc = 0; cc < 8; cc++) {
                const p = board[rr][cc];
                if (!p) continue;
                if (getCol(p) !== byColor) continue;

                const moves = getMoves(rr, cc, false);
                if (moves.some(m => m.r === r && m.c === c)) {
                    return true;
                }
            }
        }
        return false;
    });
}

// ------------------------------
// ОЦЕНКА ПРОСТОГО РАЗМЕНА (SEE-lite)
// ------------------------------
function evaluateExchange(board, fromR, fromC, toR, toC) {
    const attacker = board[fromR][fromC];
    const target = board[toR][toC];

    if (!attacker || !target) return 0;

    const attackerType = attacker.toLowerCase();
    const targetType = target.toLowerCase();

    const attackerVal = PIECE_VALUE[attackerType] || 0;
    const targetVal = PIECE_VALUE[targetType] || 0;

    // если берём более ценную фигуру — хорошо
    return targetVal - attackerVal;
}

// ------------------------------
// МОГУТ ЛИ СЪЕСТЬ ФИГУРУ ПОСЛЕ ХОДА
// ------------------------------
function isRecapturePossible(board, r, c, byColor) {
    for (let rr = 0; rr < 8; rr++) {
        for (let cc = 0; cc < 8; cc++) {
            const p = board[rr][cc];
            if (!p) continue;
            if (getCol(p) !== byColor) continue;

            const moves = getMoves(rr, cc, false);
            if (moves.some(m => m.r === r && m.c === c)) {
                return true;
            }
        }
    }
    return false;
}
function withBoard(tempBoard, fn) {
    const oldBoard = window.board;
    window.board = tempBoard;
    try {
        return fn();
    } finally {
        window.board = oldBoard;
    }
}

function countAttackers(board, r, c, byColor) {
    let minVal = Infinity;
    let count = 0;

    return withBoard(board, () => {
        for (let rr = 0; rr < 8; rr++) {
            for (let cc = 0; cc < 8; cc++) {
                const p = board[rr][cc];
                if (!p) continue;
                if (getCol(p) !== byColor) continue;

                const moves = getMoves(rr, cc, false);
                if (moves.some(m => m.r === r && m.c === c)) {
                    count++;
                    const v = PIECE_VALUE[p.toLowerCase()] || 0;
                    if (v < minVal) minVal = v;
                }
            }
        }
        return { count, minVal };
    });
}
function findHangingPieces(board, color) {
    let result = [];

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const p = board[r][c];
            if (!p) continue;
            if (getCol(p) !== color) continue;

            const enemy = color === "white" ? "black" : "white";

            const attacked = isSquareAttacked(board, r, c, enemy);
            const defended = isSquareDefended(board, r, c, color);

            if (attacked) {
                const pieceVal = PIECE_VALUE[p.toLowerCase()] || 0;

                const attackers = countAttackers(board, r, c, enemy);
                const defenders = countAttackers(board, r, c, color);

                // угроза считается серьёзной, если:
                // 1) атакующих больше
                // 2) или самый дешёвый атакующий дешевле фигуры
                if (
                    attackers.count > defenders.count ||
                    attackers.minVal < pieceVal
                ) {
                    result.push({ r, c, piece: p });
                }
            }
        }
    }

    return result;
}
function findFreeCaptures(board, color) {
    const enemy = color === "white" ? "black" : "white";
    let captures = [];

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const p = board[r][c];
            if (!p || getCol(p) !== color) continue;

            const moves = getMoves(r, c, true);
            for (let mv of moves) {
                const target = board[mv.r][mv.c];
                if (!target) continue;

                // если цель принадлежит врагу
                if (getCol(target) !== enemy) continue;

                const snap = board.map(row => [...row]);
                snap[mv.r][mv.c] = snap[r][c];
                snap[r][c] = null;

                // если после взятия фигура НЕ под боем — это бесплатное взятие
                if (!isSquareAttacked(snap, mv.r, mv.c, enemy)) {
                    captures.push({ r, c, mv });
                }
            }
        }
    }

    return captures;
}

// Функция, вызываемая движком, когда очередь ИИ
window.makeAIMove = function () {

    // собираем все возможные ходы всех фигур ИИ
    let allMoves = [];

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {

            const p = board[r][c];
            if (!p) continue;

            // фигура принадлежит ИИ?
            if (getCol(p) !== turn) continue;

            const ms = getMoves(r, c, true);
            for (let mv of ms) {
                allMoves.push({
                    r,
                    c,
                    mv
                });
            }
        }
    }

    // Нет ходов → передаём движку проверку мата/пата
    if (allMoves.length === 0) {
        checkGameState();
        return;
    }
    // ---------------------------------
    // ПРИОРИТЕТ: БЕСПЛАТНОЕ ВЗЯТИЕ
    // ---------------------------------
    const freeCaptures = findFreeCaptures(board, turn);
    if (freeCaptures.length > 0) {
        const pick = freeCaptures[Math.floor(Math.random() * freeCaptures.length)];
        selected = { r: pick.r, c: pick.c };
        doMove(pick.mv);
        return;
    }
    const originalMoves = allMoves.slice();

    // ---------------------------------
    // ПРИОРИТЕТ: РЕАКЦИЯ НА УГРОЗУ
    // ---------------------------------
    const threatened = findHangingPieces(board, turn);

    if (threatened.length > 0) {
        // оставляем только ходы, которые спасают хотя бы одну висящую фигуру
        allMoves = allMoves.filter(m => {
            for (const t of threatened) {
                // 1. уходим этой фигурой
                if (m.r === t.r && m.c === t.c) return true;

                // 2. защищаем её
                const snapshot = board.map(row => [...row]);
                snapshot[m.mv.r][m.mv.c] = snapshot[m.r][m.c];
                snapshot[m.r][m.c] = null;

                if (isSquareDefended(snapshot, t.r, t.c, turn)) {
                    return true;
                }
            }
            return false;
        });

        // если фильтр всё выкинул — возвращаем все ходы (чтобы ИИ не завис)

        if (allMoves.length === 0) {
            allMoves = originalMoves;
        }

    }

    // ЛЮБОЙ СЛУЧАЙНЫЙ ХОД — как в исходном коде
    let bestScore = -Infinity;
    let bestMoves = [];
    let fallbackMoves = [];
    for (let m of allMoves) {
        let isBadTrade = false;

        // виртуально делаем ход
        const snapshot = board.map(row => [...row]);
        snapshot[m.mv.r][m.mv.c] = snapshot[m.r][m.c];
        snapshot[m.r][m.c] = null;

        let score = evaluateMaterial(snapshot);

        // ---------------------------------
        // ШТРАФ ЗА ПОДСТАВЛЕННУЮ ФИГУРУ
        // ---------------------------------
        const movedPiece = snapshot[m.mv.r][m.mv.c];
        if (movedPiece) {
            const myColor = getCol(movedPiece);
            const enemyColor = (myColor === "white") ? "black" : "white";

            const attacked = isSquareAttacked(snapshot, m.mv.r, m.mv.c, enemyColor);
            const defended = isSquareDefended(snapshot, m.mv.r, m.mv.c, myColor);
            // ---------------------------------
            // ЗАПРЕТ: проигранный размен по атаке/защите
            // ---------------------------------
            if (attacked) {
                const attackerInfo = countAttackers(
                    snapshot,
                    m.mv.r,
                    m.mv.c,
                    enemyColor
                );

                const defenderInfo = countAttackers(
                    snapshot,
                    m.mv.r,
                    m.mv.c,
                    myColor
                );

                const pieceVal = PIECE_VALUE[movedPiece.toLowerCase()] || 0;

                // если атакующих больше ИЛИ
                // самый дешёвый атакующий дешевле нашей фигуры
                if (
                    attackerInfo.count > defenderInfo.count ||
                    attackerInfo.minVal < pieceVal
                ) {
                    isBadTrade = true;
                }
            }

            // ---------------------------------
            // БАЗОВЫЙ ЗАПРЕТ ГЛУПОГО РАЗМЕНА
            // (взял дешёвое, сам остался под боем)
            // ---------------------------------
            //const originalTarget = board[m.mv.r][m.mv.c];

            //if (
            //    originalTarget &&   // было взятие
            //    attacked            // фигуру могут взять
            //) {
            //    const attackerVal = PIECE_VALUE[movedPiece.toLowerCase()] || 0;
            //    const targetVal = PIECE_VALUE[originalTarget.toLowerCase()] || 0;

            //    // менять более дорогую фигуру на дешёвую — запрет
            //    if (attackerVal > targetVal) {
            //        isBadTrade = true;
            //    }
            //}

        }
        // ---------------------------------
        // ШТРАФ ЗА НЕВЫГОДНЫЙ РАЗМЕН
        // ---------------------------------
        const originalTarget = board[m.mv.r][m.mv.c];
        
        if (originalTarget) {
            const exchangeScore = evaluateExchange(
                board,
                m.r, m.c,
                m.mv.r, m.mv.c
            );

            const myColor = turn;
            const enemyColor = (myColor === "white") ? "black" : "white";

            // могут ли съесть фигуру в ответ
            const recapture = isRecapturePossible(
                snapshot,
                m.mv.r,
                m.mv.c,
                enemyColor
            );

            // если размен плохой и есть ответное взятие — штрафуем
            if (recapture && exchangeScore < 0) {
                score += exchangeScore * 2;
            }
            

        }


        if (!isBadTrade) {
            if (score > bestScore) {
                bestScore = score;
                bestMoves = [m];
            } else if (score === bestScore) {
                bestMoves.push(m);
            }
        } else {
            // плохие размены — в запас
            fallbackMoves.push(m);
        }

    }
    if (bestMoves.length === 0 && fallbackMoves.length === 0) {
        fallbackMoves = allMoves;
    }
    if (fallbackMoves.length === 0) {
        fallbackMoves = allMoves;
    }


    // если несколько лучших — выбираем случайно
    const source = bestMoves.length > 0 ? bestMoves : fallbackMoves;
    const pick = source[Math.floor(Math.random() * source.length)];


    // отмечаем выбранную фигуру
    selected = { r: pick.r, c: pick.c };

    // выполняем ход
    const before = JSON.stringify(board);
    doMove(pick.mv);
    if (JSON.stringify(board) !== before) return;

};
