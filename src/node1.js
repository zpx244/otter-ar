// Import necessary modules from Three.js
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ARButton } from 'three/examples/jsm/webxr/ARButton.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';

// Global variables
let camera, scene, renderer, controller, reticle, mixer;
let hitTestSource = null;
let hitTestSourceRequested = false;
let backgroundPlane = null;
let targetPosition = null;
let holt = null;
let otter = null;
let continueZone = null;
let enterButtonShown = false;
let holtPlaced = false;
let otterPlaced = false;

//  Clock and UI references
const clock = new THREE.Clock();
const infoBoxEl = document.getElementById('infoBox');
const narrationEl = document.getElementById('narrationText');
const buttonBox = document.getElementById('extraButtons');
const audioEl = document.getElementById('narrationAudio');
const bgm = document.getElementById('bgm');
let bgmStarted = false;
let pathPromptEl = null;

//  Narration content to display
const narrationText = `The first light of day breaks over rooftops. Beneath the brambles, I stir. My holt is hidden from human eyes, tucked deep in the upper Bride’s shadows. The stream here is narrow, but it smells of life — earth, leaf, dew. I slide into the water. 
Today, like every day, I must patrol, mark, and feed. The city is loud, but I know where to listen. This river is mine. For now.
`;

//  Initialize the AR scene
init();

function init() {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera();
  const hemiLight = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1);
  hemiLight.position.set(0.5, 1, 0.25);
  scene.add(hemiLight);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.xr.enabled = true;
  document.body.appendChild(renderer.domElement);

  const arButton = ARButton.createButton(renderer, { requiredFeatures: ['hit-test'] });
  arButton.className = 'webxr-button';
  document.body.appendChild(arButton);
  setTimeout(() => {
    arButton.textContent = ' Morning Departure';
    arButton.removeAttribute('style');
  }, 100);

  renderer.xr.addEventListener('sessionstart', () => {
    setupSky();
  });

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

function setupSky() {
  const sky = new Sky();
  sky.scale.setScalar(450000);
  scene.add(sky);

  const uniforms = sky.material.uniforms;
  uniforms['turbidity'].value = 8;
  uniforms['rayleigh'].value = 2;
  uniforms['mieCoefficient'].value = 0.005;
  uniforms['mieDirectionalG'].value = 0.7;

  const sun = new THREE.Vector3();
  const phi = THREE.MathUtils.degToRad(90 - 5);
  const theta = THREE.MathUtils.degToRad(90);
  sun.setFromSphericalCoords(1, phi, theta);
  uniforms['sunPosition'].value.copy(sun);

  const pmremGen = new THREE.PMREMGenerator(renderer);
  scene.environment = pmremGen.fromScene(sky).texture;
}

function onSelect() {
  if (!reticle.visible || holtPlaced) return;
  startBackgroundMusic();
  const position = new THREE.Vector3();
  position.setFromMatrixPosition(reticle.matrix);
  placeCurvedBackground(position);
  placeHolt(position);
  reticle.visible = false;
}

function onSceneClick(event) {
  startBackgroundMusic();
  const mouse = new THREE.Vector2(
    (event.clientX / window.innerWidth) * 2 - 1,
    -(event.clientY / window.innerHeight) * 2 + 1
  );
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(mouse, camera);

  if (!otterPlaced && holt) {
    const intersects = raycaster.intersectObject(holt, true);
    if (intersects.length > 0) {
      generateOtterAt(holt.position.clone());
      return;
    }
  }

  if (otter && backgroundPlane) {
    const intersects = raycaster.intersectObject(backgroundPlane);
    if (intersects.length > 0) {
      targetPosition = intersects[0].point.clone();
    }
  }
}

function startBackgroundMusic() {
  if (bgm && !bgmStarted) {
    bgm.play().then(() => { bgmStarted = true; }).catch(() => {});
  }
}

