// Node8 - Puzzle Reconstruction Challenge
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ARButton } from 'three/examples/jsm/webxr/ARButton.js';

let camera, scene, renderer, controller, reticle;
let hitTestSource = null;
let hitTestSourceRequested = false;
let backgroundPlane = null;
let otter, mixer;
let puzzlePieces = [];   // 用于点击检测（子 Mesh）
let puzzleGroups = [];   // 用于完成度检测（父 Group）
let targets = [];
let draggingPiece = null;
let offset = new THREE.Vector3();
let raycaster = new THREE.Raycaster();
let mouse = new THREE.Vector2();
let puzzleCompleted = false;
let exitPosition = null;
let otterMoving = false;

const clock = new THREE.Clock();
const infoBoxEl = document.getElementById('infoBox');
const narrationEl = document.getElementById('narrationText');
const audioEl = document.getElementById('narrationAudio');
const buttonBox = document.getElementById('extraButtons');
const narrationText = `Something has changed.  
The pieces of my world—once whole—are now scattered.  
But here, among the cracks and quiet, there is a chance to mend.  
With your help, I can rebuild what was broken.  
One piece at a time.`;

init();

function init() {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera();

  const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1);
  scene.add(light);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.xr.enabled = true;
  document.body.appendChild(renderer.domElement);
  document.body.appendChild(ARButton.createButton(renderer, { requiredFeatures: ['hit-test'] }));

  controller = renderer.xr.getController(0);
  controller.addEventListener('select', onSelect);
  scene.add(controller);

  reticle = new THREE.Mesh(
    new THREE.RingGeometry(0.1, 0.12, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x00ffff })
  );
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);

  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  renderer.domElement.addEventListener('pointermove', onPointerMove);
  renderer.domElement.addEventListener('pointerup', onPointerUp);
  renderer.setAnimationLoop(render);
}

function onSelect() {
  if (!reticle.visible || otter) return;

  const position = new THREE.Vector3().setFromMatrixPosition(reticle.matrix);
  addGroundAt(position);

  const loader = new GLTFLoader();
  loader.load('/assets/models/otter.glb', (gltf) => {
    otter = gltf.scene;
    otter.scale.set(0.5, 0.5, 0.5);
    otter.position.copy(position);
    otter.rotation.y = Math.PI;
    scene.add(otter);

    if (gltf.animations.length > 0) {
      mixer = new THREE.AnimationMixer(otter);
      gltf.animations.forEach((clip) => mixer.clipAction(clip).play());
    }

    infoBoxEl.style.display = 'block';
    narrationEl.innerHTML = '';
    buttonBox.style.display = 'none';
    playNarration();

    generatePuzzle(position);
    generateExit(position);
    showPuzzlePrompt();
    createBackToMapButton();
  });

  reticle.visible = false;
}

function addGroundAt(position) {
  const loader = new THREE.TextureLoader();
  loader.load('/assets/images/node8_bg.png', (texture) => {
    const geo = new THREE.PlaneGeometry(6, 6);
    const mat = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
    backgroundPlane = new THREE.Mesh(geo, mat);
    backgroundPlane.rotation.x = -Math.PI / 2;
    backgroundPlane.position.copy(position);
    backgroundPlane.position.y -= 0.01;
    scene.add(backgroundPlane);
  });
}

