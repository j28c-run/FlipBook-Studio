/**
 * Flipbook Studio Pro v2 Engine - Complete Interactive Version
 */

document.addEventListener('DOMContentLoaded', () => {

  // --- GLSL Shaders ---
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
  let mediaList = []; // Array of { type: 'image'|'video', url, texture, name }
  let currentIndex = 0;
  let isAnimating = false;
  let isPlaying = false;
  let playbackInterval = null;
  let fpsRates = [24, 12, 5, 1];
  let fpsIndex = 0; // 24 FPS
  let speedMs = Math.round(1000 / 24);
  let isLoop = true;
  let transitionMode = 'instant'; // 'instant' | 'fade' | 'liquid'
  let currentAspectRatio = '16:9';

  // Adjustment Filters State
  let filterState = {
    preset: 'none',
    brightness: 100,
    contrast: 100,
    saturate: 100
  };

  // --- DOM Elements ---
  const canvasContainer = document.getElementById('canvas-container');
  const videoOverlay = document.getElementById('video-overlay');
  const annotationCanvas = document.getElementById('annotation-canvas');
  const emptyGlassModal = document.getElementById('empty-glass-modal');
  const activeFrameBadgeWrap = document.getElementById('active-frame-badge-wrap');
  const badgeFrameNum = document.getElementById('badge-frame-num');
  const guideFrameCounter = document.getElementById('guide-frame-counter');
  const guideResLabel = document.getElementById('guide-res-label');
  const selectTransition = document.getElementById('select-transition');

  const scrubberTrack = document.getElementById('scrubber-track');
  const scrubberProgress = document.getElementById('scrubber-progress');

  const btnPlay = document.getElementById('btn-play');
  const playIconPath = document.getElementById('play-icon-path');
  const btnStepPrev = document.getElementById('btn-step-prev');
  const btnStepNext = document.getElementById('btn-step-next');
  const btnLoop = document.getElementById('btn-loop');
  const btnFpsToggle = document.getElementById('btn-fps-toggle');
  const volumeSlider = document.getElementById('volume-slider');

  const gridDropzone = document.getElementById('grid-dropzone');
  const fileInput = document.getElementById('file-input');
  const assetsGrid = document.getElementById('assets-grid');

  // Interactive Tools & Panels
  const panelEffects = document.getElementById('panel-effects');
  const panelAdjust = document.getElementById('panel-adjust');
  const exportModal = document.getElementById('export-modal');
  const btnExport = document.getElementById('btn-export');
  const btnCloseExport = document.getElementById('btn-close-export');
  const btnConfirmExport = document.getElementById('btn-confirm-export');

  // --- WebGL Engine Setup ---
  let scene, camera, renderer, mat, geometry, object;

  function initWebGL() {
    const container = document.getElementById('stage-viewport');
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setClearColor(0x090d16, 1.0);
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
      const nw = container.clientWidth || window.innerWidth;
      const nh = container.clientHeight || window.innerHeight;
      renderer.setSize(nw, nh);
      camera.left = nw / -2;
      camera.right = nw / 2;
      camera.top = nh / 2;
      camera.bottom = nh / -2;
      camera.updateProjectionMatrix();

      if (mediaList[currentIndex] && mediaList[currentIndex].texture) {
        fitAspect(mediaList[currentIndex].texture);
      }
      resizeAnnotationCanvas();
    });

    initAnnotationCanvas();
  }

  // --- Aspect Ratio Fitting Engine ---
  function fitAspect(texture) {
    if (!texture || !texture.image) return;
    const container = document.getElementById('stage-viewport');
    const containerW = container.clientWidth || window.innerWidth;
    const containerH = container.clientHeight || window.innerHeight;

    let targetRatio = containerW / containerH;
    if (currentAspectRatio === '16:9') targetRatio = 16 / 9;
    else if (currentAspectRatio === '9:16') targetRatio = 9 / 16;
    else if (currentAspectRatio === '1:1') targetRatio = 1;
    else if (currentAspectRatio === 'orig') {
      const imgW = texture.image.width || containerW;
      const imgH = texture.image.height || containerH;
      targetRatio = imgW / imgH;
    }

    let planeW, planeH;
    const stageAspect = containerW / containerH;

    if (targetRatio > stageAspect) {
      planeW = containerW * 0.86;
      planeH = (containerW * 0.86) / targetRatio;
    } else {
      planeH = containerH * 0.82;
      planeW = (containerH * 0.82) * targetRatio;
    }

    object.geometry.dispose();
    object.geometry = new THREE.PlaneBufferGeometry(planeW, planeH, 1);
  }

  // --- Slide Transition Engine ---
  function goToSlide(targetIndex) {
    if (mediaList.length === 0) {
      emptyGlassModal.style.display = 'block';
      activeFrameBadgeWrap.style.display = 'none';
      guideFrameCounter.textContent = 'Frame: 0 / 0';
      return;
    }

    emptyGlassModal.style.display = 'none';
    activeFrameBadgeWrap.style.display = 'flex';

    if (targetIndex < 0) targetIndex = 0;
    if (targetIndex >= mediaList.length) targetIndex = mediaList.length - 1;

    const nextMedia = mediaList[targetIndex];

    // Handle Video Media
    if (nextMedia.type === 'video') {
      videoOverlay.src = nextMedia.url;
      videoOverlay.style.display = 'block';
      videoOverlay.volume = parseFloat(volumeSlider.value);
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

      TweenLite.to(mat.uniforms.dispFactor, 0.4, {
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

      TweenLite.to(mat.uniforms.dispFactor, 0.25, {
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
    badgeFrameNum.textContent = `${currentIndex + 1} / ${mediaList.length}`;
    guideFrameCounter.textContent = `Frame: ${currentIndex + 1} / ${mediaList.length}`;

    // Timeline Progress percentage
    const progressPct = mediaList.length > 1 ? (currentIndex / (mediaList.length - 1)) * 100 : 100;
    scrubberProgress.style.width = `${progressPct}%`;

    updateActiveGridCard();
  }

  // --- Scrubber Track Interactive Dragging ---
  let isDraggingScrubber = false;

  function seekScrubber(e) {
    if (mediaList.length <= 1) return;
    const rect = scrubberTrack.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    const targetIdx = Math.round(ratio * (mediaList.length - 1));
    goToSlide(targetIdx);
  }

  scrubberTrack.addEventListener('mousedown', (e) => {
    isDraggingScrubber = true;
    seekScrubber(e);
  });

  window.addEventListener('mousemove', (e) => {
    if (isDraggingScrubber) seekScrubber(e);
  });

  window.addEventListener('mouseup', () => {
    isDraggingScrubber = false;
  });

  // --- Playback Engine ---
  function play() {
    if (mediaList.length === 0) return;
    isPlaying = true;
    playIconPath.setAttribute('d', 'M6 19h4V5H6v14zm8-14v14h4V5h-4z'); // Pause SVG

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
    playIconPath.setAttribute('d', 'M8 5v14l11-7z'); // Play SVG
    clearInterval(playbackInterval);
    if (videoOverlay) videoOverlay.pause();
  }

  function togglePlay() {
    if (isPlaying) pause(); else play();
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

  // --- Sequence Operations (Inferred Features) ---
  function duplicateCurrentFrame() {
    if (mediaList.length === 0) return;
    const currentItem = mediaList[currentIndex];
    const clone = {
      type: currentItem.type,
      url: currentItem.url,
      texture: currentItem.texture,
      name: `${currentItem.name} (Copia)`
    };
    mediaList.splice(currentIndex + 1, 0, clone);
    renderAssetsGrid();
    goToSlide(currentIndex + 1);
  }

  function reverseSequence() {
    if (mediaList.length <= 1) return;
    mediaList.reverse();
    renderAssetsGrid();
    goToSlide(0);
  }

  function deleteCurrentFrame() {
    if (mediaList.length === 0) return;
    mediaList.splice(currentIndex, 1);
    renderAssetsGrid();
    if (mediaList.length === 0) {
      goToSlide(-1);
    } else {
      goToSlide(Math.min(currentIndex, mediaList.length - 1));
    }
  }

  // --- CSS Filter & Adjustments Engine ---
  function applyFilters() {
    let filterStr = `brightness(${filterState.brightness}%) contrast(${filterState.contrast}%) saturate(${filterState.saturate}%)`;

    if (filterState.preset === 'bw') filterStr += ' grayscale(100%)';
    else if (filterState.preset === 'sepia') filterStr += ' sepia(90%)';
    else if (filterState.preset === 'vivid') filterStr += ' saturate(180%)';
    else if (filterState.preset === 'contrast') filterStr += ' contrast(160%)';

    const canvas = canvasContainer.querySelector('canvas');
    if (canvas) canvas.style.filter = filterStr;
    if (videoOverlay) videoOverlay.style.filter = filterStr;
  }

  // Effect Presets Click
  document.querySelectorAll('.effect-preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.effect-preset-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      filterState.preset = btn.dataset.filter;
      applyFilters();
    });
  });

  // Adjustment Sliders
  document.getElementById('slider-brightness').addEventListener('input', (e) => {
    filterState.brightness = e.target.value;
    applyFilters();
  });
  document.getElementById('slider-contrast').addEventListener('input', (e) => {
    filterState.contrast = e.target.value;
    applyFilters();
  });
  document.getElementById('slider-saturate').addEventListener('input', (e) => {
    filterState.saturate = e.target.value;
    applyFilters();
  });

  // --- Brush Annotation Canvas ---
  let isDrawing = false;
  let ctx = null;

  function initAnnotationCanvas() {
    annotationCanvas.width = canvasContainer.clientWidth || window.innerWidth;
    annotationCanvas.height = canvasContainer.clientHeight || window.innerHeight;
    ctx = annotationCanvas.getContext('2d');
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';

    annotationCanvas.addEventListener('mousedown', (e) => {
      if (!annotationCanvas.classList.contains('active')) return;
      isDrawing = true;
      ctx.beginPath();
      const rect = annotationCanvas.getBoundingClientRect();
      ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
    });

    annotationCanvas.addEventListener('mousemove', (e) => {
      if (!isDrawing) return;
      const rect = annotationCanvas.getBoundingClientRect();
      ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
      ctx.stroke();
    });

    annotationCanvas.addEventListener('mouseup', () => isDrawing = false);
  }

  function resizeAnnotationCanvas() {
    if (!annotationCanvas) return;
    annotationCanvas.width = canvasContainer.clientWidth || window.innerWidth;
    annotationCanvas.height = canvasContainer.clientHeight || window.innerHeight;
  }

  // --- Header Menu Dropdowns ---
  const navItems = ['menu-file', 'menu-edit', 'menu-project', 'menu-tools'];
  navItems.forEach(id => {
    const item = document.getElementById(id);
    if (!item) return;
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      const menu = item.querySelector('.dropdown-menu');
      document.querySelectorAll('.dropdown-menu').forEach(m => {
        if (m !== menu) m.classList.remove('open');
      });
      if (menu) menu.classList.toggle('open');
    });
  });

  document.addEventListener('click', () => {
    document.querySelectorAll('.dropdown-menu').forEach(m => m.classList.remove('open'));
  });

  // Menu Items Click Handlers
  document.getElementById('menu-item-duplicate')?.addEventListener('click', duplicateCurrentFrame);
  document.getElementById('menu-item-reverse')?.addEventListener('click', reverseSequence);
  document.getElementById('menu-item-delete')?.addEventListener('click', deleteCurrentFrame);
  document.getElementById('tool-item-duplicate')?.addEventListener('click', duplicateCurrentFrame);
  document.getElementById('tool-item-reverse')?.addEventListener('click', reverseSequence);
  document.getElementById('menu-item-export')?.addEventListener('click', () => exportModal.classList.add('open'));
  document.getElementById('menu-item-clear')?.addEventListener('click', () => {
    mediaList.forEach(m => URL.revokeObjectURL(m.url));
    mediaList = [];
    renderAssetsGrid();
    goToSlide(-1);
  });

  // Aspect Ratio Preset Items
  document.getElementById('preset-16-9')?.addEventListener('click', () => {
    currentAspectRatio = '16:9';
    guideResLabel.textContent = 'Frame guide: 1920×1080';
    if (mediaList[currentIndex]?.texture) fitAspect(mediaList[currentIndex].texture);
  });
  document.getElementById('preset-9-16')?.addEventListener('click', () => {
    currentAspectRatio = '9:16';
    guideResLabel.textContent = 'Frame guide: 1080×1920';
    if (mediaList[currentIndex]?.texture) fitAspect(mediaList[currentIndex].texture);
  });
  document.getElementById('preset-1-1')?.addEventListener('click', () => {
    currentAspectRatio = '1:1';
    guideResLabel.textContent = 'Frame guide: 1080×1080';
    if (mediaList[currentIndex]?.texture) fitAspect(mediaList[currentIndex].texture);
  });
  document.getElementById('preset-orig')?.addEventListener('click', () => {
    currentAspectRatio = 'orig';
    guideResLabel.textContent = 'Frame guide: Original';
    if (mediaList[currentIndex]?.texture) fitAspect(mediaList[currentIndex].texture);
  });

  // --- Quick Tools & Left Strip Tool Buttons ---
  const pillEffects = document.getElementById('pill-effects');
  const pillAdjust = document.getElementById('pill-adjust');
  const pillBrush = document.getElementById('pill-brush');
  const pillCrop = document.getElementById('pill-crop');
  const pillSelect = document.getElementById('pill-select');

  pillEffects.addEventListener('click', () => {
    panelEffects.classList.toggle('open');
    panelAdjust.classList.remove('open');
  });

  pillAdjust.addEventListener('click', () => {
    panelAdjust.classList.toggle('open');
    panelEffects.classList.remove('open');
  });

  pillBrush.addEventListener('click', () => {
    annotationCanvas.classList.toggle('active');
    pillBrush.classList.toggle('active');
  });

  pillCrop.addEventListener('click', () => {
    const ratios = ['16:9', '9:16', '1:1', 'orig'];
    const idx = (ratios.indexOf(currentAspectRatio) + 1) % ratios.length;
    currentAspectRatio = ratios[idx];
    guideResLabel.textContent = `Frame guide: ${currentAspectRatio}`;
    if (mediaList[currentIndex]?.texture) fitAspect(mediaList[currentIndex].texture);
  });

  document.getElementById('btn-tool-effects')?.addEventListener('click', () => pillEffects.click());
  document.getElementById('btn-tool-adjust')?.addEventListener('click', () => pillAdjust.click());
  document.getElementById('btn-tool-brush')?.addEventListener('click', () => pillBrush.click());
  document.getElementById('btn-tool-crop')?.addEventListener('click', () => pillCrop.click());

  // --- Export Modal Engine ---
  btnExport.addEventListener('click', () => exportModal.classList.add('open'));
  btnCloseExport.addEventListener('click', () => exportModal.classList.remove('open'));

  btnConfirmExport.addEventListener('click', () => {
    if (mediaList.length === 0) {
      alert('Carga al menos un archivo antes de exportar.');
      return;
    }

    btnConfirmExport.textContent = 'Exportando...';
    btnConfirmExport.disabled = true;

    setTimeout(() => {
      // Create a downloadable WebM video file from the canvas stream
      const canvas = canvasContainer.querySelector('canvas');
      if (canvas) {
        const stream = canvas.captureStream(24);
        const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
        const chunks = [];

        recorder.ondataavailable = (e) => chunks.push(e.data);
        recorder.onstop = () => {
          const blob = new Blob(chunks, { type: 'video/webm' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = 'Flipbook_Animacion_Pro.webm';
          a.click();

          btnConfirmExport.textContent = 'Compilar y Descargar';
          btnConfirmExport.disabled = false;
          exportModal.classList.remove('open');
        };

        recorder.start();
        play();

        // Record 3 seconds or full loop
        setTimeout(() => {
          pause();
          recorder.stop();
        }, Math.max(3000, mediaList.length * speedMs));
      } else {
        btnConfirmExport.textContent = 'Compilar y Descargar';
        btnConfirmExport.disabled = false;
        exportModal.classList.remove('open');
      }
    }, 500);
  });

  // --- File Processing ---
  function processFiles(files) {
    if (!files || files.length === 0) return;

    let addedCount = 0;
    Array.from(files).forEach((file) => {
      const isVideo = file.type.startsWith('video/');
      const url = URL.createObjectURL(file);

      if (isVideo) {
        mediaList.push({
          type: 'video',
          url: url,
          texture: null,
          name: file.name
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
          name: file.name
        });
        addedCount++;
      }
    });

    if (addedCount > 0) {
      renderAssetsGrid();
      const firstNewIndex = mediaList.length - addedCount;
      goToSlide(firstNewIndex);
    }
  }

  // Dropzone Event Listeners
  gridDropzone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => processFiles(e.target.files));

  gridDropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    gridDropzone.classList.add('dragover');
  });

  gridDropzone.addEventListener('dragleave', () => gridDropzone.classList.remove('dragover'));

  gridDropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    gridDropzone.classList.remove('dragover');
    processFiles(e.dataTransfer.files);
  });

  // Global Drag & Drop on Stage
  document.getElementById('stage-viewport').addEventListener('dragover', (e) => e.preventDefault());
  document.getElementById('stage-viewport').addEventListener('drop', (e) => {
    e.preventDefault();
    processFiles(e.dataTransfer.files);
  });

  // --- Render 2-Column Assets Grid Cards ---
  function renderAssetsGrid() {
    assetsGrid.innerHTML = '';
    mediaList.forEach((item, idx) => {
      const card = document.createElement('div');
      card.className = `asset-card ${idx === currentIndex ? 'active' : ''}`;

      const thumbHtml = item.type === 'image'
        ? `<img src="${item.url}" alt="Frame ${idx + 1}" />`
        : `<video src="${item.url}"></video>`;

      card.innerHTML = `
        <div class="asset-thumb-wrap">
          ${thumbHtml}
        </div>
        <div class="asset-card-title">Frame ${idx + 1}</div>
        <button class="btn-card-del" title="Eliminar">&times;</button>
      `;

      card.addEventListener('click', (e) => {
        if (e.target.classList.contains('btn-card-del')) return;
        goToSlide(idx);
      });

      card.querySelector('.btn-card-del').addEventListener('click', (e) => {
        e.stopPropagation();
        URL.revokeObjectURL(item.url);
        mediaList.splice(idx, 1);
        renderAssetsGrid();

        if (mediaList.length === 0) {
          goToSlide(-1);
        } else {
          goToSlide(Math.min(currentIndex, mediaList.length - 1));
        }
      });

      assetsGrid.appendChild(card);
    });
  }

  function updateActiveGridCard() {
    const cards = assetsGrid.querySelectorAll('.asset-card');
    cards.forEach((card, idx) => {
      card.classList.toggle('active', idx === currentIndex);
    });
  }

  // --- Controls & Shortcuts ---
  btnPlay.addEventListener('click', togglePlay);
  btnStepNext.addEventListener('click', nextSlide);
  btnStepPrev.addEventListener('click', prevSlide);

  btnLoop.addEventListener('click', () => {
    isLoop = !isLoop;
    btnLoop.classList.toggle('active', isLoop);
  });

  btnFpsToggle.addEventListener('click', () => {
    fpsIndex = (fpsIndex + 1) % fpsRates.length;
    const currentFps = fpsRates[fpsIndex];
    btnFpsToggle.textContent = `${currentFps} FPS`;
    speedMs = Math.round(1000 / currentFps);

    if (isPlaying && mediaList[currentIndex]?.type === 'image') {
      clearInterval(playbackInterval);
      playbackInterval = setInterval(nextSlide, speedMs);
    }
  });

  selectTransition.addEventListener('change', (e) => {
    transitionMode = e.target.value;
  });

  volumeSlider.addEventListener('input', (e) => {
    if (videoOverlay) videoOverlay.volume = parseFloat(e.target.value);
  });

  // Keyboard Shortcuts
  document.addEventListener('keydown', (e) => {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;

    if (e.code === 'Space') {
      e.preventDefault();
      togglePlay();
    } else if (e.code === 'ArrowRight') {
      e.preventDefault();
      nextSlide();
    } else if (e.code === 'ArrowLeft') {
      e.preventDefault();
      prevSlide();
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      deleteCurrentFrame();
    } else if (e.ctrlKey && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      duplicateCurrentFrame();
    } else if (e.ctrlKey && e.key.toLowerCase() === 'r') {
      e.preventDefault();
      reverseSequence();
    }
  });

  // Initialize
  initWebGL();
});