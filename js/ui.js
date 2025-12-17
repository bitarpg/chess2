// =========================
// UI HELPERS
// =========================

// ЛОГ
window.log = function (msg) {
    const logBox = document.getElementById("log");
    if (!logBox) return;

    const line = document.createElement("div");
    line.textContent = "> " + msg;

    logBox.appendChild(line);
    logBox.scrollTop = logBox.scrollHeight;
};

// ОБНОВЛЕНИЕ UI
window.updateUI = function () {
    document.getElementById("turn-display").innerText =
        (window.turn === "white" ? "БЕЛЫЕ" : "ЧЕРНЫЕ");

    document.getElementById("mode-display").innerText =
        (window.gameMode === "classic" ? "КЛАССИКА" : "НОВЫЙ РЕЖИМ");

    document.getElementById("loyalty").innerText = window.loyalty;
};

// ПОТЕРИ ВОЙСК
window.updateLossCounters = function () {
    const pieceValue = {
        p: 1, P: 1,
        n: 3, N: 3,
        b: 3, B: 3,
        r: 5, R: 5,
        a: 8, A: 8,
        c: 8, C: 8,
        h: 6, H: 6,
        q: 10, Q: 10
    };

    const START_VALUE = 8 * 1 + 2 * 3 + 2 * 3 + 2 * 5 + 10;

    let whiteCurrent = 0;
    let blackCurrent = 0;

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const p = window.board[r][c];
            if (!p || !pieceValue[p]) continue;

            if (p === p.toUpperCase()) blackCurrent += pieceValue[p];
            else whiteCurrent += pieceValue[p];
        }
    }

    const whiteLoss = START_VALUE - whiteCurrent;
    const blackLoss = START_VALUE - blackCurrent;

    document.getElementById('loss-w').innerText = whiteLoss;
    document.getElementById('loss-b').innerText = blackLoss;
};

// МОРАЛЬ
window.updateMoraleUI = function () {
    const w = document.getElementById("morale-w");
    const b = document.getElementById("morale-b");

    w.innerText = window.whiteMorale.toFixed(1);
    b.innerText = window.blackMorale.toFixed(1);

    const colorize = (el, morale) => {
        if (morale > 6) el.style.color = "#34d399";      // зелёный
        else if (morale > 3) el.style.color = "#fbbf24"; // жёлтый
        else el.style.color = "#f87171";                 // красный
    };

    colorize(w, window.whiteMorale);
    colorize(b, window.blackMorale);
};

// =========================
// BUTTONS / UI EVENTS
// =========================

document.getElementById("btn-reload").onclick = () => location.reload();

document.getElementById("btn-ai").onclick = () => {
    window.toggleAI();
};

document.getElementById("btn-connect").onclick = () => {
    window.connectToServer();
};

document.getElementById("btn-host").onclick = () => {
    window.hostGame();
};

document.getElementById("btn-join").onclick = () => {
    window.joinGame();
};

document.getElementById("btn-restart").onclick = () => {
    window.initGame();
};

document.getElementById("btn-new-mode").onclick = () => {
    window.activateNewMode();
};

document.getElementById("btn-accept").onclick = () => {
    window.acceptProp();
};

document.getElementById("btn-decline").onclick = () => {
    window.declineProp();
};

// =========================
// MODAL CONTROL HELPERS
// =========================

window.showEndModal = function () {
    document.getElementById("end-modal").classList.add("active");
};

window.hideEndModal = function () {
    document.getElementById("end-modal").classList.remove("active");
};

window.showDipModal = function () {
    document.getElementById("dip-modal").classList.add("active");
};

window.hideDipModal = function () {
    document.getElementById("dip-modal").classList.remove("active");
};
