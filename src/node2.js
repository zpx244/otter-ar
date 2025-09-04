// 完整 node2.js 文件（加入污染路径绿色气泡粒子效果）

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ARButton } from 'three/examples/jsm/webxr/ARButton.js';

let camera, scene, renderer, controller, reticle, otter, mixer;
let hitTestSource = null;
let hitTestSourceRequested = false;
const clock = new THREE.Clock();

let riverPathSelected = false;
let pollutedPathSelected = false;
let tryAgainButton = null;
let originalOtterPosition = new THREE.Vector3();

const infoBoxEl = document.getElementById('infoBox');
const narrationEl = document.getElementById('narrationText');
const buttonBox = document.getElementById('extraButtons');
const audioEl = document.getElementById('narrationAudio');
const pollutedAudio = new Audio('/assets/audio/polluted_path.mp3');
const naturalAudio = new Audio('/assets/audio/natural_path.mp3');

const narrationText = `I move swiftly through the concrete runoff path, where the wild becomes tamed. A faster route, yes—but the smells are wrong. I catch hints of soap, petrol, detergent. This is where human waste spills into my world. It might save me time, but what else will it cost? Hunger, headache—or worse?`;

let narrationFinished = false;
let choiceBoxesAdded = false;
let treeModel, treeClickBox, pollutedBottle, pollutedClickBox;
let plasticBottles = [];
let pollutionParticles = [];

const loader = new GLTFLoader();

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
  if (!reticle.visible || otter) return;

  loader.load('/assets/models/otter.glb', (gltf) => {
    otter = gltf.scene;
    otter.scale.set(0.3, 0.3, 0.3);
    otter.position.setFromMatrixPosition(reticle.matrix);
    originalOtterPosition.copy(otter.position);
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
  });
}

