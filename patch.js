const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'backrooms_nextbot.html');
let html = fs.readFileSync(file, 'utf8');

// 1. Add Socket.IO script
html = html.replace('<script src="https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js"></script>',
  '<script src="/socket.io/socket.io.js"></script>\n<script src="https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js"></script>'
);

// 2. Add Audio elements for external files
html = html.replace('<audio id="screamSound" src="scream.mp3" preload="auto"></audio>',
  `<audio id="screamSound" src="scream.mp3" preload="auto"></audio>
<audio id="walkMusic" src="walk_song.mp3" loop preload="auto"></audio>
<audio id="chaseMusic" src="chase_song.mp3" loop preload="auto"></audio>`
);

// 3. Update overlay UI for Lobbies
const newOverlay = `<div id="overlay">
    <h1>THE BACKROOMS</h1>
    <p>LEVEL 0 — MULTIPLAYER</p>
    <div style="display:flex;gap:12px;margin-top:16px;">
      <button id="hostbtn" class="lbtn" style="border:1px solid #c8a830;background:none;color:#c8a830;padding:12px 24px;font-size:14px;letter-spacing:5px;cursor:pointer;font-family:monospace;">HOST LOBBY</button>
      <input type="text" id="joinCode" placeholder="CODE" maxlength="4" style="background:#111;color:#c8a830;border:1px solid #c8a830;padding:8px;font-family:monospace;text-align:center;width:100px;font-size:14px;">
      <button id="joinbtn" class="lbtn" style="border:1px solid #c8a830;background:none;color:#c8a830;padding:12px 24px;font-size:14px;letter-spacing:5px;cursor:pointer;font-family:monospace;">JOIN LOBBY</button>
    </div>
    <div id="lobbyStatus" style="color:#c8a830;margin-top:16px;font-size:14px;letter-spacing:3px;"></div>
  </div>`;
html = html.replace(/<div id="overlay">[\s\S]*?<\/div>\s*<\/div>/, newOverlay + '\n</div>');

// 4. Update JS variables
html = html.replace('let cheatSpeed = false;', 
  `let cheatSpeed = false;\n  const socket = io();\n  let roomCode = null;\n  let myRole = 'client';\n  let otherPlayers = {};\n  let playerMeshes = {};`
);

// 5. Update monster speed and damage
html = html.replace('let monsterSpeed = 0.026;', 'let monsterSpeed = 0.032;');
html = html.replace('health = Math.max(0, health - 34);', 'health = Math.max(0, health - 50);');

// 6. Delete WebAudio logic
html = html.replace(/\/\/ ── Web Audio Sound System ──[\s\S]*?(?=function getViewW\(\))/g, `
  // Simple Audio Control
  const walkAudio = document.getElementById('walkMusic');
  const chaseAudio = document.getElementById('chaseMusic');
  walkAudio.volume = 0.4;
  chaseAudio.volume = 0;

  function playFootstep() {
    // Relying on walk_song.mp3 instead of individual footsteps for now, or you can add footstep.mp3 later.
  }
  function startAmbientDrone() {
    walkAudio.play().catch(()=>{});
  }
  function startChaseSound() {
    chaseAudio.play().catch(()=>{});
  }
  function updateChaseSound(dist) {
    const targetGain = dist < 12 ? Math.min(1.0, (12 - dist) / 10) : 0;
    chaseAudio.volume = targetGain;
    walkAudio.volume = Math.max(0, 0.4 - targetGain);
  }
  function startRandomScreams() {}
`);

