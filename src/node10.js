// Node10 – Return to Holt (styled ARButton like Node1)
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ARButton } from 'three/examples/jsm/webxr/ARButton.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';

// ===== Globals =====
let camera, scene, renderer, controller, reticle, mixer;
let hitTestSource = null;
let hitTestSourceRequested = false;

let backgroundPlane = null;
let holt = null;
let otter = null;
let targetPosition = null;
let holtPlaced = false;
let placedOnce = false;
let journeyEnded = false;

const clock = new THREE.Clock();

// UI refs (from your HTML)
const infoBoxEl   = document.getElementById('infoBox');
const narrationEl = document.getElementById('narrationText');
const buttonBox   = document.getElementById('extraButtons');
const audioEl     = document.getElementById('narrationAudio');

// Narration
const narrationText = `The water carries me home. 
The river narrows, the city quiets. 
Every step I take brings me closer to the holt, 
where roots wrap around stone, where shadows keep me safe.  
Without you, my path will fade.  
With you, the river will live.  
Guide me home, one last time.`;

// ===== Init =====
init();

function init() {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera();

  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
  hemi.position.set(0.5, 1, 0.25);
  scene.add(hemi);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.xr.enabled = true;
  document.body.appendChild(renderer.domElement);

  // ✅ Use ARButton but restyle it like Node1
  const arButton = ARButton.createButton(renderer, { requiredFeatures: ['hit-test'] });
  arButton.className = 'webxr-button';
  document.body.appendChild(arButton);
  // Let your CSS take over + change label
  setTimeout(() => {
    arButton.textContent = 'Ending journey';
    arButton.removeAttribute('style');
  }, 0);

  renderer.xr.addEventListener('sessionstart', () => {
    setupSky();
  });

  // Controller & reticle
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

  // Interactions
  renderer.domElement.addEventListener('click', onSceneClick);
  window.addEventListener('resize', () => renderer.setSize(window.innerWidth, window.innerHeight));

  renderer.setAnimationLoop(render);
}

// ===== Sky env =====
function setupSky() {
  const sky = new Sky();
  sky.scale.setScalar(450000);
  scene.add(sky);

  const uniforms = sky.material.uniforms;
  uniforms['turbidity'].value = 2;          // 更干净的空气
  uniforms['rayleigh'].value = 0.2;         // 更低散射 → 夜晚效果
  uniforms['mieCoefficient'].value = 0.0005;
  uniforms['mieDirectionalG'].value = 0.8;

  // 🌙 把太阳位置调到地平线以下，模拟夜空
  const sun = new THREE.Vector3();
  const phi = THREE.MathUtils.degToRad(95);  // 太阳在地平线下方
  const theta = THREE.MathUtils.degToRad(180);
  sun.setFromSphericalCoords(1, phi, theta);
  uniforms['sunPosition'].value.copy(sun);

  // 可选：让环境暗下来
  const pmremGen = new THREE.PMREMGenerator(renderer);
  scene.environment = pmremGen.fromScene(sky).texture;

  // 再加一层环境光，营造“月光”
  const moonLight = new THREE.DirectionalLight(0x8899ff, 0.2);
  moonLight.position.set(0, 1, -1);
  scene.add(moonLight);
}

// ===== Place scene on first select at reticle =====
function onSelect() {
  if (!reticle.visible || placedOnce) return;
  const pos = new THREE.Vector3().setFromMatrixPosition(reticle.matrix);

  placeCurvedBackground(pos);
  placeHolt(pos);
  generateOtterAt(pos);

  placedOnce = true;
  reticle.visible = false;
}

// ===== Curved video ground =====
function placeCurvedBackground(position) {
  const width = 6, height = 6, segments = 50;
  const geo = new THREE.PlaneGeometry(width, height, segments, segments);
  const posAttr = geo.attributes.position;

  for (let i = 0; i < posAttr.count; i++) {
    const y = posAttr.getY(i);
    const z = posAttr.getZ(i);
    if (y > 2) {
      const bend = (Math.abs(y) - 2) / 2;
      posAttr.setZ(i, z + 3.0 * bend * bend);
    }
  }
  posAttr.needsUpdate = true;
  geo.computeVertexNormals();

  const video = document.createElement('video');
  video.src = '/assets/videos/node1_bg.mp4';
  video.loop = true;
  video.muted = true;
  video.autoplay = true;
  video.playsInline = true;
  video.crossOrigin = 'anonymous';
  video.setAttribute('webkit-playsinline', 'true');
  video.play().catch(() => {});

  const videoTexture = new THREE.VideoTexture(video);
  const mat = new THREE.MeshBasicMaterial({ map: videoTexture, side: THREE.DoubleSide });

  backgroundPlane = new THREE.Mesh(geo, mat);
  backgroundPlane.rotation.x = -Math.PI / 2;
  backgroundPlane.position.copy(position);
  backgroundPlane.position.y -= 0.01;
  scene.add(backgroundPlane);
}

// ===== Holt =====
function placeHolt(position) {
  const loader = new GLTFLoader();
  loader.load('/assets/models/holt.glb', (gltf) => {
    holt = gltf.scene;
    holt.scale.set(0.02, 0.02, 0.02);
    // 放在 otter 前方稍远（仍在6x6内）
    holt.position.set(position.x + 1.2, position.y + 0.05, position.z + 2.0);
    holt.rotation.y = Math.PI;
    scene.add(holt);
    holtPlaced = true;
  });
}

// ===== Otter =====
function generateOtterAt(position) {
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

    playNarration();          // 逐字播旁白
    addInfoButtons();         // ✅ 恢复 infoBox 里的 popup 按钮
    showPathPrompt();         // ✅ 恢复“引导回 holt”的屏幕提示
    createBackToMapButton();
  });
}