function placeCurvedBackground(position) {
  const width = 6, height = 6, segments = 50;
  const geo = new THREE.PlaneGeometry(width, height, segments, segments);
  const posAttr = geo.attributes.position;

  for (let i = 0; i < posAttr.count; i++) {
    const y = posAttr.getY(i);
    const z = posAttr.getZ(i);
    if (y > 2) {
      const bendFactor = (Math.abs(y) - 2) / 2;
      posAttr.setZ(i, z + 3.0 * bendFactor * bendFactor);
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
  video.play().catch(() => {
    console.warn('Video playback failed — user gesture may be required');
  });

  const videoTexture = new THREE.VideoTexture(video);
  videoTexture.minFilter = THREE.LinearFilter;
  videoTexture.magFilter = THREE.LinearFilter;
  videoTexture.format = THREE.RGBFormat;

  const mat = new THREE.MeshBasicMaterial({ map: videoTexture, side: THREE.DoubleSide });
  backgroundPlane = new THREE.Mesh(geo, mat);
  backgroundPlane.rotation.x = -Math.PI / 2;
  backgroundPlane.position.copy(position);
  backgroundPlane.position.y -= 0.01;
  scene.add(backgroundPlane);
}


//  holt
function placeHolt(position) {
  const gltfLoader = new GLTFLoader();
  gltfLoader.load('/assets/models/holt.glb', (gltf) => {
    holt = gltf.scene;
    holt.scale.set(0.02, 0.02, 0.02);
    holt.position.set(position.x + 1.4, position.y + 0.06, position.z + 1.8);
    holt.rotation.y = Math.PI;
    holt.traverse((child) => { if (child.isMesh) child.userData.clickable = true; });
    scene.add(holt);
    holtPlaced = true;
    showInitialPrompt();
  });
}

// generate otter
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

    createContinueZone(position);
    infoBoxEl.style.display = 'block';
    narrationEl.innerHTML = '';
    buttonBox.style.display = 'none';

    playNarration();
    showPathPrompt();
    createBackToMapButton();

    otterPlaced = true;
  });
}

// Create the green "Continue" zone that acts as a trigger area for advancing to the next node
function createContinueZone(pos) {
  // Create a ring geometry rotated to lie flat on the ground
  const geo = new THREE.RingGeometry(0.25, 0.3, 32).rotateX(-Math.PI / 2);
   // Use a basic green material
  const mat = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
  // Create the mesh and place it slightly in front of the otter
  continueZone = new THREE.Mesh(geo, mat);
  continueZone.position.set(pos.x - 2, pos.y - 0.01, pos.z - 2.5);
  scene.add(continueZone);
}

// Display narration text with per-character fade-in effect, and play matching audio
function playNarration() {
  const chars = narrationText.split('');
  const delay = 60;
  let index = 0;

  // Inner function to recursively reveal each character
  function revealNextChar() {
    if (index >= chars.length) return showButtons();
    const span = document.createElement('span');
    span.className = 'char';
    span.innerHTML = chars[index] === ' ' ? '&nbsp;' : chars[index];
    narrationEl.appendChild(span);
    index++;
    setTimeout(revealNextChar, delay);
  }

  audioEl.play();// Start narration audio
  revealNextChar();// Begin character animation
}

// Show interactive buttons inside the infoBox after narration ends
function showButtons() {
  buttonBox.innerHTML = `
    <button onclick="showPopup('holt')">What’s a Holt?</button>
    <button onclick="showPopup('fact')">Did You Know?</button>
  `;
  buttonBox.style.display = 'block';
}

// First user prompt – shown after placing the holt, to guide user to tap it
function showInitialPrompt() {
  if (pathPromptEl) pathPromptEl.remove();
  pathPromptEl = document.createElement('div');
  pathPromptEl.innerText = 'Tap the holt to release the otter.';
  // Apply inline styles to position and style the prompt
  Object.assign(pathPromptEl.style, {
    position: 'absolute', bottom: '80px', left: '50%',
    transform: 'translateX(-50%)',
    background: 'rgba(0,0,0,0.75)', color: '#fff',
    padding: '6px 16px', borderRadius: '8px',
    fontSize: '14px', zIndex: '1000', maxWidth: '80%', textAlign: 'center'
  });
  document.body.appendChild(pathPromptEl);
}

