// Node7 - Noise Avoidance Challenge with Animated Ripples and Exit
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ARButton } from 'three/examples/jsm/webxr/ARButton.js';

let camera, scene, renderer, controller, reticle, otter, mixer;
let hitTestSource = null;
let hitTestSourceRequested = false;
let backgroundPlane = null;
let targetPosition = null;
let otterPlaced = false;
let noiseSources = [];
let exitPoint = null;
let exitReached = false;
let rippleScale = 1;

const clock = new THREE.Clock();
const noiseAudio = new Audio('/assets/audio/city_noise.mp3');
noiseAudio.loop = true;

const infoBoxEl = document.getElementById('infoBox');
const narrationEl = document.getElementById('narrationText');
const buttonBox = document.getElementById('extraButtons');
const audioEl = document.getElementById('narrationAudio');
const narrationText = `The city hums around me. But too much noise makes it hard to rest. I must find quiet, even here.`;

let warningEl = null;

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

  createWarningElement();
  renderer.domElement.addEventListener('click', onSceneClick);
  window.addEventListener('resize', () => renderer.setSize(window.innerWidth, window.innerHeight));
  renderer.setAnimationLoop(render);
}

function createWarningElement() {
  warningEl = document.createElement('div');
  warningEl.innerText = 'Too noisy here... Try another way.';
  Object.assign(warningEl.style, {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    background: 'rgba(200,0,0,0.85)',
    color: 'white',
    padding: '10px 20px',
    borderRadius: '10px',
    fontSize: '16px',
    fontWeight: 'bold',
    display: 'none',
    zIndex: '9999'
  });
  document.body.appendChild(warningEl);
}

function addGroundAt(pos) {
  const loader = new THREE.TextureLoader();
  loader.load('/assets/images/node7_bg.png', (texture) => {
    const geo = new THREE.PlaneGeometry(6, 6);
    const mat = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
    backgroundPlane = new THREE.Mesh(geo, mat);
    backgroundPlane.rotation.x = -Math.PI / 2;
    backgroundPlane.position.copy(pos);
    backgroundPlane.position.y -= 0.01;
    scene.add(backgroundPlane);
  });
}

function addNoiseAndExit(center) {
  const numNoise = 4; // 随机生成 4 个噪音源
  const minX = center.x - 2.5;
  const maxX = center.x + 2.5;
  const minZ = center.z - 2.5;
  const maxZ = center.z + 2.5;

  // 随机噪音源
  noiseSources = [];
  for (let i = 0; i < numNoise; i++) {
    const offsetX = THREE.MathUtils.randFloat(minX, maxX);
    const offsetZ = THREE.MathUtils.randFloat(minZ, maxZ - 1.0);

    const ripple = new THREE.Mesh(
      new THREE.RingGeometry(0.2, 0.4, 32),
      new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.4, side: THREE.DoubleSide })
    );
    ripple.rotation.x = -Math.PI / 2;
    ripple.position.set(offsetX, center.y + 0.01, offsetZ);
    scene.add(ripple);
    noiseSources.push(ripple);
  }

  // 生成出口，确保与噪音源至少 1.2m 间距
  let exitX, exitZ;
  let valid = false;
  let attempts = 0;
  while (!valid && attempts < 50) {
    exitX = THREE.MathUtils.clamp(center.x + (Math.random() > 0.5 ? 2 : -2), minX, maxX);
    exitZ = THREE.MathUtils.clamp(center.z - 2.5, minZ, maxZ);

    valid = true;
    for (let n of noiseSources) {
      if (new THREE.Vector3(exitX, center.y, exitZ).distanceTo(n.position) < 3) {
        valid = false; // 太近了，重新生成
        break;
      }
    }
    attempts++;
  }

  exitPoint = new THREE.Mesh(
    new THREE.RingGeometry(0.25, 0.5, 32),
    new THREE.MeshBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.4, side: THREE.DoubleSide })
  );
  exitPoint.rotation.x = -Math.PI / 2;
  exitPoint.position.set(exitX, center.y + 0.01, exitZ);
  scene.add(exitPoint);
}