// 7. Inject networking into the start of `initScene()`
html = html.replace('function initScene() {', `function initScene() {
    // Setup player meshes logic
    socket.on('update_players', (playersData) => {
      otherPlayers = playersData;
      for (const id in playersData) {
        if (id === socket.id) continue;
        if (!playerMeshes[id]) {
          const geo = new THREE.CylinderGeometry(0.2, 0.2, 0.8, 8);
          const mat = new THREE.MeshBasicMaterial({ color: playersData[id].color });
          const m = new THREE.Mesh(geo, mat);
          scene.add(m);
          playerMeshes[id] = m;
        }
        const pd = playersData[id];
        if (pd.alive) {
          playerMeshes[id].position.set(pd.x, 0.4, pd.z);
          playerMeshes[id].visible = true;
        } else {
          playerMeshes[id].visible = false;
        }
      }
      // cleanup disconnected
      for (const id in playerMeshes) {
        if (!playersData[id]) { scene.remove(playerMeshes[id]); delete playerMeshes[id]; }
      }
    });

    socket.on('monster_sync', (data) => {
      if (myRole !== 'host') {
        mx = data.x; mz = data.z;
        monsterMesh.position.set(mx, 0.55, mz);
        monsterGlow.position.set(mx, 0.55, mz);
        const mDist = Math.hypot(mx - px, mz - pz);
        monsterGlow.intensity = Math.max(0, (7 - mDist) / 7) * 2.0;
      }
    });
    
    socket.on('update_pieces', (piecesState, count) => {
      piecesCollected = count;
      document.getElementById('qtext').innerText = count < 4 ? \`Find 4 controller pieces (\${count}/4)\` : "Find the PC setup to escape!";
      document.getElementById('qtext').style.color = count < 4 ? "#fff" : "#30c855";
      piecesState.forEach((active, i) => {
        if (!active && piecesMeshes[i]) {
          piecesMeshes[i].userData.active = false;
          piecesMeshes[i].visible = false;
          piecesMeshes[i].userData.light.intensity = 0;
        }
      });
    });

    socket.on('trigger_finale', () => { if(alive && started) triggerFinale(); });
    socket.on('pc_waiting', (ready, total) => {
      document.getElementById('interact').innerText = \`Waiting for players (\${ready}/\${total})\`;
    });
`);

// 8. Sync player position at end of loop() update
html = html.replace('function loop(ts) {', `function loop(ts) {
    if (started && alive && roomCode) {
      socket.emit('update_position', roomCode, { x: px, z: pz, yaw, pitch, health, alive });
    }
`);

// 9. Host-only monster logic condition
html = html.replace('if (malerted) {', 'if (malerted && myRole === "host") {');
html = html.replace('monsterGlow.intensity = Math.max(0, (7 - dist) / 7) * 2.0;', 
  `monsterGlow.intensity = Math.max(0, (7 - dist) / 7) * 2.0;
      socket.emit('update_monster', roomCode, { x: mx, z: mz });`
);

// 10. Item collection syncing
html = html.replace('piecesCollected++;', '/* synced by server */ socket.emit("collect_piece", roomCode, piecesMeshes.indexOf(pGroup));');
html = html.replace(/document\.getElementById\('qtext'\)\.innerText = \`Find.*?\}\n/s, ''); // Remove local update, server handles it

// 11. PC Interaction Syncing
html = html.replace("if (keys['KeyE']) triggerFinale();", "if (keys['KeyE']) socket.emit('interact_pc', roomCode);");

// 12. Lobby Start Buttons
html = html.replace(/document\.getElementById\('startbtn'\)\.addEventListener\('click', \(\) => \{[\s\S]*?\}\);/, 
`
  document.getElementById('hostbtn').addEventListener('click', () => {
    socket.emit('create_room');
    document.getElementById('lobbyStatus').innerText = "CREATING LOBBY...";
  });
  document.getElementById('joinbtn').addEventListener('click', () => {
    const code = document.getElementById('joinCode').value.toUpperCase();
    if(code.length === 4) {
      socket.emit('join_room', code);
      document.getElementById('lobbyStatus').innerText = "JOINING LOBBY...";
    } else {
      document.getElementById('lobbyStatus').innerText = "ENTER 4-LETTER CODE";
    }
  });

  socket.on('role', r => myRole = r);
  socket.on('room_created', code => {
    roomCode = code;
    startGame("ROOM CODE: " + code);
  });
  socket.on('room_joined', code => {
    roomCode = code;
    startGame("JOINED: " + code);
  });
  socket.on('error', msg => document.getElementById('lobbyStatus').innerText = msg);

  function startGame(statusText) {
    document.getElementById('overlay').style.display = 'none';
    document.getElementById('questOverlay').style.opacity = 1;
    document.getElementById('entityCompass').style.display = 'flex';
    document.getElementById('lockbanner').innerText = statusText + " - CLICK TO LOCK MOUSE";
    initScene(); setupControls(); started = true;
    lastT = performance.now();
    requestAnimationFrame(loop);
    setTimeout(() => document.getElementById('gc').requestPointerLock(), 200);
    startAmbientDrone();
    startRandomScreams();
  }
`);

fs.writeFileSync(file, html);
console.log('Patched HTML successfully');
