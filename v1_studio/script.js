/**
 * Flipbook Studio Pro Engine
 */

document.addEventListener('DOMContentLoaded', () => {

  // --- GLSL Shaders for Optional WebGL Wave Effect ---
  const vertexShader = `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    }
  `;

  const fragmentShader = `
    varying vec2 vUv;
    uniform sampler2D currentImage;
    uniform sampler2D nextImage;
    uniform float dispFactor;

    void main() {
      vec2 uv = vUv;
      float intensity = 0.35;

      vec4 orig1 = texture2D(currentImage, uv);
      vec4 orig2 = texture2D(nextImage, uv);

      vec4 _currentImage = texture2D(currentImage, vec2(uv.x, uv.y + dispFactor * (orig2 * intensity)));
      vec4 _nextImage = texture2D(nextImage, vec2(uv.x, uv.y + (1.0 - dispFactor) * (orig1 * intensity)));

      vec4 finalTexture = mix(_currentImage, _nextImage, dispFactor);
      gl_FragColor = finalTexture;
    }
  `;

  // --- State ---
  let mediaList = []; // Array of { type: 'image'|'video', url, texture, name, format, size }
  let currentIndex = 0;
  let isAnimating = false;
  let isPlaying = false;
  let playbackInterval = null;
  let speedMs = 100; // Default 10 FPS (100ms)
  let isLoop = true;
  let transitionMode = 'instant'; // 'instant' | 'fade' | 'liquid'

  // --- DOM Elements ---
  const canvasContainer = document.getElementById('canvas-container');
  const videoOverlay = document.getElementById('video-overlay');
  const emptyStagePrompt = document.getElementById('empty-stage-prompt');
  const studioDock = document.getElementById('studio-dock');
  const selectTransition = document.getElementById('select-transition');

  const timelineTrack = document.getElementById('timeline-track');
  const timelineProgress = document.getElementById('timeline-progress');
  const timeCode = document.getElementById('time-code');
  const frameCounter = document.getElementById('frame-counter');

  const btnPlay = document.getElementById('btn-play');
  const playIcon = document.getElementById('play-icon');
  const btnStop = document.getElementById('btn-stop');
  const btnStepPrev = document.getElementById('btn-step-prev');
  const btnStepNext = document.getElementById('btn-step-next');
  const btnLoop = document.getElementById('btn-loop');
  const btnFullscreen = document.getElementById('btn-fullscreen');
  const speedPills = document.querySelectorAll('.speed-pill');

  const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
  const studioSidebar = document.getElementById('studio-sidebar');
  const sidebarDropzone = document.getElementById('sidebar-dropzone');
  const fileInput = document.getElementById('file-input');
  const mediaItemsList = document.getElementById('media-items-list');
  const btnClearPlaylist = document.getElementById('btn-clear-playlist');

  // --- WebGL Engine Setup ---
  let scene, camera, renderer, mat, geometry, object;

  function initWebGL() {
    const w = canvasContainer.clientWidth || window.innerWidth;
    const h = canvasContainer.clientHeight || window.innerHeight;

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setClearColor(0x04070d, 1.0);
    renderer.setSize(w, h);
    canvasContainer.appendChild(renderer.domElement);

    scene = new THREE.Scene();
    camera = new THREE.OrthographicCamera(w / -2, w / 2, h / 2, h / -2, 1, 1000);
    camera.position.z = 1;

    mat = new THREE.ShaderMaterial({
      uniforms: {
        dispFactor: { type: "f", value: 0.0 },
        currentImage: { type: "t", value: null },
        nextImage: { type: "t", value: null }
      },
      vertexShader: vertexShader,
      fragmentShader: fragmentShader,
      transparent: true,
      opacity: 1.0
    });

    geometry = new THREE.PlaneBufferGeometry(w, h, 1);
    object = new THREE.Mesh(geometry, mat);
    scene.add(object);

    function renderLoop() {
      requestAnimationFrame(renderLoop);
      renderer.render(scene, camera);
    }
    renderLoop();

    window.addEventListener('resize', () => {
      const nw = canvasContainer.clientWidth || window.innerWidth;
      const nh = canvasContainer.clientHeight || window.innerHeight;
      renderer.setSize(nw, nh);
      camera.left = nw / -2;
      camera.right = nw / 2;
      camera.top = nh / 2;
      camera.bottom = nh / -2;
      camera.updateProjectionMatrix();

      if (mediaList[currentIndex] && mediaList[currentIndex].texture) {
        fitAspect(mediaList[currentIndex].texture);
      }
    });
  }

  // Preserve Image Aspect Ratio
  function fitAspect(texture) {
    if (!texture || !texture.image) return;
    const containerW = canvasContainer.clientWidth || window.innerWidth;
    const containerH = canvasContainer.clientHeight || window.innerHeight;

    const imgW = texture.image.width || containerW;
    const imgH = texture.image.height || containerH;
    const containerAspect = containerW / containerH;
    const imgAspect = imgW / imgH;

    let planeW, planeH;
    if (imgAspect > containerAspect) {
      planeW = containerW * 0.92;
      planeH = (containerW * 0.92) / imgAspect;
    } else {
      planeH = containerH * 0.88;
      planeW = (containerH * 0.88) * imgAspect;
    }

    object.geometry.dispose();
    object.geometry = new THREE.PlaneBufferGeometry(planeW, planeH, 1);
  }

  // --- Slide Transition Engine ---
  function goToSlide(targetIndex) {
    if (mediaList.length === 0) {
      emptyStagePrompt.style.display = 'block';
      studioDock.style.display = 'none';
      return;
    }

    emptyStagePrompt.style.display = 'none';
    studioDock.style.display = 'flex';

    if (targetIndex < 0) targetIndex = 0;
    if (targetIndex >= mediaList.length) targetIndex = mediaList.length - 1;

    const nextMedia = mediaList[targetIndex];

    // Handle Video Media
    if (nextMedia.type === 'video') {
      videoOverlay.src = nextMedia.url;
      videoOverlay.style.display = 'block';
      if (isPlaying) videoOverlay.play();

      videoOverlay.onended = () => {
        if (isPlaying) {
          if (currentIndex < mediaList.length - 1) {
            goToSlide(currentIndex + 1);
          } else if (isLoop) {
            goToSlide(0);
          } else {
            pause();
          }
        }
      };

      currentIndex = targetIndex;
      updateUI();
      return;
    } else {
      videoOverlay.style.display = 'none';
      videoOverlay.pause();
    }

    // Handle Image Media
    if (!nextMedia.texture) {
      currentIndex = targetIndex;
      updateUI();
      return;
    }

    fitAspect(nextMedia.texture);

    if (transitionMode === 'instant' || !mat.uniforms.currentImage.value) {
      mat.uniforms.currentImage.value = nextMedia.texture;
      mat.uniforms.nextImage.value = nextMedia.texture;
      mat.uniforms.currentImage.needsUpdate = true;
      mat.uniforms.nextImage.needsUpdate = true;
      mat.uniforms.dispFactor.value = 0.0;
    } else if (transitionMode === 'liquid') {
      if (isAnimating) return;
      isAnimating = true;
      mat.uniforms.nextImage.value = nextMedia.texture;
      mat.uniforms.nextImage.needsUpdate = true;

      TweenLite.to(mat.uniforms.dispFactor, 0.5, {
        value: 1.0,
        ease: 'Expo.easeInOut',
        onComplete: function () {
          mat.uniforms.currentImage.value = nextMedia.texture;
          mat.uniforms.currentImage.needsUpdate = true;
          mat.uniforms.dispFactor.value = 0.0;
          isAnimating = false;
        }
      });
    } else if (transitionMode === 'fade') {
      if (isAnimating) return;
      isAnimating = true;
      mat.uniforms.nextImage.value = nextMedia.texture;
      mat.uniforms.nextImage.needsUpdate = true;

      TweenLite.to(mat.uniforms.dispFactor, 0.3, {
        value: 1.0,
        ease: 'Linear.easeNone',
        onComplete: function () {
          mat.uniforms.currentImage.value = nextMedia.texture;
          mat.uniforms.currentImage.needsUpdate = true;
          mat.uniforms.dispFactor.value = 0.0;
          isAnimating = false;
        }
      });
    }

    currentIndex = targetIndex;
    updateUI();
  }

  function updateUI() {
    frameCounter.textContent = `${currentIndex + 1} / ${mediaList.length}`;
    
    // Timeline Progress percentage
    const progressPct = mediaList.length > 1 ? (currentIndex / (mediaList.length - 1)) * 100 : 100;
    timelineProgress.style.width = `${progressPct}%`;

    // Time Code Display
    const currentSecs = Math.floor((currentIndex * speedMs) / 1000);
    const mins = String(Math.floor(currentSecs / 60)).padStart(2, '0');
    const secs = String(currentSecs % 60).padStart(2, '0');
    timeCode.textContent = `${mins}:${secs}`;

    updateActivePlaylist();
  }

  // --- Timeline Scrubber Click & Drag ---
  function seekTimeline(e) {
    if (mediaList.length <= 1) return;
    const rect = timelineTrack.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    const targetIdx = Math.round(ratio * (mediaList.length - 1));
    goToSlide(targetIdx);
  }

  timelineTrack.addEventListener('click', seekTimeline);

  // --- Playback Engine ---
  function play() {
    if (mediaList.length === 0) return;
    isPlaying = true;
    playIcon.innerHTML = '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>'; // Pause SVG

    const currentMedia = mediaList[currentIndex];
    if (currentMedia.type === 'video') {
      videoOverlay.play();
    } else {
      clearInterval(playbackInterval);
      playbackInterval = setInterval(nextSlide, speedMs);
    }
  }

  function pause() {
    isPlaying = false;
    playIcon.innerHTML = '<path d="M8 5v14l11-7z"/>'; // Play SVG
    clearInterval(playbackInterval);
    if (videoOverlay) videoOverlay.pause();
  }

  function togglePlay() {
    if (isPlaying) pause(); else play();
  }

  function stop() {
    pause();
    goToSlide(0);
  }

  function nextSlide() {
    let nextIdx = currentIndex + 1;
    if (nextIdx >= mediaList.length) {
      if (isLoop) nextIdx = 0; else { pause(); return; }
    }
    goToSlide(nextIdx);
  }

  function prevSlide() {
    let prevIdx = currentIndex - 1;
    if (prevIdx < 0) {
      if (isLoop) prevIdx = mediaList.length - 1; else return;
    }
    goToSlide(prevIdx);
  }

  // --- Speed Presets ---
  speedPills.forEach(pill => {
    pill.addEventListener('click', () => {
      speedPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      const fps = parseInt(pill.dataset.fps, 10);
      speedMs = Math.round(1000 / fps);

      if (isPlaying && mediaList[currentIndex]?.type === 'image') {
        clearInterval(playbackInterval);
        playbackInterval = setInterval(nextSlide, speedMs);
      }
    });
  });

  // --- Transition Option Selector ---
  selectTransition.addEventListener('change', (e) => {
    transitionMode = e.target.value;
  });

  // --- File Processing ---
  function processFiles(files) {
    if (!files || files.length === 0) return;

    let addedCount = 0;
    Array.from(files).forEach((file) => {
      const isVideo = file.type.startsWith('video/');
      const url = URL.createObjectURL(file);
      const ext = file.name.split('.').pop().toUpperCase();

      if (isVideo) {
        mediaList.push({
          type: 'video',
          url: url,
          texture: null,
          name: file.name,
          format: ext
        });
        addedCount++;
      } else if (file.type.startsWith('image/')) {
        const img = new Image();
        img.src = url;
        img.onload = () => {
          const texture = new THREE.Texture(img);
          texture.magFilter = texture.minFilter = THREE.LinearFilter;
          texture.needsUpdate = true;

          const item = mediaList.find(m => m.url === url);
          if (item) item.texture = texture;

          if (mediaList[currentIndex] && mediaList[currentIndex].url === url) {
            fitAspect(texture);
            mat.uniforms.currentImage.value = texture;
            mat.uniforms.nextImage.value = texture;
            mat.uniforms.currentImage.needsUpdate = true;
            mat.uniforms.nextImage.needsUpdate = true;
          }
        };

        mediaList.push({
          type: 'image',
          url: url,
          texture: null,
          name: file.name,
          format: ext
        });
        addedCount++;
      }
    });

    if (addedCount > 0) {
      renderPlaylist();
      const firstNewIndex = mediaList.length - addedCount;
      goToSlide(firstNewIndex);
    }
  }

  // Dropzone Handlers
  sidebarDropzone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => processFiles(e.target.files));

  sidebarDropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    sidebarDropzone.classList.add('dragover');
  });

  sidebarDropzone.addEventListener('dragleave', () => sidebarDropzone.classList.remove('dragover'));

  sidebarDropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    sidebarDropzone.classList.remove('dragover');
    processFiles(e.dataTransfer.files);
  });

  // Global Drag & Drop on Viewport
  document.getElementById('viewport-stage').addEventListener('dragover', (e) => e.preventDefault());
  document.getElementById('viewport-stage').addEventListener('drop', (e) => {
    e.preventDefault();
    processFiles(e.dataTransfer.files);
  });

  // --- Playlist Renderer ---
  function renderPlaylist() {
    mediaItemsList.innerHTML = '';

    if (mediaList.length === 0) {
      mediaItemsList.innerHTML = `
        <div class="sidebar-empty">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/>
          </svg>
          <p>Sin archivos cargados.<br/>Arrastra o haz clic en la zona de arriba.</p>
        </div>
      `;
      return;
    }

    mediaList.forEach((item, idx) => {
      const card = document.createElement('div');
      card.className = `media-item-card ${idx === currentIndex ? 'active' : ''}`;

      const thumb = item.type === 'image'
        ? `<img src="${item.url}" class="item-thumb" />`
        : `<video src="${item.url}" class="item-thumb"></video>`;

      card.innerHTML = `
        ${thumb}
        <div class="item-details">
          <div class="item-name">${item.name}</div>
          <div class="item-badge">${item.format} • ${item.type === 'image' ? 'IMAGEN' : 'VIDEO'}</div>
        </div>
        <button class="btn-item-delete" title="Eliminar">&times;</button>
      `;

      card.addEventListener('click', (e) => {
        if (e.target.classList.contains('btn-item-delete')) return;
        goToSlide(idx);
      });

      card.querySelector('.btn-item-delete').addEventListener('click', (e) => {
        e.stopPropagation();
        URL.revokeObjectURL(item.url);
        mediaList.splice(idx, 1);
        renderPlaylist();

        if (mediaList.length === 0) {
          goToSlide(-1);
        } else {
          goToSlide(Math.min(currentIndex, mediaList.length - 1));
        }
      });

      mediaItemsList.appendChild(card);
    });
  }

  function updateActivePlaylist() {
    const cards = mediaItemsList.querySelectorAll('.media-item-card');
    cards.forEach((card, idx) => {
      card.classList.toggle('active', idx === currentIndex);
    });
  }

  btnClearPlaylist.addEventListener('click', () => {
    mediaList.forEach(m => URL.revokeObjectURL(m.url));
    mediaList = [];
    currentIndex = 0;
    renderPlaylist();
    goToSlide(-1);
  });

  // --- Buttons & Controls ---
  btnPlay.addEventListener('click', togglePlay);
  btnStop.addEventListener('click', stop);
  btnStepNext.addEventListener('click', nextSlide);
  btnStepPrev.addEventListener('click', prevSlide);

  btnLoop.addEventListener('click', () => {
    isLoop = !isLoop;
    btnLoop.classList.toggle('active', isLoop);
  });

  btnFullscreen.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      if (document.exitFullscreen) document.exitFullscreen();
    }
  });

  btnToggleSidebar.addEventListener('click', () => {
    studioSidebar.classList.toggle('collapsed');
  });

  // Keyboard Shortcuts
  document.addEventListener('keydown', (e) => {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;
    if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
    else if (e.code === 'ArrowRight') { e.preventDefault(); nextSlide(); }
    else if (e.code === 'ArrowLeft') { e.preventDefault(); prevSlide(); }
  });

  // Init
  initWebGL();
});