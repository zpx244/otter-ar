// Node6 – Trash Avoidance Challenge
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ARButton } from 'three/examples/jsm/webxr/ARButton.js';

let camera, scene, renderer, controller, reticle, otter, mixer;
let hitTestSource = null;
let hitTestSourceRequested = false;
const clock = new THREE.Clock();
let backgroundPlane = null;
let targetPosition = null;
let otterPlaced = false;
let trashBoxes = [];
let tooCloseToTrash = false;
let warningShown = false;
let exitPoint = null;
let exitReached = false;

const infoBoxEl = document.getElementById('infoBox');
const narrationEl = document.getElementById('narrationText');
const buttonBox = document.getElementById('extraButtons');
const audioEl = document.getElementById('narrationAudio');

const narrationText = `So much trash... I need to find a clean path. I cannot rest in filth. There must be space, somewhere, where I can feel safe.`;

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

  renderer.domElement.addEventListener('click', onSceneClick);
  window.addEventListener('resize', () => renderer.setSize(window.innerWidth, window.innerHeight));
  renderer.setAnimationLoop(render);
}

function resetGame() {
  if (otter) {
    scene.remove(otter);
    otter = null;
  }

  trashBoxes.forEach(t => scene.remove(t));
  trashBoxes = [];

  if (exitPoint) {
    scene.remove(exitPoint);
    exitPoint = null;
  }

  targetPosition = null;
  otterPlaced = false;
  tooCloseToTrash = false;
  warningShown = false;
  exitReached = false;

  if (document.getElementById('restartBtn')) {
    document.getElementById('restartBtn').remove();
  }
  if (document.getElementById('trashWarning')) {
    document.getElementById('trashWarning').remove();
  }
  if (document.querySelector('button[data-next]')) {
    document.querySelector('button[data-next]').remove();
  }

  infoBoxEl.style.display = 'none';
  narrationEl.innerHTML = '';
  buttonBox.style.display = 'none';
}

function addGroundAt(position) {
  const loader = new THREE.TextureLoader();
  loader.load('/assets/images/node6_bg.png', (texture) => {
    const geo = new THREE.PlaneGeometry(6, 6);
    const mat = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
    backgroundPlane = new THREE.Mesh(geo, mat);
    backgroundPlane.rotation.x = -Math.PI / 2;
    backgroundPlane.position.copy(position);
    backgroundPlane.position.y -= 0.01;
    scene.add(backgroundPlane);
  });
}

function addTrashObstacles(center) {
  trashBoxes = [];
  const loader = new GLTFLoader();

  const numTrash = 8; // ✅ 垃圾数量，可以调整
  const minZ = center.z - 0.5; // ✅ 保证不出现在水獭脚下
  const maxZ = center.z - 2.8; // ✅ 不要超出背景图范围 (前方最多 3m)
  const minX = center.x - 2.8;
  const maxX = center.x + 2.8;

  for (let i = 0; i < numTrash; i++) {
    loader.load('/assets/models/plastic_bottle.glb', (gltf) => {
      const trash = gltf.scene;
      trash.scale.set(0.1, 0.1, 0.1);

      // ✅ 随机生成位置（在背景图范围内）
      const x = THREE.MathUtils.randFloat(minX, maxX);
      const z = THREE.MathUtils.randFloat(maxZ, minZ); // 负数方向，水獭前方
      trash.position.set(x, center.y, z);

      scene.add(trash);
      trashBoxes.push(trash);
    });
  }

  // ✅ 出口在前方 2.5m，并且不超出边界
  const exitOffsetZ = -2.5;
  const exitX = THREE.MathUtils.clamp(center.x, minX, maxX);
  const exitZ = THREE.MathUtils.clamp(center.z + exitOffsetZ, maxZ, minZ);

  exitPoint = new THREE.Mesh(
    new THREE.RingGeometry(0.12, 0.18, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x00ff00 })
  );
  exitPoint.position.set(exitX, center.y + 0.01, exitZ);
  scene.add(exitPoint);
}

function onSelect() {
  if (!reticle.visible || otter) return;

  const position = new THREE.Vector3();
  position.setFromMatrixPosition(reticle.matrix);

  // ✅ 让水獭生成更靠近摄像机（往前移 0.5m）
  const camPos = new THREE.Vector3();
  camera.getWorldPosition(camPos);
  const direction = new THREE.Vector3().subVectors(position, camPos).normalize();
  position.addScaledVector(direction, -0.8); // -0.5 表示往摄像机方向拉近

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

    addTrashObstacles(position);

    infoBoxEl.style.display = 'block';
    narrationEl.innerHTML = '';
    buttonBox.style.display = 'none';

    playNarration();
    showPrompt('Tap to guide the otter. Avoid the trash!');
    createBackToMapButton();

    otterPlaced = true;
    reticle.visible = false;
  });
}

