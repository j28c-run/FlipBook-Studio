# 🎬 Flipbook Studio Pro

**Reproductor profesional de secuencias de imágenes y videos con efectos de transición WebGL 3D.**  
Carga tus imágenes o videos directamente desde tu equipo y reprodúcelos como animación *Flipbook* con transiciones configurables a nivel de software de edición.

---

## ✨ Características

| Función | Detalle |
|---|---|
| 🖼️ **Carga Flexible** | Arrastra imágenes (JPG, PNG, WEBP, GIF) o videos (MP4, WEBM) |
| 🎞️ **Modo Flipbook** | Animación fotograma a fotograma con velocidad configurable |
| 🎬 **Videos Secuenciales** | Reproducción continua de videos uno tras otro |
| 🌊 **Transición WebGL 3D** | Efecto onda líquida con Shaders GLSL vía Three.js |
| ✨ **Fundido Suave (Fade)** | Transición cruzada elegante entre fotogramas |
| ⚡ **Corte Instantáneo** | Sin efectos — ideal para Flipbook rápido |
| 📊 **Timeline Interactivo** | Barra de progreso con scrubber arrastrable |
| ⏱️ **Presets de FPS** | Botones de velocidad rápida: 24, 10, 5 y 1 FPS |
| 🔁 **Bucle** | Repetición infinita activable/desactivable |
| ⛶ **Pantalla Completa** | Soporte nativo fullscreen API |
| ⌨️ **Atajos de Teclado** | Espacio (Play/Pausa) · ← → (Fotograma anterior/siguiente) |
| 🗂️ **Galería de Medios** | Panel lateral con miniaturas, formato y botones de eliminación |

---

## 🚀 Cómo Usar

1. **Descarga o clona el repositorio:**
   ```bash
   git clone git@github.com:j28c-run/FlipBook-Studio.git
   ```

2. **Abre el archivo principal directamente en tu navegador:**
   ```
   dist/index.html
   ```
   > No requiere servidor ni instalación. Funciona 100% offline en el navegador.

3. **Carga tus archivos:**
   - Haz clic en **"Galería de Medios"** en la esquina superior derecha.
   - Arrastra tus imágenes o videos a la zona de carga, o haz clic para explorar.

4. **Reproduce:**
   - Presiona **▶ Play** en la barra de controles o usa la tecla **Espacio**.
   - Ajusta la velocidad con los presets de FPS (`24`, `10`, `5`, `1`).
   - Cambia el efecto de transición desde el menú desplegable en el header.

---

## 📂 Estructura del Proyecto

```
FlipBook-Studio/
├── dist/
│   ├── index.html      ← Aplicación principal
│   ├── script.js       ← Motor WebGL + Lógica de reproducción
│   └── style.css       ← Sistema de diseño Studio Pro
├── .gitignore
└── README.md
```

---

## 🎨 Capturas de Pantalla

### Estado inicial (sin medios cargados)
![Pantalla vacía con prompt de carga](https://i.imgur.com/placeholder-empty.png)

### Reproducción con galería de medios abierta
![Vista con imágenes cargadas y panel lateral](https://i.imgur.com/placeholder-gallery.png)

> 💡 **Tip:** Puedes arrastrar archivos directamente sobre el área de visualización sin necesidad de abrir el panel lateral.

---

## 🛠️ Tecnologías

- **HTML5** + **CSS3** (Variables CSS, Grid, Flexbox, Glassmorphism)
- **JavaScript** ES6+ (sin frameworks)
- **[Three.js r83](https://threejs.org/)** — Motor 3D WebGL con Shaders GLSL personalizados
- **[GSAP 1.20](https://greensock.com/gsap/)** — Animaciones de transición suaves (TweenMax)
- **Google Fonts** — Tipografía *Inter*

---

## 📋 Atajos de Teclado

| Tecla | Acción |
|---|---|
| `Espacio` | Play / Pausa |
| `←` Flecha Izquierda | Fotograma anterior |
| `→` Flecha Derecha | Fotograma siguiente |

---

## 📄 Licencia

MIT — Libre de usar, modificar y distribuir.