// ===== Narration =====
function playNarration() {
  const chars = narrationText.split('');
  const delay = 60;
  let index = 0;

  function revealNextChar() {
    if (index >= chars.length) {
      // 旁白结束也确保按钮可见
      addInfoButtons();                 // ✅ 新增
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

function showPathPrompt() {
  const el = document.createElement('div');
  el.innerText = 'Tap on the ground to guide the otter back to its holt.';
  Object.assign(el.style, {
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
    textAlign: 'center'
  });
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 6000);
}

// ===== Input: click to move =====
function onSceneClick(event) {
  if (!otter || !backgroundPlane || journeyEnded) return;

  const mouse = new THREE.Vector2(
    (event.clientX / window.innerWidth) * 2 - 1,
    -(event.clientY / window.innerHeight) * 2 + 1
  );
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(mouse, camera);
  const hit = raycaster.intersectObject(backgroundPlane);
  if (hit.length > 0) {
    targetPosition = hit[0].point.clone();
  }
}

// ===== Render loop =====
function render(_, frame) {
  const delta = clock.getDelta();
  if (mixer) mixer.update(delta);

  // Move otter
  if (otter && targetPosition && !journeyEnded) {
    const dir = new THREE.Vector3().subVectors(targetPosition, otter.position);
    const dist = dir.length();
    if (dist > 0.02) {
      dir.normalize();
      otter.position.addScaledVector(dir, delta * 0.3);
      otter.lookAt(targetPosition);
    } else {
      targetPosition = null;
    }
  }

  // Check reach holt -> end journey
  if (otter && holt && !journeyEnded) {
    const d = otter.position.distanceTo(holt.position);
    if (d < 0.8) {
      endJourney();
    }
  }

  // Hit test setup (like Node1)
  if (frame && !hitTestSourceRequested) {
    const session = renderer.xr.getSession();
    session.requestReferenceSpace('viewer').then((refSpace) => {
      session.requestHitTestSource({ space: refSpace }).then((source) => {
        hitTestSource = source;
      });
    });
    session.addEventListener('end', () => {
      hitTestSourceRequested = false;
      hitTestSource = null;
    });
    hitTestSourceRequested = true;
  }

  // Update reticle until placed
  if (frame && hitTestSource) {
    const refSpace = renderer.xr.getReferenceSpace();
    const hits = frame.getHitTestResults(hitTestSource);
    if (hits.length > 0 && !placedOnce) {
      const pose = hits[0].getPose(refSpace);
      reticle.visible = true;
      reticle.matrix.fromArray(pose.transform.matrix);
    } else {
      reticle.visible = false;
    }
  }

  renderer.render(scene, camera);
}

// ===== End journey: fade out otter, show recap =====
function endJourney() {
  journeyEnded = true;
  const fadeMs = 1200;
  const start = performance.now();

  function fade() {
    const t = Math.min((performance.now() - start) / fadeMs, 1);
    otter.traverse((child) => {
      if (child.isMesh) {
        if (!child.material.transparent) child.material.transparent = true;
        child.material.opacity = 1 - t;
      }
    });
    if (t < 1) requestAnimationFrame(fade);
    else {
  scene.remove(otter);
  otter = null;
  showRecapButtonBottomRight(); // ✅ 只显示右下角按钮
}
  }
  fade();
}

function showRecapButtonBottomRight() {
  // 若已存在就不重复添加
  if (document.getElementById('recapBtn')) return;

  const btn = document.createElement('button');
  btn.id = 'recapBtn';
  btn.textContent = '→ Recap the Journey';
  Object.assign(btn.style, {
    position: 'absolute',
    bottom: '20px',
    right: '20px',
    zIndex: '2000',
    background: 'green',
    color: '#fff',
    border: 'none',
    padding: '10px 16px',
    borderRadius: '8px',
    fontSize: '14px',
    cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
  });
  btn.onclick = () => window.location.href = '/index.html';
  document.body.appendChild(btn);
}

function addInfoButtons() {
  buttonBox.innerHTML = '';
  const b1 = document.createElement('button');
  b1.textContent = "What Did You Learn?";
  b1.onclick = () => showPopup('holt');

  const b2 = document.createElement('button');
  b2.textContent = 'Your Next Step?';
  b2.onclick = () => showPopup('fact');

  buttonBox.append(b1, b2);
  buttonBox.style.display = 'block';
}

window.showPopup = function (type) {
  const overlay = document.getElementById('popupOverlay');
  const content = document.getElementById('popupText');
  if (!overlay || !content) return;

  if (type === 'holt') {
    content.innerHTML = `
      <strong>What Did You Learn?</strong>
      <p>Otters live where we live..</p>
      <p>Every action leaves a mark on rivers.</p>
      <p>Balance between building and protecting is fragile</p>
      <p>The river is alive — and it remembers.</p>
    `;
  } else if (type === 'fact') {
    content.innerHTML = `
      <strong>Your Next Step</strong>
      <p>Record wildlife sightings</p>
    `;
  }
  overlay.style.display = 'flex';
};

const closeEl = document.getElementById('popupClose');
if (closeEl) {
  closeEl.onclick = () => (document.getElementById('popupOverlay').style.display = 'none');
}
// ===== Back to Map =====
function createBackToMapButton() {
  const button = document.createElement('button');
  button.textContent = '← Back to Map';
  Object.assign(button.style, {
    position: 'absolute', bottom: '20px', left: '20%', transform: 'translateX(-50%)',
    zIndex: '1000', background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none',
    padding: '10px 16px', borderRadius: '8px', fontSize: '14px', cursor: 'pointer'
  });
  button.onclick = () => window.location.href = '/index.html';
  document.body.appendChild(button);
}