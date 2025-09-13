// node3.js

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ARButton } from 'three/examples/jsm/webxr/ARButton.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';

let camera, scene, renderer, controller, reticle, otter, mixer;
let hitTestSource = null;
let hitTestSourceRequested = false;
const clock = new THREE.Clock();
let backgroundPlane = null;
let targetPosition = null;
let otterPlaced = false;
let foodItems = [];
let collectedCount = 0;
let sky;

let pathPromptEl = null;
const infoBoxEl = document.getElementById('infoBox');
const narrationEl = document.getElementById('narrationText');

const foodData = [
  {
    name: 'Crayfish',
    model: '/assets/models/Crayfish.glb',
    image: '/assets/images/food1.png',
    info: 'Crayfish help control aquatic plant growth.',
    scale: 0.005
  },
  {
    name: 'Crab',
    model: '/assets/models/Crab.glb',
    image: '/assets/images/food2.png',
    info: 'Crabs play a key role in the riverbed ecosystem.',
    scale: 0.005
  },
  {
    name: 'Anguilla anguilla',
    model: '/assets/models/Anguilla_anguilla.glb',
    image: '/assets/images/food3.png',
    info: 'European eels migrate thousands of kilometers.',
    scale: 0.005
  },
  {
    name: 'Salmo trutta',
    model: '/assets/models/Salmo_trutta.glb',
    image: '/assets/images/food4.png',
    info: 'Brown trout thrive in clean, oxygen-rich rivers.',
    scale: 0.05
  },
  {
    name: 'Salmo salar',
    model: '/assets/models/Salmo_salar.glb',
    image: '/assets/images/food5.png',
    info: 'Atlantic salmon are an indicator of river health.',
    scale: 0.005
  }
];

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
  renderer.domElement.addEventListener('click', onSceneClick);

  renderer.xr.addEventListener('sessionstart', () => {
    setupSky();
  });
}

function onSelect() {
  if (!reticle.visible || otterPlaced) return;

  const pos = new THREE.Vector3();
  pos.setFromMatrixPosition(reticle.matrix);

  placeCurvedBackground(pos);
  placeOtter(pos);
  placeFoodItems(pos);

  otterPlaced = true;
  reticle.visible = false;
}

function setupSky() {
  sky = new Sky();
  sky.scale.setScalar(1000);
  scene.add(sky);

  const skyUniforms = sky.material.uniforms;
  skyUniforms['turbidity'].value = 8;
  skyUniforms['rayleigh'].value = 3;
  skyUniforms['mieCoefficient'].value = 0.005;
  skyUniforms['mieDirectionalG'].value = 0.7;

  const sun = new THREE.Vector3();
  const phi = THREE.MathUtils.degToRad(85);
  const theta = THREE.MathUtils.degToRad(135);
  sun.setFromSphericalCoords(1, phi, theta);
  skyUniforms['sunPosition'].value.copy(sun);
}