//  Second user prompt – shown after otter is released, to instruct user to guide it
function showPathPrompt() {
  if (pathPromptEl) pathPromptEl.remove();
  pathPromptEl = document.createElement('div');
  pathPromptEl.innerText = 'Tap on the image to guide the otter forward.';
  Object.assign(pathPromptEl.style, {
    position: 'absolute', bottom: '80px', left: '50%',
    transform: 'translateX(-50%)',
    background: 'rgba(0,0,0,0.75)', color: '#fff',
    padding: '6px 16px', borderRadius: '8px',
    fontSize: '14px', zIndex: '1000', maxWidth: '80%', textAlign: 'center'
  });
  document.body.appendChild(pathPromptEl);
}

//  Add a "← Back to Map" button in the bottom-left corner
function createBackToMapButton() {
  const button = document.createElement('button');
  button.textContent = '← Back to Map';
  // Inline styles to match the rest of the UI
  Object.assign(button.style, {
    position: 'absolute', bottom: '20px', left: '20px', zIndex: '1000',
    background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none',
    padding: '10px 16px', borderRadius: '8px', fontSize: '14px', cursor: 'pointer'
  });
  button.onclick = () => window.location.href = '/index.html';
  document.body.appendChild(button);
}

// Render loop to update scene every frame
function render(timestamp, frame) {
  const delta = clock.getDelta();
  if (mixer) mixer.update(delta);

  // Move the otter toward the clicked target position
  if (otter && targetPosition) {
    const direction = new THREE.Vector3().subVectors(targetPosition, otter.position);
    const distance = direction.length();
    if (distance > 0.02) {
      direction.normalize();
      otter.position.addScaledVector(direction, delta * 0.3);
      otter.lookAt(targetPosition);
      // If otter reaches continue zone, show enter button
      if (continueZone && !enterButtonShown && otter.position.distanceTo(continueZone.position) < 0.5) {
        showEnterNextButton();
        enterButtonShown = true;
      }
    } else {
      targetPosition = null;
    }
  }

  // Perform AR hit test to position reticle
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

  if (frame && hitTestSource) {
    const referenceSpace = renderer.xr.getReferenceSpace();
    const hits = frame.getHitTestResults(hitTestSource);
    if (hits.length > 0 && !holtPlaced) {
      const pose = hits[0].getPose(referenceSpace);
      reticle.visible = true;
      reticle.matrix.fromArray(pose.transform.matrix);
    } else {
      reticle.visible = false;
    }
  }

  renderer.render(scene, camera);
}

// Show "Enter Node 2" button when otter reaches goal
function showEnterNextButton() {
  const button = document.createElement('button');
  button.textContent = '→ Enter Node 2';
  Object.assign(button.style, {
    position: 'absolute', bottom: '20px', right: '20px', zIndex: '1000',
    background: 'rgba(0,128,0,0.7)', color: '#fff', border: 'none',
    padding: '10px 16px', borderRadius: '8px', fontSize: '14px', cursor: 'pointer'
  });
  button.onclick = () => window.location.href = '/node2.html';
  document.body.appendChild(button);
}

//  Keep popup overlay function as-is
window.showPopup = function (type) {
  const popup = document.getElementById('popupOverlay');
  const content = document.getElementById('popupText');
  if (type === 'holt') {
    content.innerHTML = `
      <strong>What’s a Holt?</strong>
      <p>“A holt is an otter’s home—usually a tunnel or hidden space among roots, rocks, or even urban pipes. In cities, otters often adapt abandoned drains!”</p>
      <img src="/assets/images/holt_diagram.png" alt="Holt Diagram" style="width:100%;margin-top:10px;border-radius:6px;">
    `;
  } else if (type === 'fact') {
    content.innerHTML = `
      <strong>Did You Know?</strong>
      <p>“Urban otters in Cork have been spotted as far upstream as Blackpool, using storm drains as travel routes.”</p>
      <a href="https://www.ucc.ie/en/" target="_blank">View UCC tracking data</a>
    `;
  }
  popup.style.display = 'flex';
};

// Close popup button logic
document.getElementById('popupClose').onclick = () => {
  document.getElementById('popupOverlay').style.display = 'none';
};