import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ARButton } from 'three/examples/jsm/webxr/ARButton.js';

let camera, scene, renderer, controller, reticle;
let hitTestSource = null;
let hitTestSourceRequested = false;
const clock = new THREE.Clock();

let backgroundPlane = null;
let otter, trustOtter, currentOtter, mixer;
let otterPlaced = false;

const otterPosition = new THREE.Vector3();
const popupOffset = new THREE.Vector3(0, 0.5, 0);
const trustAudio = document.getElementById('trustAudio');      // 🎷 水獭靠近时播放
const narrationAudio = document.getElementById('narrationAudio'); // 🎧 infoBox 的旁白

const infoBoxEl = document.getElementById('infoBox');
const narrationEl = document.getElementById('narrationText');
const popupOverlay = document.getElementById('popupOverlay');
const popupContent = document.getElementById('popupContent');

const promptEl = document.createElement('div'); // ✅ 提示框
promptEl.id = 'approachPrompt';
Object.assign(promptEl.style, {
  position: 'absolute',
  bottom: '80px',
  left: '50%',
  transform: 'translateX(-50%)',
  background: 'rgba(0,0,0,0.7)',
  color: '#fff',
  padding: '6px 14px',
  borderRadius: '8px',
  fontSize: '14px',
  fontWeight: 'normal',
  zIndex: '1000',
  boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
  maxWidth: '80%',
  textAlign: 'center',
  lineHeight: '1.4',
  display: 'none'
});
promptEl.innerText = 'Try moving closer to the otter... see what it’s thinking.';
document.body.appendChild(promptEl);

const narrationText = `I see you. You see me. Stillness. Then a soft blink. You are not loud, not fast. I feel no threat. I stay. For now.`;

init();

function init() {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera();

  const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1);
  light.position.set(0.5, 1, 0.25);
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

  const pos = new THREE.Vector3();
  pos.setFromMatrixPosition(reticle.matrix);
  otterPosition.copy(pos);

  addGroundAt(pos);
  loadOtters(pos);
  showNarration();
  createBackToMapButton();
  createNextNodeButton();

  otterPlaced = true;
  reticle.visible = false;

  promptEl.style.display = 'block'; // ✅ 显示提示
}

function addGroundAt(pos) {
  const loader = new THREE.TextureLoader();
  loader.load('/assets/images/node4_bg.png', (texture) => {
    const width = 6, height = 6, segments = 50;
    const geo = new THREE.PlaneGeometry(width, height, segments, segments);
    const positionAttr = geo.attributes.position;

    for (let i = 0; i < positionAttr.count; i++) {
      const y = positionAttr.getY(i);
      const z = positionAttr.getZ(i);
      if (y > 2) {
        const bendFactor = (y - 2) / 2;
        positionAttr.setZ(i, z + 3.0 * bendFactor * bendFactor);
      }
    }

    positionAttr.needsUpdate = true;
    geo.computeVertexNormals();

    const mat = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
    backgroundPlane = new THREE.Mesh(geo, mat);
    backgroundPlane.rotation.x = -Math.PI / 2;
    backgroundPlane.position.copy(pos);
    backgroundPlane.position.y -= 0.01;
    scene.add(backgroundPlane);
  });
}

function loadOtters(pos) {
  const loader = new GLTFLoader();

  loader.load('/assets/models/otter.glb', (gltf) => {
    otter = gltf.scene;
    otter.scale.set(0.6, 0.6, 0.6); // ✅ 稍微放大
    otter.position.copy(pos);
    otter.rotation.y = 0; // ✅ 脸朝向镜头
    scene.add(otter);
    currentOtter = otter;

    if (gltf.animations.length > 0) {
      mixer = new THREE.AnimationMixer(otter);
      gltf.animations.forEach((clip) => mixer.clipAction(clip).play());
    }
  });

  loader.load('/assets/models/trust.glb', (gltf) => {
    trustOtter = gltf.scene;
    trustOtter.scale.set(0.6, 0.6, 0.6);
    trustOtter.position.copy(pos);
    trustOtter.rotation.y = 0;
    trustOtter.visible = false;
    scene.add(trustOtter);
  });
}

function render(timestamp, frame) {
  const delta = clock.getDelta();
  if (mixer) mixer.update(delta);

  if (currentOtter) {
    const camPos = renderer.xr.getCamera().position;
    const distance = camPos.distanceTo(currentOtter.position);

    if (distance < 0.8 && currentOtter !== trustOtter) {
      swapOtter(trustOtter);
      showPopupAtOtter();
      promptEl.style.display = 'none'; // ✅ 隐藏提示
    } else if (distance > 1.5 && currentOtter !== otter) {
      swapOtter(otter);
      hidePopup();
    }

    updatePopupPosition();
  }

  const session = renderer.xr.getSession();
  if (session && !hitTestSourceRequested) {
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

  renderer.render(scene, camera);
}

function swapOtter(newModel) {
  if (!newModel || currentOtter === newModel) return;
  currentOtter.visible = false;
  newModel.visible = true;
  currentOtter = newModel;

  // ✅ 只有切换到 trustOtter 时才播放声音
  if (newModel === trustOtter) {
    trustAudio.currentTime = 0; // 重置播放时间
    trustAudio.play().catch(() => {});
  }
}

function showNarration() {
  narrationEl.innerHTML = '';
  infoBoxEl.style.display = 'block';
  const chars = narrationText.split('');
  let index = 0;

  narrationAudio.play(); // ✅ 播放旁白音频

  function revealNext() {
    if (index >= chars.length) return;
    const span = document.createElement('span');
    span.className = 'char';
    span.innerHTML = chars[index] === ' ' ? '&nbsp;' : chars[index];
    narrationEl.appendChild(span);
    index++;
    setTimeout(revealNext, 50);
  }

  revealNext();
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
  button.onclick = () => {
    window.location.href = '/index.html';
  };
  document.body.appendChild(button);
}

function createNextNodeButton() {
  const button = document.createElement('button');
  button.textContent = '→ Go to Node 5';
  Object.assign(button.style, {
    position: 'absolute',
    bottom: '20px',
    right: '20px',
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
  button.onclick = () => {
    window.location.href = '/node5.html';
  };
  document.body.appendChild(button);
}

function showPopupAtOtter() {
  if (!popupOverlay || !popupContent) return;
  popupContent.innerHTML = `
    <strong>Otter’s Thought</strong><br>
    You’re quiet… I think I trust you. Just a little. Don’t scare me. Don’t pollute. Be still, and I’ll come closer.
  `;
  popupOverlay.style.display = 'flex';
  updatePopupPosition();
}

function updatePopupPosition() {
  if (!currentOtter || popupOverlay.style.display !== 'flex') return;

  const worldPos = currentOtter.position.clone().add(popupOffset);
  const vector = worldPos.project(camera);

  const x = (vector.x * 0.5 + 0.5) * window.innerWidth;
  const y = (-vector.y * 0.5 + 0.5) * window.innerHeight;

  Object.assign(popupOverlay.style, {
    position: 'absolute',
    top: `${y}px`,
    left: `${x}px`,
    transform: 'translate(-50%, -110%) scale(0.85)',
    zIndex: '9999',
  });
}

function hidePopup() {
  if (popupOverlay) popupOverlay.style.display = 'none';
}