function generatePuzzle(origin) {
  const loader = new GLTFLoader();

  const models = [
    { path: '/assets/models/Grass.glb' },
    { path: '/assets/models/Rock.glb' },
    { path: '/assets/models/tree.glb' }
  ];

  const radius = 1.5;          // 弧线半径（越大越平缓）
  const startAngle = -60;      // 弧线起始角度
  const endAngle = 60;         // 弧线结束角度
  const step = (endAngle - startAngle) / (models.length - 1);

  models.forEach((model, i) => {
    loader.load(model.path, (gltf) => {
      const piece = gltf.scene;
      piece.scale.set(0.3, 0.3, 0.3);

      // 🎯 目标点：放在弧线上
      const angleDeg = startAngle + step * i;
      const rad = THREE.MathUtils.degToRad(angleDeg);
      const targetX = origin.x + radius * Math.cos(rad);
      const targetZ = origin.z + radius * Math.sin(rad);

      // 初始点：比目标点往前偏移
      piece.position.set(targetX, origin.y + 0.05, targetZ + 1.5);
      piece.userData.index = i;
      piece.userData.locked = false;
      scene.add(piece);

      puzzleGroups.push(piece);

      // 保存子 Mesh 用于点击
      piece.traverse((child) => {
        if (child.isMesh) {
          child.userData.parentPiece = piece;
          child.userData.index = i;
          puzzlePieces.push(child);
        }
      });

      // ✅ 绿色框
      const bbox = new THREE.Box3().setFromObject(piece);
      const size = new THREE.Vector3();
      bbox.getSize(size);

      const targetGeo = new THREE.BoxGeometry(size.x, size.y, size.z);
      const edges = new THREE.EdgesGeometry(targetGeo);
      const target = new THREE.LineSegments(
        edges,
        new THREE.LineBasicMaterial({ color: 0x00ff00, linewidth: 2, transparent: true, opacity: 0.6 })
      );
      target.position.set(targetX, origin.y + 0.01, targetZ);
      scene.add(target);
      targets.push(target);
    });
  });
}

function generateExit(origin) {
  const circle = new THREE.Mesh(
    new THREE.RingGeometry(0.2, 0.3, 32),
    new THREE.MeshBasicMaterial({ color: 0x00ff00, side: THREE.DoubleSide, transparent: true, opacity: 0.5 })
  );
  circle.rotation.x = -Math.PI / 2;
  circle.position.set(origin.x, origin.y + 0.01, origin.z - 2.5);
  scene.add(circle);
  exitPosition = circle.position.clone();
}

// ✅ 逐字旁白 + Fact 按钮
function playNarration() {
  const chars = narrationText.split('');
  const delay = 60;
  let index = 0;

  function revealNextChar() {
    if (index >= chars.length) {
      audioEl.onended = () => {
        const btn = document.createElement('button');
        btn.textContent = 'Why is memory important?';
        btn.onclick = () => {
          showPopup(
            "Puzzle & Habitat",
            "When habitats are broken into pieces, otters struggle to survive. Rebuilding connections helps restore balance in their ecosystem."
          );
        };
        buttonBox.innerHTML = '';
        buttonBox.appendChild(btn);
        buttonBox.style.display = 'block';
      };
      return;
    }

    const span = document.createElement('span');
    span.className = 'char';
    span.innerHTML = chars[index] === ' ' ? '&nbsp;' : chars[index];
    narrationEl.appendChild(span);
    index++;
    setTimeout(revealNextChar, delay);
  }

  audioEl.play();
  revealNextChar();
}

// ✅ 拖动逻辑
function onPointerDown(event) {
  if (!otter || puzzleCompleted) return;

  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(puzzlePieces, true);
  if (intersects.length > 0) {
    const mesh = intersects[0].object;
    draggingPiece = mesh.userData.parentPiece || mesh;
    offset.copy(intersects[0].point).sub(draggingPiece.position);
  }
}

function onPointerMove(event) {
  if (!draggingPiece) return;

  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObject(backgroundPlane);
  if (intersects.length > 0) {
    const point = intersects[0].point.clone().sub(offset);
    draggingPiece.position.x = point.x;
    draggingPiece.position.z = point.z;
  }
}

