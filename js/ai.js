// =====================================================
// AI.JS — искусственный интеллект для Chess 2.0
// =====================================================


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

    // ЛЮБОЙ СЛУЧАЙНЫЙ ХОД — как в исходном коде
    const pick = allMoves[Math.floor(Math.random() * allMoves.length)];

    // отмечаем выбранную фигуру
    selected = { r: pick.r, c: pick.c };

    // выполняем ход
    doMove(pick.mv);
};