function playNarration() {
  const chars = narrationText.split('');
  const delay = 60;
  let index = 0;

  function revealNextChar() {
    if (index >= chars.length) {
      narrationFinished = true;
      showButtons();
      showPathPrompt();
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
  buttonBox.innerHTML = `<button onclick="showPopup('chemical')">Chemical Clues</button>`;
  buttonBox.style.display = 'block';
}

function showPathPrompt() {
  const prompt = document.createElement('div');
  prompt.id = 'pathPrompt';
  prompt.style.position = 'absolute';
  prompt.style.bottom = '100px';
  prompt.style.left = '50%';
  prompt.style.transform = 'translateX(-50%)';
  prompt.style.background = 'rgba(0,0,0,0.7)';
  prompt.style.color = '#fff';
  prompt.style.padding = '10px 20px';
  prompt.style.borderRadius = '10px';
  prompt.style.fontSize = '14px';
  prompt.innerText = 'Which path will you take?\nLeft: slower but natural. Right: faster but polluted.';
  document.body.appendChild(prompt);
}

function removePathPrompt() {
  const prompt = document.getElementById('pathPrompt');
  if (prompt) prompt.remove();
}

function createPollutionParticles() {
  const particleCount = 150;
  const geometry = new THREE.BufferGeometry();
  const positions = [];
  const velocities = [];

  for (let i = 0; i < particleCount; i++) {
    const x = originalOtterPosition.x - 0.3 + Math.random() * 0.6;
    const y = originalOtterPosition.y + Math.random() * 0.4;
    const z = originalOtterPosition.z - 0.6 + Math.random() * 1.2;
    positions.push(x, y, z);
    velocities.push(0.0005 + Math.random() * 0.0005);
  }

  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

  const material = new THREE.PointsMaterial({
    color: 0x00ff00,
    size: 0.02,
    transparent: true,
    opacity: 0.35,
    depthWrite: false
  });

  const particles = new THREE.Points(geometry, material);
  particles.userData.velocities = velocities;
  scene.add(particles);
  pollutionParticles.push(particles);
}

function render(timestamp, frame) {
  const delta = clock.getDelta();
  if (mixer) mixer.update(delta);

  if (otter && !riverPathSelected && !pollutedPathSelected) {
    if (otter.position.z > originalOtterPosition.z - 0.4) {
      otter.position.z -= delta * 0.1;
    } else if (narrationFinished && !choiceBoxesAdded) {
      showPathChoices();
    }
  }

  if (riverPathSelected) {
    otter.position.z -= delta * 0.1;
  }

  if (pollutedPathSelected) {
    const time = Date.now() * 0.002;
    plasticBottles.forEach((bottle, i) => {
      bottle.position.y = originalOtterPosition.y + 0.05 + Math.sin(time + i) * 0.01;
    });

    pollutionParticles.forEach((points) => {
      const positions = points.geometry.attributes.position.array;
      const velocities = points.userData.velocities;

      for (let i = 0; i < positions.length; i += 3) {
        positions[i + 1] += velocities[i / 3];
        if (positions[i + 1] > originalOtterPosition.y + 1.0) {
          positions[i + 1] = originalOtterPosition.y;
        }
      }
      points.geometry.attributes.position.needsUpdate = true;
    });
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
    if (hits.length > 0) {
      const pose = hits[0].getPose(referenceSpace);
      reticle.visible = true;
      reticle.matrix.fromArray(pose.transform.matrix);
    } else {
      reticle.visible = false;
    }
  }

  renderer.render(scene, camera);
}

function showPathChoices() {
  loader.load('/assets/models/tree.glb', (gltf) => {
    treeModel = gltf.scene;
    treeModel.scale.set(0.05, 0.05, 0.05);
    treeModel.position.set(otter.position.x - 0.25, otter.position.y, otter.position.z - 0.4);
    scene.add(treeModel);

    const boxGeo = new THREE.BoxGeometry(0.2, 0.2, 0.2);
    const boxMat = new THREE.MeshBasicMaterial({ visible: false });
    treeClickBox = new THREE.Mesh(boxGeo, boxMat);
    treeClickBox.position.copy(treeModel.position);
    treeClickBox.name = 'tree';
    scene.add(treeClickBox);
  });

  loader.load('/assets/models/path.glb', (gltf) => {
    pollutedBottle = gltf.scene;
    pollutedBottle.scale.set(0.06, 0.06, 0.06);
    pollutedBottle.position.set(otter.position.x + 0.25, otter.position.y, otter.position.z - 0.4);
    scene.add(pollutedBottle);

    const boxGeo = new THREE.BoxGeometry(0.2, 0.2, 0.2);
    const boxMat = new THREE.MeshBasicMaterial({ visible: false });
    pollutedClickBox = new THREE.Mesh(boxGeo, boxMat);
    pollutedClickBox.position.copy(pollutedBottle.position);
    pollutedClickBox.name = 'polluted';
    scene.add(pollutedClickBox);
  });

  choiceBoxesAdded = true;
}

function spawnPlasticBottles() {
  const offsets = [
    [-0.15, 0], [0.15, 0], [0, 0.15], [0, -0.15], [0.1, 0.1]
  ];

  offsets.forEach((offset, i) => {
    loader.load('/assets/models/plastic_bottle.glb', (gltf) => {
      const bottle = gltf.scene;
      bottle.scale.set(0.015, 0.015, 0.015);
      bottle.position.set(
        otter.position.x + offset[0],
        otter.position.y + 0.05,
        otter.position.z + offset[1]
      );
      plasticBottles.push(bottle);
      scene.add(bottle);
    });
  });
}

function showTryAgainButton() {
  if (tryAgainButton) return;

  tryAgainButton = document.createElement('button');
  tryAgainButton.textContent = 'Try the other path';
  Object.assign(tryAgainButton.style, {
    position: 'absolute',
    bottom: '20px',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: '1000',
    padding: '10px 20px',
    background: '#555',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
    cursor: 'pointer'
  });

  tryAgainButton.onclick = () => {
    riverPathSelected = false;
    pollutedPathSelected = false;
    choiceBoxesAdded = false;
    removePathPrompt();

    if (treeModel) scene.remove(treeModel);
    if (treeClickBox) scene.remove(treeClickBox);
    if (pollutedBottle) scene.remove(pollutedBottle);
    if (pollutedClickBox) scene.remove(pollutedClickBox);
    plasticBottles.forEach(b => scene.remove(b));
    plasticBottles = [];
    pollutionParticles.forEach(p => scene.remove(p));
    pollutionParticles = [];

    otter.position.copy(originalOtterPosition);
    showPathChoices();
    tryAgainButton.remove();
    tryAgainButton = null;
  };

  document.body.appendChild(tryAgainButton);
}

renderer.domElement.addEventListener('click', (event) => {
  if (!treeClickBox && !pollutedClickBox) return;

  const mouse = new THREE.Vector2(
    (event.clientX / window.innerWidth) * 2 - 1,
    -(event.clientY / window.innerHeight) * 2 + 1
  );

  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(mouse, camera);
  const targets = [];
  if (treeClickBox) targets.push(treeClickBox);
  if (pollutedClickBox) targets.push(pollutedClickBox);

  const intersects = raycaster.intersectObjects(targets, true);

  if (intersects.length > 0) {
    const name = intersects[0].object.name;
    removePathPrompt();

    if (name === 'tree') {
      riverPathSelected = true;
      scene.remove(treeModel, treeClickBox, pollutedBottle, pollutedClickBox);
      showTryAgainButton();
      narrationEl.innerHTML = `<span class="char">You chose the natural path. It’s slower, but smells fresh and feels right.</span>`;
      naturalAudio.play();
    } else if (name === 'polluted') {
      pollutedPathSelected = true;
      scene.remove(treeModel, treeClickBox, pollutedBottle, pollutedClickBox);
      spawnPlasticBottles();
      createPollutionParticles();
      showTryAgainButton();
      narrationEl.innerHTML = `<span class="char">You chose the fast path—but something’s off. The water stinks. It’s not safe here.</span>`;
      pollutedAudio.play();
    }
  }
});

window.showPopup = function (type) {
  const popup = document.getElementById('popupOverlay');
  const content = document.getElementById('popupText');

  if (type === 'chemical') {
    content.innerHTML = `
      <strong>Chemical Clues</strong>
      <p>Otters rely on smell to detect danger. Even low-level pollutants in urban runoff can disrupt their movement and health.</p>
      <img src="/assets/images/scent_overlay.png" alt="Scent Molecules" style="width:100%;margin-top:10px;border-radius:6px;">
      <img src="/assets/images/water_quality_gauge.png" alt="Water Gauge" style="width:100%;margin-top:10px;border-radius:6px;">
    `;
  }

  popup.style.display = 'flex';
};

document.getElementById('popupClose').onclick = () => {
  document.getElementById('popupOverlay').style.display = 'none';
};