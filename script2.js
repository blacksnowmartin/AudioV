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
let ringGlow;
let floor;
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
let canvasParticles = [];

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
    initCanvasParticles();
  }

  if (rendererMode === 'three') {
    setupThreeScene();
  }

  window.addEventListener('resize', onWindowResize);
}

function setupThreeScene() {
  const ambientLight = new THREE.AmbientLight(0x94a3b8, 0.8);
  scene.add(ambientLight);

  pointLight = new THREE.PointLight(0x38bdf8, 2.8, 90, 2);
  pointLight.position.set(0, 10, 10);
  scene.add(pointLight);

  floor = new THREE.Mesh(
    new THREE.CircleGeometry(9, 96),
    new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      emissive: 0x0f3f65,
      emissiveIntensity: 0.5,
      roughness: 0.68,
      metalness: 0.2,
      transparent: true,
      opacity: 0.94,
    })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -2.4;
  scene.add(floor);

  barsGroup = new THREE.Group();
  scene.add(barsGroup);

  const barCount = 72;
  const radius = 6.2;
  for (let i = 0; i < barCount; i += 1) {
    const geometry = new THREE.CylinderGeometry(0.18, 0.18, 1.2, 14, 1);
    const material = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color().setHSL(i / barCount, 0.82, 0.58),
      emissive: new THREE.Color().setHSL(i / barCount, 0.82, 0.18),
      emissiveIntensity: 0.18,
      roughness: 0.18,
      metalness: 0.22,
      clearcoat: 0.5,
      transparent: true,
      opacity: 0.94,
    });

    const mesh = new THREE.Mesh(geometry, material);
    const angle = (i / barCount) * Math.PI * 2;
    mesh.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
    mesh.rotation.y = angle;
    mesh.rotation.z = Math.PI / 2;
    mesh.scale.y = 0.9;
    mesh.scale.x = 1;
    mesh.scale.z = 1;
    mesh.position.y = -0.35;
    barsGroup.add(mesh);
  }

  const ringGeometry = new THREE.TorusGeometry(5.4, 0.08, 16, 128);
  const ringMaterial = new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.28 });
  ring = new THREE.Mesh(ringGeometry, ringMaterial);
  ring.rotation.x = Math.PI / 2;
  scene.add(ring);

  ringGlow = new THREE.Mesh(
    new THREE.RingGeometry(4.6, 5.8, 128),
    new THREE.MeshBasicMaterial({ color: 0x3b82f6, side: THREE.DoubleSide, transparent: true, opacity: 0.16 })
  );
  ringGlow.rotation.x = Math.PI / 2;
  ringGlow.position.y = -1.75;
  scene.add(ringGlow);

  const particleCount = 2200;
  const particleGeometry = new THREE.BufferGeometry();
  const particlePositions = new Float32Array(particleCount * 3);
  for (let i = 0; i < particleCount; i += 1) {
    const angle = (i / particleCount) * Math.PI * 2;
    const spread = i % 9;
    const radius = 2.2 + spread * 0.14;
    particlePositions[i * 3] = Math.cos(angle) * radius;
    particlePositions[i * 3 + 1] = (Math.random() - 0.5) * 2.6;
    particlePositions[i * 3 + 2] = Math.sin(angle) * radius;
  }
  particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
  const particleMaterial = new THREE.PointsMaterial({
    color: 0x38bdf8,
    size: 0.07,
    transparent: true,
    opacity: 0.74,
    depthWrite: false,
    sizeAttenuation: true,
    blending: THREE.AdditiveBlending,
  });
  particleSystem = new THREE.Points(particleGeometry, particleMaterial);
  scene.add(particleSystem);
}

