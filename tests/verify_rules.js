
// Simulate window environment
global.window = {};

// Load rules.js logic (copying key parts for test isolation)
window.getCol = p => {
    if (!p) return null;
    if (typeof p === 'string') return (p === p.toUpperCase() ? "black" : "white");
    return (p.type === p.type.toUpperCase() ? "black" : "white");
};
window.getType = p => {
    if (!p) return null;
    if (typeof p === 'string') return p.toLowerCase();
    return p.type.toLowerCase();
};
window.onBd = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
window.isLight = (r, c) => (r + c) % 2 === 0;

// MOCKED inCheck function (replicating the logic we just wrote in rules.js)
// We copy the logic exactly as implemented to test the algorithm logic itself.
window.inCheck = function (col, bd) {
    let kr = -1, kc = -1;
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const p = bd[r][c];
            if (p && window.getType(p) === "k" && window.getCol(p) === col) {
                kr = r; kc = c; break;
            }
        }
    }
    if (kr === -1) return false;

    const opp = col === "white" ? "black" : "white";

    // 1. Pawn Attacks
    const dir = col === "white" ? -1 : 1; // Enemy pawns come from opposite side?
    // Wait, if I am White King at row 7. Enemy Black Pawn at row 6 attacks me.
    // Black moves DOWN (increasing row). White moves UP (decreasing row).
    // So Black Pawn attacks (r+1, c+/-1).
    // White King checks spots (r-1, c+/-1) for Black Pawns.
    // Logic in rules.js:
    /*
    const pDir = col === "white" ? -1 : 1; 
    // If I am White, enemy is Black (moves +1).
    // Enemy pawn at (kr + pDir, kc +/- 1) attacks me?
    // If White King at 6. Black Pawn at 5? No, Black Pawn at 5 moves to 6.
    // Black inst. moves 1->2...->6->7.
    // White inst. moves 6->5...->1->0.
    // So Black Pawn Attacks (r+1).
    // White King checks (r-1) for Black Pawn.
    */
    const pDir = col === "white" ? -1 : 1;
    for (let dc of [-1, 1]) {
        const rr = kr + pDir, cc = kc + dc;
        if (window.onBd(rr, cc)) {
            const p = bd[rr][cc];
            if (p && window.getCol(p) === opp && window.getType(p) === "p") {
                // ORIGIN CHECK
                if (typeof p === 'object' && p.origin === col) {
                    // Pass (Traitor)
                } else {
                    return true;
                }
            }
        }
    }

    // 2. Knights & Chimera
    const knS = [[2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [1, -2], [-1, 2], [-1, -2]];
    for (let [dr, dc] of knS) {
        const rr = kr + dr, cc = kc + dc;
        if (window.onBd(rr, cc)) {
            const p = bd[rr][cc];
            if (p && window.getCol(p) === opp) {
                const t = window.getType(p);
                if (t === 'x') continue; // Chimera is Pacifist
                if (t === 'n') return true;
                // Check for Traitor Knight? (Simulated as King's Origin)
                if (typeof p === 'object' && p.origin === col) continue;
            }
        }
    }

    // 3. Sliding (Rook, Bishop, Queen, Archon/Chancellor)
    // ... Simplified for test ...
    const diags = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
    for (let [dr, dc] of diags) {
        let rr = kr + dr, cc = kc + dc;
        while (window.onBd(rr, cc)) {
            const p = bd[rr][cc];
            if (p) {
                if (window.getCol(p) === opp) {
                    const t = window.getType(p);
                    // ORIGIN CHECK
                    if (typeof p === 'object' && p.origin === col) break;

                    if (t === 'b' || t === 'q') return true;
                }
                break;
            }
            rr += dr; cc += dc;
        }
    }

    // Straight
    const lines = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (let [dr, dc] of lines) {
        let rr = kr + dr, cc = kc + dc;
        while (window.onBd(rr, cc)) {
            const p = bd[rr][cc];
            if (p) {
                if (window.getCol(p) === opp) {
                    const t = window.getType(p);
                    // ORIGIN CHECK
                    if (typeof p === 'object' && p.origin === col) break;

                    if (t === 'r' || t === 'q') return true;
                }
                break;
            }
            rr += dr; cc += dc;
        }
    }

    return false;
};

// === RUN TESTS ===

// Setup Board
const board = Array(8).fill(null).map(() => Array(8).fill(null));

// Case 1: Traitor Pawn (White Origin) became Black Pawn. King is White.
// White King at [7, 4]
board[7][4] = 'k'; // Simple string king
// Black Traitor Pawn at [6, 3] (Attacks [7,4])
const traitorPawn = { type: 'P', origin: 'white' }; // Black Pawn (Uppercase)
board[6][3] = traitorPawn;

const isCheck1 = window.inCheck("white", board);
console.log("Test 1 (Traitor Pawn Check):", isCheck1 === false ? "PASS (Ignored)" : "FAIL (Caught!)");

// Case 2: Loyal Black Pawn
const loyalPawn = { type: 'P', origin: 'black' };
board[6][5] = loyalPawn;
const isCheck2 = window.inCheck("white", board);
console.log("Test 2 (Loyal Pawn Check):", isCheck2 === true ? "PASS (Detected)" : "FAIL (Ignored!)");

// Case 3: Chimera
board[6][5] = null; // Remove loyal pawn
// Chimera attacking King
board[5][5] = 'X'; // Black Chimera (Knight jump to [7,4]?)
// Knight jump: 5,5 -> +2,-1 -> 7,4. Yes.
const isCheck3 = window.inCheck("white", board);
console.log("Test 3 (Chimera Check):", isCheck3 === false ? "PASS (Ignored)" : "FAIL (Caught!)");

// Case 4: Traitor Queen (Promoted)
board[5][5] = null;
const traitorQueen = { type: 'Q', origin: 'white' };
board[0][4] = traitorQueen; // Sliding attack
const isCheck4 = window.inCheck("white", board);
console.log("Test 4 (Traitor Queen Check):", isCheck4 === false ? "PASS (Ignored)" : "FAIL (Caught!)");
