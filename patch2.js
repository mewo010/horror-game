const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'index.html');
let html = fs.readFileSync(file, 'utf8');

const newModelLogic = `
  // --- Procedural Player Textures ---
  function makeFaceTex() {
    const sz = 64, cv = document.createElement('canvas'); cv.width = cv.height = sz;
    const c = cv.getContext('2d');
    c.fillStyle = '#ffccaa'; c.fillRect(0,0,sz,sz); // skin
    c.fillStyle = '#000'; 
    c.fillRect(sz*0.2, sz*0.4, sz*0.15, sz*0.15); // eye L
    c.fillRect(sz*0.65, sz*0.4, sz*0.15, sz*0.15); // eye R
    c.fillRect(sz*0.35, sz*0.7, sz*0.3, sz*0.1); // mouth
    // hair
    c.fillStyle = '#4a2e15'; c.fillRect(0,0,sz,sz*0.25);
    c.fillRect(0,0,sz*0.15,sz*0.6); c.fillRect(sz*0.85,0,sz*0.15,sz*0.6);
    return new THREE.CanvasTexture(cv);
  }
  function makeSkinTex() {
    const sz = 8, cv = document.createElement('canvas'); cv.width = cv.height = sz;
    const c = cv.getContext('2d'); c.fillStyle = '#ffccaa'; c.fillRect(0,0,sz,sz);
    return new THREE.CanvasTexture(cv);
  }
  function makeShirtTex(colorHex) {
    const sz = 64, cv = document.createElement('canvas'); cv.width = cv.height = sz;
    const c = cv.getContext('2d');
    c.fillStyle = '#' + colorHex.toString(16).padStart(6, '0'); c.fillRect(0,0,sz,sz);
    c.fillStyle = 'rgba(0,0,0,0.1)';
    // wrinkles
    c.fillRect(sz*0.2, 0, sz*0.05, sz); c.fillRect(sz*0.7, 0, sz*0.05, sz);
    return new THREE.CanvasTexture(cv);
  }
  function makeJeansTex() {
    const sz = 32, cv = document.createElement('canvas'); cv.width = cv.height = sz;
    const c = cv.getContext('2d');
    c.fillStyle = '#224488'; c.fillRect(0,0,sz,sz);
    // denim texture
    for(let i=0;i<200;i++){
      c.fillStyle = \`rgba(255,255,255,\${Math.random()*0.1})\`;
      c.fillRect(Math.random()*sz, Math.random()*sz, 1, 2);
    }
    return new THREE.CanvasTexture(cv);
  }

  function createPlayerModel(colorNum) {
    const group = new THREE.Group();
    const faceTex = makeFaceTex();
    const skinTex = makeSkinTex();
    const shirtTex = makeShirtTex(colorNum);
    const jeansTex = makeJeansTex();

    // Materials
    const matHead = [
      new THREE.MeshLambertMaterial({map:skinTex}), // right
      new THREE.MeshLambertMaterial({map:skinTex}), // left
      new THREE.MeshLambertMaterial({map:skinTex}), // top
      new THREE.MeshLambertMaterial({map:skinTex}), // bottom
      new THREE.MeshLambertMaterial({map:faceTex}), // front
      new THREE.MeshLambertMaterial({map:skinTex})  // back
    ];
    const matShirt = new THREE.MeshLambertMaterial({map:shirtTex});
    const matJeans = new THREE.MeshLambertMaterial({map:jeansTex});

    // Head
    const headGeo = new THREE.BoxGeometry(0.3, 0.3, 0.3);
    const head = new THREE.Mesh(headGeo, matHead);
    head.position.set(0, 0.75, 0);
    head.castShadow = true;
    group.add(head);

    // Torso
    const torsoGeo = new THREE.BoxGeometry(0.35, 0.5, 0.15);
    const torso = new THREE.Mesh(torsoGeo, matShirt);
    torso.position.set(0, 0.35, 0);
    torso.castShadow = true;
    group.add(torso);

    // Arms
    const armGeo = new THREE.BoxGeometry(0.12, 0.45, 0.12);
    // Shift pivot to top of arm
    armGeo.translate(0, -0.225, 0);
    const armL = new THREE.Mesh(armGeo, matShirt);
    armL.position.set(-0.24, 0.6, 0);
    armL.castShadow = true;
    const armR = new THREE.Mesh(armGeo, matShirt);
    armR.position.set(0.24, 0.6, 0);
    armR.castShadow = true;
    group.add(armL); group.add(armR);

    // Legs
    const legGeo = new THREE.BoxGeometry(0.15, 0.5, 0.15);
    legGeo.translate(0, -0.25, 0);
    const legL = new THREE.Mesh(legGeo, matJeans);
    legL.position.set(-0.09, 0.1, 0);
    legL.castShadow = true;
    const legR = new THREE.Mesh(legGeo, matJeans);
    legR.position.set(0.09, 0.1, 0);
    legR.castShadow = true;
    group.add(legL); group.add(legR);

    group.userData = { armL, armR, legL, legR, walkTime: 0, lastPos: new THREE.Vector3() };
    return group;
  }
`;

// Insert the model logic before `function initScene()`
html = html.replace('function initScene() {', newModelLogic + '\n  function initScene() {');

// Replace the cylinder creation
const oldCylinder = \`const geo = new THREE.CylinderGeometry(0.2, 0.2, 0.8, 8);
          const mat = new THREE.MeshBasicMaterial({ color: playersData[id].color });
          const m = new THREE.Mesh(geo, mat);\`;
html = html.replace(oldCylinder, 'const m = createPlayerModel(playersData[id].color);');

// Fix playerMesh positioning so feet are at ground (y=0) and apply yaw
const oldPosSet = 'playerMeshes[id].position.set(pd.x, 0.4, pd.z);';
html = html.replace(oldPosSet, \`playerMeshes[id].position.set(pd.x, 0, pd.z);
          playerMeshes[id].rotation.y = pd.yaw;\`);

// Insert Animation Logic into the top of the render loop
const loopStart = 'renderer.render(scene, camera);';
const animationLogic = \`
    // Animate other players
    for (const id in playerMeshes) {
      const pm = playerMeshes[id];
      if(!pm.visible) continue;
      const distMoved = pm.position.distanceTo(pm.userData.lastPos);
      if(distMoved > 0.001) {
        pm.userData.walkTime += distMoved * 15;
      } else {
        pm.userData.walkTime *= 0.9; // decay back to standing
      }
      pm.userData.lastPos.copy(pm.position);
      
      const wt = pm.userData.walkTime;
      pm.userData.armL.rotation.x = Math.sin(wt) * 0.8;
      pm.userData.armR.rotation.x = Math.sin(wt + Math.PI) * 0.8;
      pm.userData.legL.rotation.x = Math.sin(wt + Math.PI) * 0.6;
      pm.userData.legR.rotation.x = Math.sin(wt) * 0.6;
    }
    
    renderer.render(scene, camera);
\`;
html = html.replace(loopStart, animationLogic);

fs.writeFileSync(file, html);
console.log('Patched HTML for Player Models successfully');
