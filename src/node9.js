// Node9 – Balance Ecosystem Challenge
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ARButton } from 'three/examples/jsm/webxr/ARButton.js';

let camera, scene, renderer, controller, reticle, otter, mixer;
let hitTestSource = null;
let hitTestSourceRequested = false;
const clock = new THREE.Clock();
let backgroundPlane = null;
let otterPlaced = false;
let objectCount = { tree: 0, building: 0 };
let balanceBar = null;
let nextButtonShown = false;

const infoBoxEl = document.getElementById('infoBox');
const narrationEl = document.getElementById('narrationText');
const buttonBox = document.getElementById('extraButtons');
const audioEl = document.getElementById('narrationAudio');

const narrationText = `So much has changed. The forest gives way to roads, the stream trickles beneath steel and stone. But balance is still possible. Will you build? Or will you grow?`;

init();

function init() {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera();

  const light = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
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

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  renderer.setAnimationLoop(render);
}

function onSelect() {
  if (!reticle.visible || otterPlaced) return;

  const position = new THREE.Vector3().setFromMatrixPosition(reticle.matrix);
  addGroundAt(position);
  loadOtterAt(position);
  createBalanceBar();
  createActionButtons(position);
  createBackToMapButton();
  otterPlaced = true;
  reticle.visible = false;
}

function addGroundAt(position) {
  const loader = new THREE.TextureLoader();
  loader.load('/assets/images/node9_bg.png', (texture) => {
    const geo = new THREE.PlaneGeometry(6, 6);
    const mat = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
    backgroundPlane = new THREE.Mesh(geo, mat);
    backgroundPlane.rotation.x = -Math.PI / 2;
    backgroundPlane.position.copy(position);
    backgroundPlane.position.y -= 0.01;
    scene.add(backgroundPlane);
  });
}

