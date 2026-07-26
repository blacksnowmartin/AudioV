import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.164.0/build/three.module.js';

const app = document.getElementById('app');
const status = document.getElementById('status');
const fileInput = document.getElementById('fileInput');
const micButton = document.getElementById('micButton');
const playButton = document.getElementById('playButton');

let scene;
let camera;
let renderer;
let barsGroup;
let ring;
let pointLight;
let particleSystem;
let analyserNode;
let audioContext;
let audioElement;
let mediaElementSource;
let activeInput;
let analyserData;
let waveformData;
let analyserConnected = false;
let rendererMode = 'three';
let canvasContext = null;
let canvasElement = null;
let activeObjectUrl = null;

function initScene() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020617);
  scene.fog = new THREE.Fog(0x020617, 10, 70);

  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 4, 18);

  try {
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    app.appendChild(renderer.domElement);
    rendererMode = 'three';
    status.textContent = 'WebGL renderer available. Choose a track or start the microphone to begin.';
  } catch (error) {
    rendererMode = 'canvas';
    canvasElement = document.createElement('canvas');
    canvasElement.width = window.innerWidth * (window.devicePixelRatio || 1);
    canvasElement.height = window.innerHeight * (window.devicePixelRatio || 1);
    canvasElement.style.width = '100%';
    canvasElement.style.height = '100%';
    app.appendChild(canvasElement);
    canvasContext = canvasElement.getContext('2d');
    status.textContent = 'WebGL is unavailable, so a canvas fallback is active instead.';
  }

  if (rendererMode === 'three') {
    setupThreeScene();
  }

  window.addEventListener('resize', onWindowResize);
}

function setupThreeScene() {
  const ambientLight = new THREE.AmbientLight(0x94a3b8, 0.8);
  scene.add(ambientLight);

  pointLight = new THREE.PointLight(0x38bdf8, 2.6, 80, 2);
  pointLight.position.set(0, 10, 10);
  scene.add(pointLight);

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(9, 96),
    new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.7, metalness: 0.2 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -2.4;
  scene.add(floor);

  barsGroup = new THREE.Group();
  scene.add(barsGroup);

  const barCount = 64;
  const radius = 6.2;
  for (let i = 0; i < barCount; i += 1) {
    const geometry = new THREE.CylinderGeometry(0.2, 0.2, 1.2, 12, 1);
    const material = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color().setHSL(i / barCount, 0.8, 0.58),
      emissive: new THREE.Color().setHSL(i / barCount, 0.8, 0.14),
      emissiveIntensity: 0.22,
      roughness: 0.2,
      metalness: 0.18,
      clearcoat: 0.45,
      transparent: true,
      opacity: 0.95,
    });

    const mesh = new THREE.Mesh(geometry, material);
    const angle = (i / barCount) * Math.PI * 2;
    mesh.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
    mesh.rotation.y = angle;
    mesh.rotation.z = Math.PI / 2;
    mesh.scale.y = 0.8;
    mesh.scale.x = 1;
    mesh.scale.z = 1;
    mesh.position.y = -0.35;
    barsGroup.add(mesh);
  }

  const ringGeometry = new THREE.TorusGeometry(5.4, 0.07, 16, 128);
  const ringMaterial = new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.32 });
  ring = new THREE.Mesh(ringGeometry, ringMaterial);
  ring.rotation.x = Math.PI / 2;
  scene.add(ring);

  const particleCount = 1600;
  const particleGeometry = new THREE.BufferGeometry();
  const particlePositions = new Float32Array(particleCount * 3);
  for (let i = 0; i < particleCount; i += 1) {
    const angle = (i / particleCount) * Math.PI * 2;
    const radius = 2.2 + (i % 7) * 0.15;
    particlePositions[i * 3] = Math.cos(angle) * radius;
    particlePositions[i * 3 + 1] = (Math.random() - 0.5) * 2.2;
    particlePositions[i * 3 + 2] = Math.sin(angle) * radius;
  }
  particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
  const particleMaterial = new THREE.PointsMaterial({
    color: 0x38bdf8,
    size: 0.04,
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
    sizeAttenuation: true,
  });
  particleSystem = new THREE.Points(particleGeometry, particleMaterial);
  scene.add(particleSystem);
}

function onWindowResize() {
  if (rendererMode === 'three') {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    return;
  }

  if (canvasElement && canvasContext) {
    const dpr = window.devicePixelRatio || 1;
    canvasElement.width = window.innerWidth * dpr;
    canvasElement.height = window.innerHeight * dpr;
    canvasContext.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
}

async function ensureAudioContext() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioContext.state === 'suspended') {
    await audioContext.resume();
  }
  if (!analyserNode) {
    analyserNode = audioContext.createAnalyser();
    analyserNode.fftSize = 2048;
    analyserNode.smoothingTimeConstant = 0.88;
    analyserData = new Uint8Array(analyserNode.frequencyBinCount);
    waveformData = new Uint8Array(analyserNode.fftSize / 2);
  }
  if (!analyserConnected) {
    analyserNode.connect(audioContext.destination);
    analyserConnected = true;
  }
}

