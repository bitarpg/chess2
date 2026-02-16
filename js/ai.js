
// =====================================================
// AI.JS — Minimax AI for Chess 2.0 (Enhanced)
// =====================================================

const PIECE_VALUES = {
    p: 10, n: 32, b: 33, r: 50, q: 90, k: 20000,
    h: 35, x: 35, a: 35, c: 35, z: 20000
};

// Config
const AI_CONFIG = {
    checkBonus: 15,          // Reduced from 40 to prevent bad sacrifices
    mateBonus: 200000,
    centerBonus: 3,
    tropismWeight: 3         // Bonus per square closer to enemy king
};

window.makeAIMove = function () {
    const diffSelect = document.getElementById('ai-difficulty');
    const aggCheck = document.getElementById('ai-aggressive');

    const level = diffSelect ? parseInt(diffSelect.value) : 2; // 0, 1, 2, 3
    const isAggressive = aggCheck ? aggCheck.checked : false;

    // Settings map: [Depth, Randomness(0-1)]
    const settings = [
        { depth: 1, rand: 0.3 },   // Novice
        { depth: 2, rand: 0.1 },   // Amateur
        { depth: 3, rand: 0.05 },  // Pro
        { depth: 4, rand: 0.0 }    // GM (Depth 4 enabled for Max Difficulty)
    ];

    const config = settings[level];

    try {
        const bestMove = getBestMove(config.depth, config.rand, isAggressive);
        if (bestMove) {
            // Fix: remove prop if set (AI doesn't negotiate)
            if (bestMove.mv.prop) bestMove.mv.prop = null;

            window.selected = { r: bestMove.r, c: bestMove.c };
            window.doMove(bestMove.mv);
        } else {
            window.checkGameState();
        }
    } catch (e) {
        console.error('AI Error:', e);
        window.selected = null;
        // Fallback
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

function getBestMove(depth, randomness, aggressive) {
    const moves = getAllMoves(window.board, window.turn, window.castling);
    if (moves.length === 0) return null;

    // Sorting moves for alpha-beta pruning efficiency
    // Prioritize captures and checks
    moves.sort((a, b) => {
        let scA = (a.mv.atk ? 10 : 0);
        let scB = (b.mv.atk ? 10 : 0);
        return scB - scA;
    });

    let bestMove = null;
    let bestVal = -Infinity;
    let alpha = -Infinity;
    let beta = Infinity;

    // Randomness: Shuffle top moves slightly?
    // Or just pick sub-optimal move based on chance?
    // Let's use simple logic: if Math.random < randomness, pick random legal move.
    if (Math.random() < randomness) {
        return moves[Math.floor(Math.random() * moves.length)];
    }

    for (const move of moves) {
        const simBoard = cloneBoard(window.board);
        const simCastling = JSON.parse(JSON.stringify(window.castling));
        applySimMove(simBoard, move.mv, move.r, move.c, simCastling);

        // Pass 'aggressive' flag down
        const val = minimax(simBoard, depth - 1, alpha, beta, false, window.turn, simCastling, aggressive);

        if (val > bestVal) {
            bestVal = val;
            bestMove = move;
        }
        alpha = Math.max(alpha, bestVal);
    }

    return bestMove || moves[0];
}

function minimax(bd, depth, alpha, beta, isMax, aiColor, cst, aggressive) {
    // Checkmate / Stalemate detection at leaf or max depth
    const turn = isMax ? aiColor : (aiColor === 'white' ? 'black' : 'white');

    if (depth === 0) {
        return evaluateBoard(bd, aiColor, aggressive, turn);
    }

    const moves = getAllMoves(bd, turn, cst);

    if (moves.length === 0) {
        if (isCheckSafe(turn, bd)) {
            // Checkmate
            // Prefer faster mates (depth helps)
            return isMax ? -AI_CONFIG.mateBonus - depth : AI_CONFIG.mateBonus + depth;
        }
        return 0; // Stalemate
    }

    if (isMax) {
        let maxEval = -Infinity;
        for (const move of moves) {
            const newBd = cloneBoard(bd);
            const newCst = JSON.parse(JSON.stringify(cst));
            applySimMove(newBd, move.mv, move.r, move.c, newCst);
            const ev = minimax(newBd, depth - 1, alpha, beta, false, aiColor, newCst, aggressive);
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
            const ev = minimax(newBd, depth - 1, alpha, beta, true, aiColor, newCst, aggressive);
            minEval = Math.min(minEval, ev);
            beta = Math.min(beta, ev);
            if (beta <= alpha) break;
        }
        return minEval;
    }
}

function evaluateBoard(bd, color, aggressive, turn) {
    let score = 0;

    // Aggression Multiplier
    const aggMult = aggressive ? 1.2 : 1.0;
    const enemyColor = (color === 'white' ? 'black' : 'white');

    let enemyKingPos = null;
    const myAttackingPieces = []; // Stores {r, c}

    // 1. Material & Position
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const p = bd[r][c];
            if (!p) continue;

            const t = window.getType(p);
            const cPiece = window.getCol(p);
            let val = PIECE_VALUES[t] || 0;

            // Bonuses
            // Mobility/Center (Knights, Legion, Pawn)
            if (['n', 'h', 'p', 'x', 'a', 'c'].includes(t)) {
                // Distance from center (3.5, 3.5)
                const distCode = Math.abs(r - 3.5) + Math.abs(c - 3.5);
                val += (5 - distCode) * AI_CONFIG.centerBonus;
            }

            if (cPiece === color) {
                score += val;
                // Track for Tropism (exclude King)
                if (t !== 'k' && t !== 'z') myAttackingPieces.push({ r, c });
            } else {
                score -= val;
                // Track Enemy King
                if (t === 'k' || t === 'z') enemyKingPos = { r, c };
            }
        }
    }

    // 1.5 King Tropism (Attacking Closeness)
    if (aggressive && enemyKingPos) {
        let tropismScore = 0;
        for (const p of myAttackingPieces) {
            const dist = Math.abs(p.r - enemyKingPos.r) + Math.abs(p.c - enemyKingPos.c);
            // Closer is better. Max dist is 14. 
            // Reward: (14 - dist) * weight
            tropismScore += (14 - dist) * AI_CONFIG.tropismWeight;
        }
        score += tropismScore;
    }

    // 2. Check Bonus (Aggressive only?)
    // If it is Opponent's turn and they are in Check -> Good!
    if (turn === enemyColor) {
        if (isCheckSafe(enemyColor, bd)) {
            score += AI_CONFIG.checkBonus * aggMult;
        }
    }

    return score;
}

// --- Helpers ---

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
    const piece = bd[r][c];
    if (!piece) return;

    bd[mv.r][mv.c] = piece;
    bd[r][c] = null;

    const type = window.getType(piece);
    const col = window.getCol(piece);

    // Promotion
    if (type === 'p' && (mv.r === 0 || mv.r === 7)) {
        bd[mv.r][mv.c] = (col === 'white') ? 'q' : 'Q';
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
    // En Passant
    if (mv.ep) {
        bd[r][mv.c] = null;
    }
    // Legion Merge
    if (mv.merge) {
        bd[mv.r][mv.c] = (col === 'white' ? 'h' : 'H');
    }
    // Archon Fuse
    if (mv.fuse) {
        // Assume Queen or Archon based on color/square
        const isL = (mv.r + mv.c) % 2 === 0;
        bd[mv.r][mv.c] = (col === 'white' ? (isL ? 'a' : 'c') : (isL ? 'A' : 'C'));
    }
}
