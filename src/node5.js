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
let obstacle;
let obstacleHealth = 3;
let popupShown = false;

const infoBoxEl = document.getElementById('infoBox');
const narrationEl = document.getElementById('narrationText');
const buttonBox = document.getElementById('extraButtons');
const audioEl = document.getElementById('narrationAudio');
const popupOverlay = document.getElementById('popupOverlay');
const popupText = document.getElementById('popupText');

const narrationText = `A wall. Not of rock or root, but of human hands. Pipes. Fences. Trash. I cannot pass — unless they choose to help.`;

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

function onSelect() {
  if (!reticle.visible || otter) return;

  const position = new THREE.Vector3();
  position.setFromMatrixPosition(reticle.matrix);

  addGroundAt(position);
  loadOtter(position);
  playNarration();
  createBackToMapButton();

  otterPlaced = true;
  reticle.visible = false;
}

function addGroundAt(position) {
  const loader = new THREE.TextureLoader();
  loader.load('/assets/images/node5_bg.png', (texture) => {
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

    const mat = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
    backgroundPlane = new THREE.Mesh(geo, mat);
    backgroundPlane.rotation.x = -Math.PI / 2;
    backgroundPlane.position.copy(position);
    backgroundPlane.position.y -= 0.01;
    scene.add(backgroundPlane);
  });
}

function loadOtter(position) {
  const loader = new GLTFLoader();
  loader.load('/assets/models/otter.glb', (gltf) => {
    otter = gltf.scene;
    otter.scale.set(0.5, 0.5, 0.5);

    // ✅ 在 reticle 的位置基础上往摄像机方向偏移
    const camDir = new THREE.Vector3();
    camera.getWorldDirection(camDir);
    camDir.normalize();

    // 偏移量（数值可调，正值往摄像机靠近，0.3 表示靠近 30cm）
    const offset = camDir.multiplyScalar(-0.3); 
    const adjustedPos = position.clone().add(offset);

    otter.position.copy(adjustedPos);
    otter.rotation.y = Math.PI; // 面朝摄像机
    scene.add(otter);

    if (gltf.animations.length > 0) {
      mixer = new THREE.AnimationMixer(otter);
      gltf.animations.forEach((clip) => {
        mixer.clipAction(clip).play();
      });
    }

    placeObstacleInFrontOf(otter);
    showClickPrompt(); 
  });

  infoBoxEl.style.display = 'block';
  narrationEl.innerHTML = '';
  buttonBox.style.display = 'none';
}

function placeObstacleInFrontOf(model) {
  const loader = new GLTFLoader();
  loader.load('/assets/models/wall.glb', (gltf) => {
    obstacle = gltf.scene;
    obstacle.scale.set(1.2, 0.2, 0.2); // 可根据实际模型调整
    const direction = new THREE.Vector3(0, 0, 1).applyEuler(model.rotation).normalize();
    const offset = direction.multiplyScalar(1.5);
    obstacle.position.copy(model.position.clone().add(offset));
    obstacle.position.y += 0.01;
    scene.add(obstacle);
  });
}

function onSceneClick(event) {
  if (!obstacle || obstacleHealth <= 0) return;

  const mouse = new THREE.Vector2(
    (event.clientX / window.innerWidth) * 2 - 1,
    -(event.clientY / window.innerHeight) * 2 + 1
  );

  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObject(obstacle, true); // 支持 Group / 子 Mesh 检测
  if (intersects.length > 0) {
    obstacleHealth--;
    if (intersects.length > 0) {
  obstacleHealth--;
  
  // ⚠️ 给被点击的 Mesh 改色（只第一次有效）
  const clickedMesh = intersects[0].object;
  if (clickedMesh.material && clickedMesh.material.color) {
    clickedMesh.material.color.offsetHSL(0.05, -0.1, 0.1);
  }

  if (obstacleHealth <= 0) {
    scene.remove(obstacle);
    targetPosition = obstacle.position.clone().add(new THREE.Vector3(0, 0, 0.5));
    showNextNodeButton();
    showImpactPopup();
  }
}
    if (obstacleHealth <= 0) {
      scene.remove(obstacle);
      targetPosition = obstacle.position.clone().add(new THREE.Vector3(0, 0, 0.5));
      showNextNodeButton();
      showImpactPopup();
    }
  }
}

function showImpactPopup() {
  if (popupShown) return;
  popupText.innerHTML = `
    <strong>Urban Obstacles</strong>
    <p>More than 60% of otter habitats in Cork have been disrupted by construction in the past 5 years.</p>
    <img src="/assets/images/urban_block.png" alt="Construction impact" style="width:100%;margin-top:10px;border-radius:6px;">
  `;
  popupOverlay.style.display = 'flex';
  popupShown = true;
}

document.getElementById('popupClose').onclick = () => {
  popupOverlay.style.display = 'none';
};

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

function showNextNodeButton() {
  const button = document.createElement('button');
  button.textContent = '→ Go to Node 6';
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
    window.location.href = '/node6.html';
  };
  document.body.appendChild(button);
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

// ✅ 新增提示框逻辑（不影响其它功能）
function showClickPrompt() {
  const promptEl = document.createElement('div');
  promptEl.id = 'tapPrompt';
  Object.assign(promptEl.style, {
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
  promptEl.innerText = 'Tap the obstacle to help the otter move forward.';
  document.body.appendChild(promptEl);

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