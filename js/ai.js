// =====================================================
// AI.JS — Minimax AI for Chess 2.0
// =====================================================

const PIECE_VALUES = {
    p: 10, n: 32, b: 33, r: 50, q: 90, k: 20000,
    h: 35, x: 35, a: 35, c: 35, z: 20000
};

const MAX_DEPTH = 3;

window.makeAIMove = function () {
    try {
        const bestMove = getBestMove(MAX_DEPTH);
        if (bestMove) {
            // Fix: AI always attacks, avoiding UI modals
            if (bestMove.mv.prop) bestMove.mv.prop = null;
            window.selected = { r: bestMove.r, c: bestMove.c };
            window.doMove(bestMove.mv);
        } else {
            window.checkGameState();
        }
    } catch (e) {
        console.error("AI Error, falling back to random:", e);
        makeRandomMove();
    }
};

function makeRandomMove() {
    const moves = getAllMoves(window.board, window.turn, window.castling);
    if (moves.length > 0) {
        const pick = moves[Math.floor(Math.random() * moves.length)];
        if (pick.mv.prop) pick.mv.prop = null;
        window.selected = { r: pick.r, c: pick.c };
        window.doMove(pick.mv);
    }
}

function getBestMove(depth) {
    const moves = getAllMoves(window.board, window.turn, window.castling);
    if (moves.length === 0) return null;

    // Capture heuristic sort
    moves.sort((a, b) => (b.mv.atk ? 1 : 0) - (a.mv.atk ? 1 : 0));

    let bestMove = null;
    let bestVal = -Infinity;
    let alpha = -Infinity;
    let beta = Infinity;

    for (const move of moves) {
        const simBoard = cloneBoard(window.board);
        const simCastling = JSON.parse(JSON.stringify(window.castling));
        applySimMove(simBoard, move.mv, move.r, move.c, simCastling);
        
        const val = minimax(simBoard, depth - 1, alpha, beta, false, window.turn, simCastling);
        if (val > bestVal) {
            bestVal = val;
            bestMove = move;
        }
        alpha = Math.max(alpha, bestVal);
    }
    return bestMove || moves[0];
}

function minimax(bd, depth, alpha, beta, isMax, aiColor, cst) {
    if (depth === 0) return evaluateBoard(bd, aiColor);

    const turn = isMax ? aiColor : (aiColor === 'white' ? 'black' : 'white');
    const moves = getAllMoves(bd, turn, cst);

    if (moves.length === 0) {
        // Safe checkmate detection
        if (isCheckSafe(turn, bd)) return isMax ? -Infinity : Infinity;
        return 0; // Stalemate
    }

    if (isMax) {
        let maxEval = -Infinity;
        for (const move of moves) {
            const newBd = cloneBoard(bd);
            const newCst = JSON.parse(JSON.stringify(cst));
            applySimMove(newBd, move.mv, move.r, move.c, newCst);
            const ev = minimax(newBd, depth - 1, alpha, beta, false, aiColor, newCst);
            maxEval = Math.max(maxEval, ev);
            alpha = Math.max(alpha, ev);
            if (beta <= alpha) break;
        }
        return maxEval;
    } else {
        let minEval = Infinity;
        for (const move of moves) {
            const newBd = cloneBoard(bd);
            const newCst = JSON.parse(JSON.stringify(cst));
            applySimMove(newBd, move.mv, move.r, move.c, newCst);
            const ev = minimax(newBd, depth - 1, alpha, beta, true, aiColor, newCst);
            minEval = Math.min(minEval, ev);
            beta = Math.min(beta, ev);
            if (beta <= alpha) break;
        }
        return minEval;
    }
}

function evaluateBoard(bd, color) {
    let score = 0;
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const p = bd[r][c];
            if (!p) continue;
            const t = window.getType(p);
            const cPiece = window.getCol(p);
            let val = PIECE_VALUES[t] || 0;
            
            // Mobility/Center bonus
            if (t === 'n' || t === 'h') val += (3 - Math.abs(r-3.5) - Math.abs(c-3.5)) * 2;
            
            score += (cPiece === color ? val : -val);
        }
    }
    return score;
}

function getAllMoves(bd, turn, cst) {
    const all = [];
    const realBd = window.board;
    const realCst = window.castling;
    window.board = bd;
    window.castling = cst;
    try {
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                if (bd[r][c] && window.getCol(bd[r][c]) === turn) {
                    const ms = window.getMoves(r, c, true);
                    for (const m of ms) {
                        all.push({ r, c, mv: m });
                    }
                }
            }
        }
    } finally {
        window.board = realBd;
        window.castling = realCst;
    }
    return all;
}

function isCheckSafe(turn, bd) {
    const real = window.board;
    window.board = bd;
    try { return window.inCheck(turn, bd); } 
    finally { window.board = real; }
}

function cloneBoard(bd) {
    return bd.map(r => [...r]);
}

function applySimMove(bd, mv, r, c, cst) {
    const p = bd[r][c];
    bd[mv.r][mv.c] = p;
    bd[r][c] = null;
    
    // Promotion
    if (window.getType(p) === 'p' && (mv.r === 0 || mv.r === 7)) {
        bd[mv.r][mv.c] = (window.getCol(p) === 'white') ? 'q' : 'Q';
    }
    // Castling
    if (mv.castle) {
        const row = mv.r;
        if (mv.castle === 'short') {
             bd[row][5] = bd[row][7]; bd[row][7] = null;
        } else {
             bd[row][3] = bd[row][0]; bd[row][0] = null;
        }
    }
    // Legion Merge
    if (mv.merge) {
        bd[mv.r][mv.c] = (window.getCol(p) === 'white' ? 'h' : 'H');
    }
    // Archon Fuse
    if (mv.fuse) {
         const isL = (mv.r + mv.c) % 2 === 0;
         bd[mv.r][mv.c] = (window.getCol(p) === 'white' ? (isL?'a':'c') : (isL?'A':'C'));
    }
}