function disconnectActiveInput() {
  if (activeInput) {
    activeInput.disconnect();
    activeInput = null;
  }
}

async function startMicInput() {
  try {
    await ensureAudioContext();
    disconnectActiveInput();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const streamSource = audioContext.createMediaStreamSource(stream);
    streamSource.connect(analyserNode);
    activeInput = streamSource;
    status.textContent = 'Microphone connected. Move around to shape the scene.';
    playButton.disabled = true;
  } catch (error) {
    status.textContent = `Microphone access was blocked: ${error.message}`;
  }
}

function waitForAudioReady(element) {
  if (element.readyState >= 2) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      element.removeEventListener('canplaythrough', onReady);
      element.removeEventListener('error', onError);
    };
    const onReady = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error('The selected file could not be decoded.'));
    };

    element.addEventListener('canplaythrough', onReady, { once: true });
    element.addEventListener('error', onError, { once: true });
    element.load();
  });
}

async function loadTrack(file) {
  if (!file) return;
  try {
    await ensureAudioContext();
    disconnectActiveInput();

    if (!audioElement) {
      audioElement = new Audio();
      audioElement.loop = true;
      audioElement.crossOrigin = 'anonymous';
      audioElement.addEventListener('ended', () => {
        playButton.textContent = 'Play';
      });
    }

    if (activeObjectUrl) {
      URL.revokeObjectURL(activeObjectUrl);
    }

    const objectUrl = URL.createObjectURL(file);
    activeObjectUrl = objectUrl;
    audioElement.src = objectUrl;
    audioElement.currentTime = 0;
    audioElement.volume = 1;

    if (!mediaElementSource) {
      mediaElementSource = audioContext.createMediaElementSource(audioElement);
    }

    mediaElementSource.disconnect();
    mediaElementSource.connect(analyserNode);
    activeInput = mediaElementSource;

    await waitForAudioReady(audioElement);

    playButton.disabled = false;
    playButton.textContent = 'Play';
    status.textContent = 'Track ready. Press play to begin.';
  } catch (error) {
    status.textContent = `Unable to load track: ${error.message}`;
  }
}

async function togglePlayback() {
  if (!audioElement) return;
  if (audioContext.state === 'suspended') {
    await audioContext.resume();
  }

  try {
    if (audioElement.paused) {
      await audioElement.play();
      playButton.textContent = 'Pause';
      status.textContent = 'Playback started.';
    } else {
      audioElement.pause();
      playButton.textContent = 'Play';
      status.textContent = 'Playback paused.';
    }
  } catch (error) {
    status.textContent = `Playback failed: ${error.message}`;
  }
}