function playNarration() {
  const chars = narrationText.split('');
  const delay = 60;
  let index = 0;
  function revealNextChar() {
    if (index >= chars.length) return;
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

function showPrompt(text) {
  const el = document.createElement('div');
  Object.assign(el.style, {
    position: 'absolute', bottom: '80px', left: '50%', transform: 'translateX(-50%)',
    background: 'rgba(0,0,0,0.75)', color: '#fff', padding: '6px 16px',
    borderRadius: '8px', fontSize: '14px', zIndex: '1000'
  });
  el.innerText = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 6000);
}

function createBackToMapButton() {
  const btn = document.createElement('button');
  btn.textContent = '← Back to Map';
  Object.assign(btn.style, {
    position: 'absolute', bottom: '20px', left: '20px', zIndex: '1000',
    background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none',
    padding: '10px 16px', borderRadius: '8px', fontSize: '14px'
  });
  btn.onclick = () => window.location.href = '/index.html';
  document.body.appendChild(btn);
}

function showRestartButton() {
  const btn = document.createElement('button');
  btn.textContent = 'Restart';
  btn.id = 'restartBtn';
  Object.assign(btn.style, {
    position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, 80px)',
    background: 'rgba(0,0,0,0.85)', color: '#fff',
    padding: '12px 20px', fontSize: '16px', borderRadius: '10px',
    zIndex: '3000', border: 'none'
  });
  btn.onclick = resetGame;
  document.body.appendChild(btn);
}

function showTrashWarning() {
  if (warningShown) return;
  const warning = document.createElement('div');
  warning.id = 'trashWarning';
  Object.assign(warning.style, {
    position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -80px)',
    background: 'rgba(200,0,0,0.9)', color: '#fff',
    padding: '12px 24px', fontSize: '16px', borderRadius: '10px',
    zIndex: '3000', fontWeight: 'bold'
  });
  warning.innerText = 'Too much trash here... Try another way.';
  document.body.appendChild(warning);
  showRestartButton();
  warningShown = true;

  setTimeout(() => {
    if (warning) warning.remove();
    warningShown = false;
  }, 3000);
}

function showNextButton() {
  const btn = document.createElement('button');
  btn.textContent = '→ Continue to Node 7';
  btn.dataset.next = 'true';
  Object.assign(btn.style, {
    position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, 60px)',
    background: '#0077aa', color: '#fff',
    padding: '12px 20px', fontSize: '16px', borderRadius: '10px',
    zIndex: '3000', border: 'none'
  });
  btn.onclick = () => window.location.href = '/node7.html';
  document.body.appendChild(btn);
}

function onSceneClick(event) {
  if (!otter || !backgroundPlane) return;
  const mouse = new THREE.Vector2(
    (event.clientX / window.innerWidth) * 2 - 1,
    -(event.clientY / window.innerHeight) * 2 + 1
  );
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObject(backgroundPlane);
  if (intersects.length > 0) {
    targetPosition = intersects[0].point.clone();
  }
}

function render(_, frame) {
  const delta = clock.getDelta();
  if (mixer) mixer.update(delta);

  if (otter && targetPosition && !exitReached) {
    const direction = new THREE.Vector3().subVectors(targetPosition, otter.position);
    if (exitPoint && otter.position.distanceTo(exitPoint.position) < 0.3) {
      exitReached = true;
      showNextButton();
      return;
    }

    let nearTrash = trashBoxes.some(box => box.position.distanceTo(otter.position) < 0.3);

    if (nearTrash) {
      if (!tooCloseToTrash) {
        tooCloseToTrash = true;
        showTrashWarning();
      }
    } else {
      tooCloseToTrash = false;
      direction.normalize();
      otter.position.addScaledVector(direction, delta * 0.3);
      otter.lookAt(targetPosition);
    }
  }

  if (frame && hitTestSource) {
    const referenceSpace = renderer.xr.getReferenceSpace();
    const hits = frame.getHitTestResults(hitTestSource);
    if (hits.length > 0 && !otterPlaced) {
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