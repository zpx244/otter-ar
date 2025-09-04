import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ARButton } from 'three/examples/jsm/webxr/ARButton.js';

let camera, scene, renderer, controller, reticle, otter, mixer;
let hitTestSource = null;
let hitTestSourceRequested = false;
const clock = new THREE.Clock();
let backgroundPlane = null;
let targetPosition = null;
let otterPlaced = false; // ✅ 控制 reticle 是否继续显示

const infoBoxEl = document.getElementById('infoBox');
const narrationEl = document.getElementById('narrationText');
const buttonBox = document.getElementById('extraButtons');
const audioEl = document.getElementById('narrationAudio');

const narrationText = `The first light of day breaks over rooftops. Beneath the brambles, I stir. My holt is hidden from human eyes, tucked deep in the upper Bride’s shadows. The stream here is narrow, but it smells of life — earth, leaf, dew. I slide into the water. 
Today, like every day, I must patrol, mark, and feed. The city is loud, but I know where to listen. This river is mine. For now.`;

let pathPromptShown = false;
let pathPromptEl = null;

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

  renderer.domElement.addEventListener('click', onSceneClick, false);

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  renderer.setAnimationLoop(render);
}

function addGroundAt(position) {
  const loader = new THREE.TextureLoader();
  loader.load('/assets/images/node1-bg.png', (texture) => {
    const geo = new THREE.PlaneGeometry(6, 6);
    const mat = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
    backgroundPlane = new THREE.Mesh(geo, mat);
    backgroundPlane.rotation.x = -Math.PI / 2;
    backgroundPlane.position.copy(position);
    backgroundPlane.position.y -= 0.01;
    scene.add(backgroundPlane);
  });
}

function onSelect() {
  if (!reticle.visible || otter) return;

  const position = new THREE.Vector3();
  position.setFromMatrixPosition(reticle.matrix);

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
      gltf.animations.forEach((clip) => {
        mixer.clipAction(clip).play();
      });
    }

    infoBoxEl.style.display = 'block';
    narrationEl.innerHTML = '';
    buttonBox.style.display = 'none';

    playNarration();
    showPathPrompt();
    createBackToMapButton();

    otterPlaced = true; // ✅ 隐藏 reticle
    reticle.visible = false;
  });
}

function playNarration() {
  const chars = narrationText.split('');
  const delay = 60;
  let index = 0;

  function revealNextChar() {
    if (index >= chars.length) {
      showButtons();
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

function showButtons() {
  buttonBox.innerHTML = `
    <button onclick="showPopup('holt')">What’s a Holt?</button>
    <button onclick="showPopup('fact')">Did You Know?</button>
  `;
  buttonBox.style.display = 'block';
}

function showPathPrompt() {
  if (pathPromptShown) return;

  pathPromptEl = document.createElement('div');
  pathPromptEl.id = 'tapPrompt';
  Object.assign(pathPromptEl.style, {
    position: 'absolute',
    bottom: '80px',
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'rgba(0,0,0,0.75)',
    color: '#fff',
    padding: '6px 16px',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 'normal',
    zIndex: '1000',
    boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
    maxWidth: '80%',
    textAlign: 'center',
    lineHeight: '1.4',
  });
  pathPromptEl.innerText = 'Tap on the image to guide the otter forward.';
  document.body.appendChild(pathPromptEl);

  pathPromptShown = true;
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

function render(timestamp, frame) {
  const delta = clock.getDelta();
  if (mixer) mixer.update(delta);

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

// 弹窗内容
window.showPopup = function (type) {
  const popup = document.getElementById('popupOverlay');
  const content = document.getElementById('popupText');

  if (type === 'holt') {
    content.innerHTML = `
      <strong>What’s a Holt?</strong>
      <p>A holt is an otter’s home—usually a tunnel or hidden space among roots, rocks, or even urban pipes.</p>
      <p><em>In cities, otters often adapt abandoned drains!</em></p>
      <img src="/assets/images/holt_diagram.png" alt="Holt Diagram" style="width:100%;margin-top:10px;border-radius:6px;">
    `;
  } else if (type === 'fact') {
    content.innerHTML = `
      <strong>Did You Know?</strong>
      <p>Urban otters in Cork have been spotted as far upstream as Blackpool, using storm drains as travel routes.</p>
      <a href="https://www.ucc.ie/en/" target="_blank">View UCC tracking data</a>
    `;
  }

  popup.style.display = 'flex';
};

document.getElementById('popupClose').onclick = () => {
  document.getElementById('popupOverlay').style.display = 'none';
};