function drawCanvasFrame(beat) {
  if (!canvasElement || !canvasContext) return;
  const width = canvasElement.clientWidth;
  const height = canvasElement.clientHeight;
  const dpr = window.devicePixelRatio || 1;

  if (canvasElement.width !== width * dpr || canvasElement.height !== height * dpr) {
    canvasElement.width = width * dpr;
    canvasElement.height = height * dpr;
    canvasContext.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  canvasContext.clearRect(0, 0, width, height);
  const gradient = canvasContext.createRadialGradient(width * 0.5, height * 0.35, 10, width * 0.5, height * 0.35, height * 0.7);
  gradient.addColorStop(0, `rgba(34, 211, 238, ${0.15 + beat * 0.1})`);
  gradient.addColorStop(1, 'rgba(2, 6, 23, 1)');
  canvasContext.fillStyle = gradient;
  canvasContext.fillRect(0, 0, width, height);

  const barCount = 72;
  const barWidth = width / (barCount * 1.2);
  const centerY = height * 0.55;
  const maxHeight = height * 0.4;
  for (let i = 0; i < barCount; i += 1) {
    const value = analyserData[Math.floor((i / barCount) * analyserData.length)] / 255;
    const barHeight = 14 + value * maxHeight;
    const x = width * 0.1 + i * barWidth * 1.1;
    const hue = 185 + value * 120;
    const color = `hsl(${hue}, 85%, ${50 + value * 15}%)`;
    const glow = canvasContext.createLinearGradient(x, centerY - barHeight / 2, x, centerY + barHeight / 2);
    glow.addColorStop(0, color);
    glow.addColorStop(1, 'rgba(248, 250, 252, 0.9)');

    const radius = Math.max(6, barWidth * 0.4);
    canvasContext.beginPath();
    canvasContext.moveTo(x + radius, centerY - barHeight / 2);
    canvasContext.lineTo(x + barWidth - radius, centerY - barHeight / 2);
    canvasContext.quadraticCurveTo(x + barWidth, centerY - barHeight / 2, x + barWidth, centerY - barHeight / 2 + radius);
    canvasContext.lineTo(x + barWidth, centerY + barHeight / 2 - radius);
    canvasContext.quadraticCurveTo(x + barWidth, centerY + barHeight / 2, x + barWidth - radius, centerY + barHeight / 2);
    canvasContext.lineTo(x + radius, centerY + barHeight / 2);
    canvasContext.quadraticCurveTo(x, centerY + barHeight / 2, x, centerY + barHeight / 2 - radius);
    canvasContext.lineTo(x, centerY - barHeight / 2 + radius);
    canvasContext.quadraticCurveTo(x, centerY - barHeight / 2, x + radius, centerY - barHeight / 2);
    canvasContext.closePath();
    canvasContext.fillStyle = glow;
    canvasContext.shadowBlur = 16 + value * 12;
    canvasContext.shadowColor = `hsla(${hue}, 90%, 65%, 0.7)`;
    canvasContext.fill();
    canvasContext.shadowBlur = 0;
  }

  canvasContext.beginPath();
  canvasContext.moveTo(0, height * 0.82);
  for (let i = 0; i < waveformData.length; i += 1) {
    const sample = waveformData[i] / 255;
    const x = (i / (waveformData.length - 1)) * width;
    const y = height * 0.82 + (sample - 0.5) * 120;
    canvasContext.lineTo(x, y);
  }
  canvasContext.lineTo(width, height * 0.82);
  canvasContext.strokeStyle = `rgba(191, 219, 254, ${0.8 + beat * 0.1})`;
  canvasContext.lineWidth = 2.2;
  canvasContext.stroke();

  canvasContext.beginPath();
  canvasContext.arc(width * 0.5, height * 0.28, 50 + beat * 70, 0, Math.PI * 2);
  const pulseGradient = canvasContext.createRadialGradient(width * 0.5, height * 0.28, 10, width * 0.5, height * 0.28, 120 + beat * 80);
  pulseGradient.addColorStop(0, `rgba(125, 211, 252, ${0.55 + beat * 0.2})`);
  pulseGradient.addColorStop(1, 'rgba(125, 211, 252, 0)');
  canvasContext.fillStyle = pulseGradient;
  canvasContext.fill();

  canvasContext.beginPath();
  canvasContext.arc(width * 0.5, height * 0.28, 26 + beat * 15, 0, Math.PI * 2);
  canvasContext.strokeStyle = `rgba(191, 219, 254, ${0.75 + beat * 0.15})`;
  canvasContext.lineWidth = 3;
  canvasContext.stroke();
}

function animate() {
  requestAnimationFrame(animate);

  if (analyserNode) {
    analyserNode.getByteFrequencyData(analyserData);
    analyserNode.getByteTimeDomainData(waveformData);

    const averageEnergy = analyserData.slice(0, 64).reduce((sum, value) => sum + value, 0) / 64 / 255;
    const beat = Math.pow(averageEnergy, 1.3);

    if (rendererMode === 'three') {
      barsGroup.children.forEach((bar, index) => {
        const normalized = analyserData[Math.floor((index / barsGroup.children.length) * analyserData.length)] / 255;
        const targetHeight = 0.9 + normalized * 5.8;
        bar.scale.y = THREE.MathUtils.lerp(bar.scale.y, targetHeight, 0.16);
        bar.scale.x = THREE.MathUtils.lerp(bar.scale.x, 0.9 + normalized * 0.2, 0.16);
        bar.scale.z = THREE.MathUtils.lerp(bar.scale.z, 0.9 + normalized * 0.2, 0.16);
        bar.position.y = bar.scale.y / 2 - 1.45;
        const hue = 0.55 + normalized * 0.25;
        bar.material.color.setHSL(hue, 0.8, 0.55 + normalized * 0.15);
        bar.material.emissive.setHSL(hue, 0.9, 0.16 + normalized * 0.2);
        bar.material.emissiveIntensity = 0.2 + normalized * 0.7;
      });

      barsGroup.rotation.y += 0.006 + beat * 0.008;
      ring.rotation.z += 0.01;
      ring.scale.setScalar(1 + beat * 0.18);
      pointLight.intensity = 1.4 + beat * 2.4;
      scene.background.setHSL(0.6 + beat * 0.04, 0.6, 0.03 + beat * 0.025);

      const positions = particleSystem.geometry.attributes.position.array;
      const count = positions.length / 3;
      for (let i = 0; i < count; i += 1) {
        const angle = (i / count) * Math.PI * 2 + performance.now() * 0.00015;
        const wave = waveformData[i % waveformData.length] / 255;
        const radius = 2.2 + beat * 1.8 + wave * 1.3;
        positions[i * 3] = Math.cos(angle) * radius;
        positions[i * 3 + 1] = Math.sin(angle * 2 + beat * 2.4) * 1.6 + (wave - 0.5) * 1.4;
        positions[i * 3 + 2] = Math.sin(angle) * radius;
      }
      particleSystem.geometry.attributes.position.needsUpdate = true;
      renderer.render(scene, camera);
    } else {
      drawCanvasFrame(beat);
    }
  }
}

fileInput.addEventListener('change', (event) => {
  const [file] = event.target.files;
  if (file) {
    loadTrack(file);
  }
});

micButton.addEventListener('click', () => {
  startMicInput();
});

playButton.addEventListener('click', () => {
  togglePlayback();
});

initScene();
animate();