function initCanvasParticles() {
  canvasParticles = [];
  const width = window.innerWidth;
  const height = window.innerHeight;
  const count = 240;
  for (let i = 0; i < count; i += 1) {
    canvasParticles.push({
      x: Math.random() * width,
      y: Math.random() * height,
      radius: 1 + Math.random() * 3,
      speed: 0.12 + Math.random() * 0.24,
      phase: Math.random() * Math.PI * 2,
      opacity: 0.15 + Math.random() * 0.35,
      hueOffset: Math.random() * 60,
    });
  }
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
    initCanvasParticles();
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

  if (!canvasParticles.length) {
    initCanvasParticles();
  }

  canvasContext.clearRect(0, 0, width, height);
  const centerX = width * 0.5;
  const centerY = height * 0.34;
  const time = performance.now() * 0.00035;

  const background = canvasContext.createRadialGradient(centerX, centerY, 10, centerX, centerY, height * 0.8);
  background.addColorStop(0, `rgba(34, 211, 238, ${0.18 + beat * 0.12})`);
  background.addColorStop(0.4, 'rgba(7, 19, 40, 0.9)');
  background.addColorStop(1, 'rgba(2, 6, 23, 1)');
  canvasContext.fillStyle = background;
  canvasContext.fillRect(0, 0, width, height);

  for (let ringIndex = 0; ringIndex < 3; ringIndex += 1) {
    const baseRadius = width * 0.16 + ringIndex * 44 + beat * 18;
    const amplitude = 8 + ringIndex * 4;
    const alpha = 0.08 + (2 - ringIndex) * 0.05 + beat * 0.05;
    canvasContext.beginPath();
    for (let i = 0; i <= 120; i += 1) {
      const angle = (i / 120) * Math.PI * 2;
      const radius = baseRadius + Math.sin(angle * 3 + time * (0.9 + ringIndex * 0.3)) * amplitude;
      const x = centerX + Math.cos(angle + time * 0.5) * radius;
      const y = centerY + Math.sin(angle + time * 0.5) * radius;
      if (i === 0) {
        canvasContext.moveTo(x, y);
      } else {
        canvasContext.lineTo(x, y);
      }
    }
    canvasContext.closePath();
    canvasContext.strokeStyle = `hsla(${198 + ringIndex * 18}, 92%, 75%, ${alpha})`;
    canvasContext.lineWidth = 1.2 + ringIndex * 0.9;
    canvasContext.stroke();
  }

  canvasParticles.forEach((particle) => {
    particle.phase += particle.speed * 0.04;
    particle.x += Math.cos(particle.phase) * particle.speed * 2.1;
    particle.y += Math.sin(particle.phase) * particle.speed * 1.7;

    if (particle.x < -20) particle.x = width + 20;
    if (particle.x > width + 20) particle.x = -20;
    if (particle.y < -20) particle.y = height + 20;
    if (particle.y > height + 20) particle.y = -20;

    const glow = canvasContext.createRadialGradient(
      particle.x,
      particle.y,
      0,
      particle.x,
      particle.y,
      particle.radius * 4
    );
    glow.addColorStop(0, `hsla(${200 + particle.hueOffset}, 92%, 85%, ${particle.opacity})`);
    glow.addColorStop(1, 'rgba(10, 30, 60, 0)');
    canvasContext.fillStyle = glow;
    canvasContext.beginPath();
    canvasContext.arc(particle.x, particle.y, particle.radius * 4, 0, Math.PI * 2);
    canvasContext.fill();
  });

  const barCount = 72;
  const barWidth = width / (barCount * 1.18);
  const centerBarY = height * 0.62;
  const maxHeight = height * 0.42;
  for (let i = 0; i < barCount; i += 1) {
    const value = analyserData[Math.floor((i / barCount) * analyserData.length)] / 255;
    const barHeight = 14 + value * maxHeight;
    const x = width * 0.08 + i * barWidth * 1.03;
    const hue = 190 + value * 130;
    const glow = canvasContext.createLinearGradient(x, centerBarY - barHeight, x, centerBarY + barHeight);
    glow.addColorStop(0, `hsl(${hue}, 95%, ${62 + value * 14}%)`);
    glow.addColorStop(1, `hsla(${hue}, 95%, ${80 + value * 10}%, 0.28)`);

    const radius = Math.max(6, barWidth * 0.45);
    canvasContext.beginPath();
    canvasContext.moveTo(x + radius, centerBarY - barHeight);
    canvasContext.lineTo(x + barWidth - radius, centerBarY - barHeight);
    canvasContext.quadraticCurveTo(x + barWidth, centerBarY - barHeight, x + barWidth, centerBarY - barHeight + radius);
    canvasContext.lineTo(x + barWidth, centerBarY + barHeight - radius);
    canvasContext.quadraticCurveTo(x + barWidth, centerBarY + barHeight, x + barWidth - radius, centerBarY + barHeight);
    canvasContext.lineTo(x + radius, centerBarY + barHeight);
    canvasContext.quadraticCurveTo(x, centerBarY + barHeight, x, centerBarY + barHeight - radius);
    canvasContext.lineTo(x, centerBarY - barHeight + radius);
    canvasContext.quadraticCurveTo(x, centerBarY - barHeight, x + radius, centerBarY - barHeight);
    canvasContext.closePath();
    canvasContext.fillStyle = glow;
    canvasContext.shadowBlur = 14 + value * 18;
    canvasContext.shadowColor = `hsla(${hue}, 92%, 75%, 0.55)`;
    canvasContext.fill();
    canvasContext.shadowBlur = 0;
  }

  canvasContext.beginPath();
  canvasContext.moveTo(0, height * 0.84);
  for (let i = 0; i < waveformData.length; i += 1) {
    const sample = waveformData[i] / 255;
    const x = (i / (waveformData.length - 1)) * width;
    const y = height * 0.84 + (sample - 0.5) * 130;
    canvasContext.lineTo(x, y);
  }
  canvasContext.lineTo(width, height * 0.84);
  canvasContext.strokeStyle = `rgba(191, 219, 254, ${0.85 + beat * 0.1})`;
  canvasContext.lineWidth = 2.8;
  canvasContext.stroke();

  const pulseRadius = 40 + beat * 72;
  const pulseGradient = canvasContext.createRadialGradient(centerX, centerY, 0, centerX, centerY, pulseRadius);
  pulseGradient.addColorStop(0, `rgba(125, 211, 252, ${0.42 + beat * 0.14})`);
  pulseGradient.addColorStop(0.45, `rgba(125, 211, 252, ${0.12 + beat * 0.08})`);
  pulseGradient.addColorStop(1, 'rgba(125, 211, 252, 0)');
  canvasContext.fillStyle = pulseGradient;
  canvasContext.beginPath();
  canvasContext.arc(centerX, centerY, pulseRadius, 0, Math.PI * 2);
  canvasContext.fill();

  canvasContext.beginPath();
  canvasContext.arc(centerX, centerY, 24 + beat * 16, 0, Math.PI * 2);
  canvasContext.strokeStyle = `rgba(191, 219, 254, ${0.88 + beat * 0.08})`;
  canvasContext.lineWidth = 3.2;
  canvasContext.stroke();

  for (let i = 0; i < 10; i += 1) {
    const angle = (i / 10) * Math.PI * 2 + time * 0.28;
    const start = 28 + beat * 10;
    const end = 58 + beat * 40;
    canvasContext.beginPath();
    canvasContext.moveTo(centerX + Math.cos(angle) * start, centerY + Math.sin(angle) * start);
    canvasContext.lineTo(centerX + Math.cos(angle) * end, centerY + Math.sin(angle) * end);
    canvasContext.strokeStyle = `hsla(195, 90%, 84%, ${0.16 + beat * 0.1})`;
    canvasContext.lineWidth = 1.4;
    canvasContext.stroke();
  }
}

