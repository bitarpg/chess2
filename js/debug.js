
// debug.js - Admin & Debug Mode
// Activated by 'debug' in console or pressing '`' (Backtick)

(function () {
    console.log("Debug Module Loaded. Type '`' (Backtick) to toggle Admin Panel.");

    let debugMode = false;
    let selectedTool = 'inspect'; // inspect, paint, origin, color

    // --- UI Creation ---
    const debugPanel = document.createElement('div');
    debugPanel.id = 'debug-panel';
    debugPanel.style.cssText = `
        position: fixed; top: 10px; right: 10px; width: 300px;
        background: rgba(0, 0, 0, 0.9); border: 1px solid #0f0; color: #0f0;
        font-family: monospace; padding: 10px; z-index: 10000;
        display: none; box-shadow: 0 0 10px #0f0;
    `;
    debugPanel.innerHTML = `
        <h3 style="margin:0 0 10px 0; border-bottom: 1px solid #0f0;">ADMIN MODE</h3>
        
        <div style="margin-bottom: 10px;">
            <strong>Tools:</strong><br>
            <button onclick="window.setDebugTool('inspect')" class="dbg-btn">[?] Inspect</button>
            <button onclick="window.setDebugTool('paint')" class="dbg-btn">[P] Paint Piece</button>
            <button onclick="window.setDebugTool('color')" class="dbg-btn">[C] Flip Color</button>
            <button onclick="window.setDebugTool('origin')" class="dbg-btn">[O] Toggle Origin</button>
        </div>

        <div style="margin-bottom: 10px;">
            <strong>Paint Brush:</strong>
            <select id="debug-brush-type" style="background:#000; color:#0f0; border:1px solid #0f0;">
                <option value="p">Pawn</option>
                <option value="n">Knight</option>
                <option value="b">Bishop</option>
                <option value="r">Rook</option>
                <option value="q">Queen</option>
                <option value="k">King</option>
                <option value="x">Chimera</option>
                <option value="z">Heavy Queen</option>
                <option value="NULL">Eraser (Empty)</option>
            </select>
            <select id="debug-brush-col" style="background:#000; color:#0f0; border:1px solid #0f0;">
                <option value="white">White</option>
                <option value="black">Black</option>
            </select>
        </div>

        <div style="margin-bottom: 10px;">
            <strong>Scenarios:</strong><br>
            <button onclick="window.loadScenario('traitor')" class="dbg-btn">Traitor Check</button>
            <button onclick="window.loadScenario('chimera')" class="dbg-btn">Chimera Test</button>
        </div>
        
        <div style="margin-bottom: 10px;">
            <strong>Controls:</strong><br>
            <button onclick="window.forceSwitchTurn()" class="dbg-btn">Force Turn Switch</button>
            <button onclick="window.toggleAI()" class="dbg-btn">Toggle AI</button>
        </div>

        <div id="debug-info" style="border-top:1px solid #333; padding-top:5px; font-size:10px; color:#aaa;">
            Hover over board...
        </div>

        <style>
            .dbg-btn {
                background: #003300; color: #0f0; border: 1px solid #060;
                cursor: pointer; font-size: 10px; padding: 2px 5px; margin: 1px;
            }
            .dbg-btn:hover { background: #005500; }
        </style>
    `;
    document.body.appendChild(debugPanel);

    // --- Logic ---
    window.toggleDebug = function () {
        debugMode = !debugMode;
        debugPanel.style.display = debugMode ? 'block' : 'none';
        console.log(`Debug Mode: ${debugMode}`);
    };

    window.setDebugTool = function (tool) {
        selectedTool = tool;
        console.log(`Tool: ${tool}`);
    };

    window.forceSwitchTurn = function () {
        window.turn = window.turn === 'white' ? 'black' : 'white';
        window.updateUI(); // Was updateTurnIndicator
        console.log(`Turn forced to: ${window.turn}`);
    };

    window.toggleAI = function () {
        window.aiEnabled = !window.aiEnabled;
        console.log(`AI Enabled: ${window.aiEnabled}`);
    };

    // --- Scenario Loader ---
    window.loadScenario = function (type) {
        if (!confirm("This will reset the board. Continue?")) return;

        // Clear board
        for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) window.board[r][c] = null;

        if (type === 'traitor') {
            // White King at turn
            window.board[7][4] = 'K';
            // Black Traitor Pawn (Origin White) next to King
            window.board[6][4] = { type: 'P', origin: 'white' };
            window.turn = 'black'; // Let Black move to try to capture King
            console.log("Scenario Loaded: Traitor's Dilemma. Black (Traitor) to move. Should NOT be able to capture King.");
        } else if (type === 'chimera') {
            window.board[7][4] = 'K';
            window.board[0][4] = 'k';
            // Chimera in middle
            window.board[4][4] = { type: 'x', origin: 'white' }; // Or standard chimera logic
            console.log("Scenario Loaded: Chimera Test.");
        } else if (type === 'sandbox') {
            window.board[7][4] = 'K';
            window.board[0][4] = 'k';
            console.log("Scenario Loaded: Sandbox (K vs K). Draw/Stalemate state, but free for edits.");
        }

        window.render(); // Was renderBoard
        window.updateUI(); // Was updateTurnIndicator
    };

    // --- Input Handling ---
    document.addEventListener('keydown', (e) => {
        if (e.key === '`' || e.key === '~') {
            window.toggleDebug();
        }
    });

    // Attach click listener to cells (via delegation on container)
    // We need to wait for container 
    setTimeout(() => {
        const container = document.getElementById('board'); // Cells are attached to #board, not #cells-container
        if (!container) return;

        container.addEventListener('mousedown', (e) => {
            if (!debugMode) return;
            // Find coords
            // This part assumes we can calculate R/C from element or mouse position.
            // Since cells are divs in grid, let's find the target cell.
            let target = e.target;
            while (target && !target.dataset.r) {
                target = target.parentElement;
                if (target === container) return; // Clicked gap?
            }
            if (!target) return;

            const r = parseInt(target.dataset.r);
            const c = parseInt(target.dataset.c);

            handleDebugClick(r, c, e);
            e.stopPropagation();
            e.preventDefault();
        }, true); // Capture phase to override game logic?

        // Hover inspection
        container.addEventListener('mousemove', (e) => {
            if (!debugMode) return;
            let target = e.target;
            while (target && !target.dataset.r) {
                target = target.parentElement;
                if (target === container) return;
            }
            if (target) {
                const r = parseInt(target.dataset.r);
                const c = parseInt(target.dataset.c);
                const p = window.board[r][c];
                const infoDiv = document.getElementById('debug-info');
                if (p) {
                    const isObj = typeof p === 'object';
                    infoDiv.innerHTML = `
                        Pos: [${r}, ${c}]<br>
                        Type: ${window.getType(p)}<br>
                        Color: ${window.getCol(p)}<br>
                        Origin: ${isObj ? p.origin : 'N/A'}<br>
                        Raw: ${JSON.stringify(p)}
                     `;
                } else {
                    infoDiv.innerHTML = `Pos: [${r}, ${c}]<br>Empty`;
                }
            }
        });

    }, 1000);

    function handleDebugClick(r, c, e) {
        const p = window.board[r][c];

        if (selectedTool === 'inspect') {
            console.log('Inspecting:', p);
        }
        else if (selectedTool === 'paint') {
            const type = document.getElementById('debug-brush-type').value;
            const col = document.getElementById('debug-brush-col').value;
            if (type === 'NULL') {
                window.board[r][c] = null;
            } else {
                // Determine case based on color if string
                // But we want to support objects.
                // Let's make EVERYTHING an object if painted, to be safe?
                // Or stick to game logic: 'P' is Pawn.
                // Базовая логика: Uppercase = Black, Lowercase = White
                let char = (col === 'black') ? type.toUpperCase() : type.toLowerCase();

                // Для пешек и спец-фигур создаем объекты с Origin
                // Список спецфигур: p (пешка), x (химера), h (легион), a (архонт), z (тяж.ферзь)
                const specials = ['p', 'x', 'h', 'a', 'z', 'c'];

                if (specials.includes(type.toLowerCase())) {
                    window.board[r][c] = { type: char, origin: col };
                } else {
                    // Обычные фигуры (K, Q, R, B, N) — просто строки
                    window.board[r][c] = char;
                }
            }
        }
        else if (selectedTool === 'color') {
            if (!p) return;
            // Toggle color
            const oldCol = window.getCol(p);
            const newCol = oldCol === 'white' ? 'black' : 'white';
            const type = window.getType(p);

            if (typeof p === 'object') {
                // Flip type case (visual color)
                p.type = (newCol === 'black') ? p.type.toUpperCase() : p.type.toLowerCase();
                // Also flip origin to make it a loyal piece of the new color by default
                // (Use 'Toggle Origin' tool to make it a traitor)
                if (p.origin) p.origin = newCol;
            } else {
                // String pieces: Switch case
                window.board[r][c] = newCol === 'black' ? p.toUpperCase() : p.toLowerCase();
            }
        }
        else if (selectedTool === 'origin') {
            if (typeof p === 'object' && p.origin) {
                p.origin = p.origin === 'white' ? 'black' : 'white';
                console.log(`Origin switched to ${p.origin}`);
            } else if (p) {
                // Convert string to object and add origin
                const col = window.getCol(p);
                const type = window.getType(p);
                // Only relevant for Pawns usually, but let's allow any
                window.board[r][c] = { type: type.toUpperCase(), origin: col === 'white' ? 'black' : 'white' }; // Switch actual origin
            }
        }

        window.render(); // Was renderBoard
    }

})();