function placeCurvedBackground(position) {
  const width = 6, height = 6, segments = 80;
  const geo = new THREE.PlaneGeometry(width, height, segments, segments);
  const posAttr = geo.attributes.position;

  const bendStart = 0.5;
  const bendStrength = 5.0;
  const bendSmooth = 1.5;

  for (let i = 0; i < posAttr.count; i++) {
    const y = posAttr.getY(i);
    const z = posAttr.getZ(i);

    if (y > bendStart) {
      let bendFactor = (y - bendStart) / (height - bendStart);
      bendFactor = Math.pow(bendFactor, bendSmooth);
      posAttr.setZ(i, z + bendStrength * bendFactor);
    }
  }

  posAttr.needsUpdate = true;
  geo.computeVertexNormals();

  const video = document.createElement('video');
  video.src = '/assets/videos/node3_bg.mp4';
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

function placeOtter(pos) {
  const loader = new GLTFLoader();
  loader.load('/assets/models/otter.glb', (gltf) => {
    otter = gltf.scene;
    otter.scale.set(0.4, 0.4, 0.4);
    otter.position.copy(pos);
    otter.rotation.y = Math.PI;
    scene.add(otter);

    if (gltf.animations.length > 0) {
      mixer = new THREE.AnimationMixer(otter);
      gltf.animations.forEach((clip) => mixer.clipAction(clip).play());
    }

    showInfoBox();
    createBackToMapButton();
    showTapPrompt();
    createProgressBar();
  });
}

function placeFoodItems(center) {
  const loader = new GLTFLoader();
  const minDistance = 0.8;
  const halfSize = 3;

  foodData.forEach((food) => {
    loader.load(food.model, (gltf) => {
      const item = gltf.scene;
      const scale = food.scale || 0.02;
      item.scale.set(scale, scale, scale);

      let offset, candidatePos, attempts = 0;
      do {
        offset = new THREE.Vector3(
          (Math.random() - 0.5) * 4,
          0,
          Math.random() * 3 + 0.5
        );
        candidatePos = center.clone().add(offset);

        const withinBounds =
          candidatePos.x >= center.x - halfSize &&
          candidatePos.x <= center.x + halfSize &&
          candidatePos.z >= center.z - halfSize &&
          candidatePos.z <= center.z + halfSize;

        attempts++;
        if (candidatePos.distanceTo(center) < minDistance || !withinBounds) {
          continue;
        } else {
          break;
        }
      } while (attempts < 50);

      item.position.copy(candidatePos);
      scene.add(item);

      // ✅ 保存浮动基准高度和相位
      foodItems.push({
        mesh: item,
        baseY: item.position.y,
        phase: Math.random() * Math.PI * 2,
        ...food
      });
    });
  });
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
    const dir = new THREE.Vector3().subVectors(targetPosition, otter.position);
    const dist = dir.length();
    if (dist > 0.02) {
      dir.normalize();
      otter.position.addScaledVector(dir, delta * 0.4);
      otter.lookAt(targetPosition);
    } else {
      targetPosition = null;
    }
  }

  // ✅ 更新食物浮动动画
  const elapsed = clock.getElapsedTime();
  foodItems.forEach((food) => {
    food.mesh.position.y = food.baseY + Math.sin(elapsed * 1.5 + food.phase) * 0.05;
  });

  checkFoodCollision();

  const session = renderer.xr.getSession();
  if (session && !hitTestSourceRequested) {
    session.requestReferenceSpace('viewer').then((refSpace) => {
      session.requestHitTestSource({ space: refSpace }).then((source) => {
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

function checkFoodCollision() {
  if (!otter) return;

  for (let i = foodItems.length - 1; i >= 0; i--) {
    const food = foodItems[i];
    const dist = otter.position.distanceTo(food.mesh.position);
    if (dist < 0.25) {
      scene.remove(food.mesh);
      foodItems.splice(i, 1);
      collectedCount++;
      updateProgressBar();
      showFoodInfo(food);

      const findSound = document.getElementById('findSound');
      if (findSound) {
        findSound.currentTime = 0;
        findSound.play().catch(() => {});
      }
    }
  }
}

function showInfoBox() {
  const narration = `A splash. Then another. Trout. I dive—quick, silent, precise.\nThe Lee is kind to me today. The water tastes clean, alive.\nBut it isn’t always this way...\n\n Help me find all 5 food items!`;
  playNarrationTextWithAudio(narration);
  infoBoxEl.style.display = 'block';
  const audio = document.getElementById('narrationAudio');
  audio.play().catch(() => {});
}

function playNarrationTextWithAudio(narration) {
  const audio = document.getElementById('narrationAudio');
  const textContainer = document.getElementById('narrationText');
  textContainer.innerHTML = '';

  let index = 0;
  audio.play().catch(() => {});
  const interval = setInterval(() => {
    if (index < narration.length) {
      const span = document.createElement('span');
      span.textContent = narration[index];
      span.style.opacity = 0;
      span.style.transition = 'opacity 0.3s';
      textContainer.appendChild(span);
      requestAnimationFrame(() => {
        span.style.opacity = 1;
      });
      index++;
    } else {
      clearInterval(interval);
    }
  }, 40);

  audio.onended = () => {
    const bgm = document.getElementById('bgmAudio');
    if (bgm) {
      bgm.play().catch(() => {});
    }
  };
}

function showFoodInfo(food) {
  const popup = document.getElementById('popupOverlay');
  const content = document.getElementById('popupText');
  content.innerHTML = `
    <strong>${food.name}</strong>
    <p>${food.info}</p>
    <img src="${food.image}" alt="${food.name}" style="width:100%;margin-top:10px;border-radius:6px;">
  `;
  popup.style.display = 'flex';
}

document.getElementById('popupClose').onclick = () => {
  document.getElementById('popupOverlay').style.display = 'none';
};

function createBackToMapButton() {
  const button = document.createElement('button');
  button.textContent = '← Back to Map';
  Object.assign(button.style, {
    position: 'absolute', bottom: '20px', left: '20px', zIndex: '1000',
    background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none',
    padding: '10px 16px', borderRadius: '8px', fontSize: '14px', cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
  });
  button.onclick = () => {
    window.location.href = '/index.html';
  };
  document.body.appendChild(button);
}

function showTapPrompt() {
  pathPromptEl = document.createElement('div');
  pathPromptEl.id = 'tapPrompt';
  Object.assign(pathPromptEl.style, {
    position: 'absolute', bottom: '80px', left: '50%', transform: 'translateX(-50%)',
    background: 'rgba(0,0,0,0.75)', color: '#fff', padding: '6px 16px', borderRadius: '8px',
    fontSize: '14px', fontWeight: 'normal', zIndex: '1000',
    boxShadow: '0 2px 6px rgba(0,0,0,0.3)', maxWidth: '80%', textAlign: 'center', lineHeight: '1.4'
  });
  pathPromptEl.innerText = 'Tap to guide the otter to eat the food.';
  document.body.appendChild(pathPromptEl);
}

function createProgressBar() {
  const bar = document.createElement('div');
  bar.id = 'progressBar';
  Object.assign(bar.style, {
    width: '100%', height: '12px', background: '#ddd', borderRadius: '8px',
    marginTop: '16px', overflow: 'hidden'
  });

  const inner = document.createElement('div');
  inner.id = 'progressBarInner';
  Object.assign(inner.style, {
    width: '0%', height: '100%', background: '#4caf50', transition: 'width 0.3s'
  });

  bar.appendChild(inner);
  infoBoxEl.appendChild(bar);
}

function updateProgressBar() {
  const inner = document.getElementById('progressBarInner');
  if (!inner) return;

  inner.style.width = `${(collectedCount / 5) * 100}%`;

  if (collectedCount >= 5) {
    if (pathPromptEl) pathPromptEl.remove();

    showCongratsToast();
    showContinueButton();
  }
}

function showCongratsToast() {
  const toast = document.createElement('div');
  toast.innerText = '🎉 Congrats! You found all the food!';
  Object.assign(toast.style, {
    position: 'absolute',
    top: '30px',
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'rgba(0, 0, 0, 0.8)',
    color: '#fff',
    padding: '12px 50px',
    borderRadius: '8px',
    fontSize: '20px',
    zIndex: '1000',
    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
    transition: 'opacity 0.5s',
    opacity: '1'
  });

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => document.body.removeChild(toast), 1000);
  }, 2500);
}

function showContinueButton() {
  infoBoxEl.style.display = 'none';
  const button = document.createElement('button');
  button.textContent = '→ Continue to Node 4';
  Object.assign(button.style, {
    position: 'absolute', bottom: '100px', left: '50%', transform: 'translateX(-50%)',
    zIndex: '1000', background: '#0077aa', color: 'white', border: 'none',
    padding: '10px 18px', borderRadius: '8px', fontSize: '16px', cursor: 'pointer',
    boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
  });
  button.onclick = () => {
    window.location.href = '/node4.html';
  };
  document.body.appendChild(button);
}