function animate() {
  requestAnimationFrame(animate);

  if (analyserNode) {
    analyserNode.getByteFrequencyData(analyserData);
    analyserNode.getByteTimeDomainData(waveformData);

    const averageEnergy = analyserData.slice(0, 64).reduce((sum, value) => sum + value, 0) / 64 / 255;
    const beat = Math.pow(averageEnergy, 1.3);
    const time = performance.now() * 0.00035;

    if (rendererMode === 'three') {
      barsGroup.children.forEach((bar, index) => {
        const normalized = analyserData[Math.floor((index / barsGroup.children.length) * analyserData.length)] / 255;
        const targetHeight = 0.9 + normalized * 6.2;
        bar.scale.y = THREE.MathUtils.lerp(bar.scale.y, targetHeight, 0.18);
        bar.scale.x = THREE.MathUtils.lerp(bar.scale.x, 0.92 + normalized * 0.22, 0.16);
        bar.scale.z = THREE.MathUtils.lerp(bar.scale.z, 0.92 + normalized * 0.22, 0.16);
        bar.position.y = bar.scale.y / 2 - 1.45;
        const hue = 0.55 + normalized * 0.23;
        bar.material.color.setHSL(hue, 0.82, 0.56 + normalized * 0.14);
        bar.material.emissive.setHSL(hue, 0.92, 0.17 + normalized * 0.2);
        bar.material.emissiveIntensity = 0.18 + normalized * 0.72;
      });

      barsGroup.rotation.y += 0.008 + beat * 0.014;
      ring.rotation.z += 0.016 + beat * 0.02;
      ring.scale.setScalar(1 + beat * 0.24 + Math.sin(time * 1.8) * 0.01);
      ring.material.opacity = THREE.MathUtils.lerp(ring.material.opacity, 0.28 + beat * 0.24, 0.12);

      ringGlow.rotation.z += 0.01 + beat * 0.016;
      ringGlow.material.opacity = THREE.MathUtils.lerp(ringGlow.material.opacity, 0.12 + beat * 0.28, 0.08);

      pointLight.intensity = 1.6 + beat * 2.8;
      pointLight.position.x = Math.sin(time * 0.8) * 6;
      pointLight.position.y = 9 + beat * 1.6;

      scene.background.setHSL(0.6 + beat * 0.05, 0.62, 0.03 + beat * 0.035);

      if (floor) {
        floor.material.emissiveIntensity = 0.32 + beat * 0.8;
      }

      camera.position.x = Math.sin(time * 0.7) * 1.4;
      camera.position.y = 4.1 + Math.sin(time * 1.1) * 0.28 + beat * 0.64;
      camera.position.z = 18 + Math.cos(time * 0.5) * 0.75 + beat * 0.95;
      camera.lookAt(0, 0.85, 0);

      const positions = particleSystem.geometry.attributes.position.array;
      const count = positions.length / 3;
      for (let i = 0; i < count; i += 1) {
        const angle = (i / count) * Math.PI * 2 + performance.now() * 0.00018;
        const wave = waveformData[i % waveformData.length] / 255;
        const radius = 2.2 + beat * 2.1 + wave * 1.45;
        positions[i * 3] = Math.cos(angle) * radius;
        positions[i * 3 + 1] = Math.sin(angle * 2 + beat * 2.2) * 1.8 + (wave - 0.5) * 1.5;
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