function onPointerUp() {
  if (draggingPiece) {
    const i = draggingPiece.userData.index;
    const target = targets[i];
    const dist = draggingPiece.position.distanceTo(target.position);

    if (dist < 2) {
      draggingPiece.position.copy(target.position);

      // ✅ 确保是 Group 标记 locked
      draggingPiece.userData.locked = true;
    }

    draggingPiece = null;

    // ✅ 用 puzzleGroups 检查完成
    const allLocked = puzzleGroups.every(g => g.userData.locked === true);
    if (allLocked && !puzzleCompleted) {
      puzzleCompleted = true;
      console.log("✅ Puzzle complete, otter should move now!");
      startOtterMovement();
    }
  }
}

function startOtterMovement() {
  otterMoving = true;
}

function render(_, frame) {
  const delta = clock.getDelta();
  if (mixer) mixer.update(delta);

  if (otter && otterMoving) {
    const direction = new THREE.Vector3().subVectors(exitPosition, otter.position);
    const distance = direction.length();
    if (distance > 0.03) {
      direction.normalize();
      otter.position.addScaledVector(direction, delta * 0.3);
      otter.lookAt(exitPosition);
    } else {
      otterMoving = false;
      showNextButton();
    }
  }

  if (frame && hitTestSource) {
    const referenceSpace = renderer.xr.getReferenceSpace();
    const hits = frame.getHitTestResults(hitTestSource);
    if (hits.length > 0) {
      const pose = hits[0].getPose(referenceSpace);
      reticle.visible = true;
      reticle.matrix.fromArray(pose.transform.matrix);
    } else {
      reticle.visible = false;
    }
  }

  if (!hitTestSourceRequested) {
    const session = renderer.xr.getSession();
    if (session) {
      session.requestReferenceSpace('viewer').then(refSpace => {
        session.requestHitTestSource({ space: refSpace }).then(source => {
          hitTestSource = source;
        });
      });
      session.addEventListener('end', () => {
        hitTestSource = null;
        hitTestSourceRequested = false;
      });
      hitTestSourceRequested = true;
    }
  }

  renderer.render(scene, camera);
}

function showNextButton() {
  const btn = document.createElement('button');
  btn.textContent = '→ Enter Node 9';
  Object.assign(btn.style, {
    position: 'absolute',
    bottom: '20px',
    right: '20px',
    zIndex: '1000',
    background: 'rgba(0,100,0,0.7)',
    color: '#fff',
    border: 'none',
    padding: '10px 16px',
    borderRadius: '8px',
    fontSize: '14px'
  });
  btn.onclick = () => window.location.href = '/node9.html';
  document.body.appendChild(btn);
}

function createBackToMapButton() {
  const button = document.createElement('button');
  button.textContent = '← Back to Map';
  Object.assign(button.style, {
    position: 'absolute',
    bottom: '20px',
    left: '20px',
    zIndex: '1000',
    background: 'rgba(0,0,0,0.6)',
    color: '#fff',
    border: 'none',
    padding: '10px 16px',
    borderRadius: '8px',
    fontSize: '14px',
    cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
  });
  button.onclick = () => window.location.href = '/index.html';
  document.body.appendChild(button);
}

// ✅ 拖动提示框
function showPuzzlePrompt() {
  const prompt = document.createElement('div');
  prompt.id = 'dragPrompt';
  Object.assign(prompt.style, {
    position: 'absolute',
    bottom: '80px',
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'rgba(0,0,0,0.75)',
    color: '#fff',
    padding: '6px 16px',
    borderRadius: '8px',
    fontSize: '14px',
    zIndex: '1000',
    maxWidth: '80%',
    textAlign: 'center',
  });
  prompt.innerText = 'Drag puzzle blocks to help the otter rebuild.';
  document.body.appendChild(prompt);
}

// ✅ Popup
function showPopup(title, body) {
  const overlay = document.getElementById('popupOverlay');
  const textEl = document.getElementById('popupText');
  if (overlay && textEl) {
    textEl.innerHTML = `<h2>${title}</h2><p>${body}</p>`;
    overlay.style.display = 'flex';
  }
}