function onSelect() {
  if (!reticle.visible || otterPlaced) return;

  const pos = new THREE.Vector3();
  pos.setFromMatrixPosition(reticle.matrix);
  addGroundAt(pos);

  const loader = new GLTFLoader();
  loader.load('/assets/models/otter.glb', (gltf) => {
    otter = gltf.scene;
    otter.scale.set(0.5, 0.5, 0.5);
    otter.position.copy(pos);
    otter.rotation.y = Math.PI;
    scene.add(otter);

    if (gltf.animations.length > 0) {
      mixer = new THREE.AnimationMixer(otter);
      gltf.animations.forEach((clip) => mixer.clipAction(clip).play());
    }

    addNoiseAndExit(pos);

    infoBoxEl.style.display = 'block';
    narrationEl.innerHTML = '';
    buttonBox.style.display = 'none';

    playNarration();
    showPrompt('Tap to guide the otter. Avoid the noisy zones.');
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
    if (index >= chars.length) {
      // 旁白播完后 → 等待音频结束 → 在 infoBox 里显示按钮
      audioEl.onended = () => {
        const btn = document.createElement('button');
        btn.textContent = 'Noise Pollution';
        btn.onclick = () => {
          showPopup(
            "Noise Pollution",
            "Constant urban noise can disrupt otters’ ability to rest, communicate, and hunt effectively. Prolonged exposure may drive them away from suitable habitats."
          );
        };
        buttonBox.innerHTML = ''; // 清空旧按钮
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

function showPopup(title, body) {
  const overlay = document.getElementById('popupOverlay');
  const textEl = document.getElementById('popupText');
  if (overlay && textEl) {
    textEl.innerHTML = `<h2>${title}</h2><p>${body}</p>`;
    overlay.style.display = 'flex';
  }
}

function closePopup() {
  document.getElementById('popupOverlay').style.display = 'none';
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

  rippleScale += delta * 0.5;
  if (rippleScale > 2) rippleScale = 1;
  [...noiseSources, exitPoint].forEach(ripple => {
    if (ripple) ripple.scale.set(rippleScale, rippleScale, rippleScale);
  });

  if (otter && targetPosition) {
    const direction = new THREE.Vector3().subVectors(targetPosition, otter.position);
    const distance = direction.length();
    if (distance > 0.02) {
      direction.normalize();
      otter.position.addScaledVector(direction, delta * 0.3);
      otter.lookAt(targetPosition);
    } else {
      targetPosition = null;
    }

    const nearNoise = noiseSources.some(n => n.position.distanceTo(otter.position) < 0.6);
    if (nearNoise) {
      if (noiseAudio.paused) noiseAudio.play();
      warningEl.style.display = 'block';
    } else {
      if (!noiseAudio.paused) noiseAudio.pause();
      warningEl.style.display = 'none';
    }

    if (!exitReached && exitPoint && otter.position.distanceTo(exitPoint.position) < 0.5) {
      exitReached = true;
      const btn = document.createElement('button');
      btn.textContent = '→ Enter Node 8';
      Object.assign(btn.style, {
        position: 'absolute', bottom: '20px', right: '20px', zIndex: '1000',
        background: 'rgba(0,100,0,0.7)', color: '#fff', border: 'none',
        padding: '10px 16px', borderRadius: '8px', fontSize: '14px'
      });
      btn.onclick = () => window.location.href = '/node8.html';
      document.body.appendChild(btn);
    }
  }

  if (frame && hitTestSource) {
    const refSpace = renderer.xr.getReferenceSpace();
    const hits = frame.getHitTestResults(hitTestSource);
    if (hits.length > 0 && !otterPlaced) {
      const pose = hits[0].getPose(refSpace);
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