function loadOtterAt(position) {
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
    playNarration();
    createPopupButtons();
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

function createActionButtons(origin) {
  const btnTree = document.createElement('button');
  btnTree.textContent = 'Add Tree';
  Object.assign(btnTree.style, commonBtnStyle(), { left: '20px' });
  btnTree.onclick = () => addModel('tree', origin);
  document.body.appendChild(btnTree);

  const btnBuilding = document.createElement('button');
  btnBuilding.textContent = 'Add Building';
  Object.assign(btnBuilding.style, commonBtnStyle(), { right: '20px' });
  btnBuilding.onclick = () => addModel('building', origin);
  document.body.appendChild(btnBuilding);
}

function addModel(type, origin) {
  // 背景平面范围 (6x6) 的边界
  const minX = origin.x - 3;
  const maxX = origin.x + 3;
  const minZ = origin.z - 3;
  const maxZ = origin.z + 3;

  // 在前方生成的基础 z 偏移
  const baseZ = -0.5 - Math.random() * 1.5; // 前方 1.5 - 3m
  const spreadX = 1.5; // 左右分散
  const spreadZ = 1.5; // 前后分散

  let x, z;
  if (type === 'tree') {
    x = origin.x - 0.6 - Math.random() * spreadX; // 左侧区域
    z = origin.z + baseZ - Math.random() * spreadZ;
  } else {
    x = origin.x + 0.6 + Math.random() * spreadX; // 右侧区域
    z = origin.z + baseZ - Math.random() * spreadZ;
  }

  // 🔒 限制在背景图范围内
  x = THREE.MathUtils.clamp(x, minX + 0.3, maxX - 0.3);
  z = THREE.MathUtils.clamp(z, minZ + 0.3, maxZ - 0.3);

  const y = origin.y + 0.01;

  if (type === 'tree') {
    const loader = new GLTFLoader();
    loader.load('/assets/models/tree.glb', (gltf) => {
      const tree = gltf.scene;
      tree.scale.set(0.4, 0.4, 0.4);
      tree.position.set(x, y, z);
      scene.add(tree);
    });
    objectCount.tree++;
  } else if (type === 'building') {
    const loader = new GLTFLoader();
    loader.load('/assets/models/Building.glb', (gltf) => {
      const building = gltf.scene;
      building.scale.set(0.4, 0.4, 0.4);
      building.position.set(x, y, z);
      scene.add(building);
    });
    objectCount.building++;
  }

  updateBalanceBar();
}

function createBalanceBar() {
  balanceBar = document.createElement('div');
  Object.assign(balanceBar.style, {
    width: '100%',
    height: '12px',
    background: '#ccc',
    borderRadius: '6px',
    overflow: 'hidden',
    marginTop: '10px',
    boxShadow: '0 2px 6px rgba(0,0,0,0.3)'
  });

  const fill = document.createElement('div');
  fill.id = 'barFill';
  Object.assign(fill.style, {
    height: '100%',
    width: '0%',
    background: '#00cc66',
    transition: 'width 0.3s ease'
  });

  balanceBar.appendChild(fill);
  infoBoxEl.appendChild(balanceBar);
}

function updateBalanceBar() {
  const netTrees = objectCount.tree - objectCount.building; // 🌳 - 🏢
  const safeNetTrees = Math.max(netTrees, 0);

  const fill = document.getElementById('barFill');

  if (safeNetTrees >= 3) {
    fill.style.width = '100%';

    // ✅ 显示按钮（如果还没显示）
    if (!nextButtonShown) {
      showNextButton();
      nextButtonShown = true;
    }
  } else {
    // ✅ 按比例填充
    const ratio = safeNetTrees / 3;
    fill.style.width = `${ratio * 100}%`;

    // ❌ 如果按钮已经显示，但现在条件不满足，就移除按钮
    if (nextButtonShown) {
      const btn = document.getElementById('finishBtn');
      if (btn) btn.remove();
      nextButtonShown = false;
    }
  }
}

function showNextButton() {
  const btn = document.createElement('button');
  btn.id = 'finishBtn'; // ✅ 方便删除
  btn.textContent = '→ Finish';
  Object.assign(btn.style, {
    position: 'absolute',
    bottom: '20px',
    right: '20px',
    zIndex: '1000',
    background: 'green',
    color: '#fff',
    border: 'none',
    padding: '10px 16px',
    borderRadius: '8px',
    fontSize: '14px',
    cursor: 'pointer'
  });
  btn.onclick = () => window.location.href = '/node10.html';
  document.body.appendChild(btn);
}

function createBackToMapButton() {
  const btn = document.createElement('button');
  btn.textContent = '← Back to Map';
  Object.assign(btn.style, {
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
    cursor: 'pointer'
  });
  btn.onclick = () => window.location.href = '/index.html';
  document.body.appendChild(btn);
}

function createPopupButtons() {
  buttonBox.innerHTML = '';
  const popupBtn = document.createElement('button');
  popupBtn.textContent = 'Why Balance?';
  popupBtn.onclick = () => showPopup('eco');
  buttonBox.appendChild(popupBtn);
  buttonBox.style.display = 'block';
}

window.showPopup = function (type) {
  const popup = document.getElementById('popupOverlay');
  const content = document.getElementById('popupText');

  if (type === 'eco') {
    content.innerHTML = `
      <strong>Why Balance Matters?</strong>
      <p>Too many buildings harm river habitats. Too many trees without care invite flooding.</p>
      <p><em>Balanced planning helps otters thrive!</em></p>
      <img src="/assets/images/eco_balance.png" alt="Balance" style="width:100%;margin-top:10px;border-radius:6px;">
    `;
  }

  popup.style.display = 'flex';
};

document.getElementById('popupClose').onclick = () => {
  document.getElementById('popupOverlay').style.display = 'none';
};

function commonBtnStyle() {
  return {
    position: 'absolute',
    bottom: '80px',
    zIndex: '1000',
    background: '#003300',
    color: '#fff',
    padding: '10px 16px',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    cursor: 'pointer'
  };
}

function render(_, frame) {
  const delta = clock.getDelta();
  if (mixer) mixer.update(delta);

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