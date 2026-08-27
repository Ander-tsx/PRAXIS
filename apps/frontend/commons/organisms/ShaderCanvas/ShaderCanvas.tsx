'use client';

/**
 * ShaderCanvas — organismo compartido (subió de `PublicFooter` cuando
 * `AuthPanel` también lo necesitó). Usa three.js en bruto (sin
 * react-three-fiber): pesado, pero es la única forma razonable de un campo de
 * puntos halftone en dos pasadas. Técnica adaptada del sistema de motion de
 * Kyloo (ver `kyloo-design/SKILL.md` §9) — sin ninguna marca ni color de
 * Kyloo dentro, los colores los pasa quien lo usa.
 */

import type { JSX } from 'react';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

/** Multiplicadores mientras se mantiene pulsado — el campo se agita más. */
const HOLD_AMPLITUDE_MULTIPLIER = 2;
const HOLD_TIME_SPEED_MULTIPLIER = 1.5;
const LERP_SPEED = 0.03;
const REVEAL_DELAY_MS = 300;
const REVEAL_DURATION_MS = 2000;
const TARGET_FRAME_MS = 1000 / 60;

/** Un milisegundo de margen: sin él, una pantalla a 60Hz cuyo delta cae un
 * pelo por debajo de 1000/60 se salta un fotograma de cada dos. */
const FRAME_SLACK_MS = 1;

const REVEAL_EASE = [0.31, 0.75, 0.22, 1] as const;

const VERTEX_SHADER = /* glsl */ `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/**
 * Pasada 1 — el campo. Un patrón de interferencia procedural cuya luminancia
 * se escribe en el canal rojo de un render target off-screen.
 */
const FIELD_FRAGMENT_SHADER = /* glsl */ `
precision highp float;
uniform float uTime;
uniform float uAmplitude;
uniform float uReveal;
varying vec2 vUv;

void main() {
  vec2 c = 2.0 * vUv - 1.0;
  float ds = uAmplitude * uReveal;

  c += ds * 0.4 * sin(c.yx + vec2(1.2, 3.4) + uTime);
  c += ds * 0.2 * sin(5.2 * c.yx + vec2(3.5, 0.4) + uTime);
  c += ds * 0.3 * sin(3.5 * c.yx + vec2(1.2, 3.1) + uTime);
  c += ds * 1.6 * sin(0.4 * c.yx + vec2(0.8, 2.4) + uTime);

  float L = length(c);
  float v = 0.0;
  for (int i = 0; i < 4; i++) {
    v = mix(v, float(i) / 3.0, cos(float(i) * L));
  }

  gl_FragColor = vec4(clamp(v, 0.0, 1.0), 0.0, 0.0, 1.0);
}
`;

/**
 * Pasada 2 — los puntos. Muestrea el campo una vez por celda y dibuja una
 * rejilla halftone cuyos radios siguen la luminancia, fundidos en metaballs
 * por `smin` cuando `uGooeyness > 0`.
 */
const DOT_FRAGMENT_SHADER = /* glsl */ `
precision highp float;

uniform sampler2D uFieldTex;
uniform vec2 uFieldRes;
uniform vec2 uResolution;
uniform float uReveal;

uniform float uPixelSize;
uniform float uGooeyness;
uniform float uContrast;
uniform float uBias;
uniform int uInvert;
uniform vec3 uBg;
uniform vec3 uFg;
uniform int uTransparentBg;

uniform float uWaveTime;
uniform float uWaveFrequency;
uniform float uWaveAmplitude;

varying vec2 vUv;

float lumaToRadius(float luma, float pixelSize, float biasOffset) {
  float v = clamp((luma - 0.5 + uBias + biasOffset) * uContrast + 0.5, 0.0, 1.0);
  if (uInvert == 1) v = 1.0 - v;
  return v * pixelSize * 0.6 + pixelSize * 0.05;
}

float smin(float a, float b, float k) {
  if (k <= 0.001) return min(a, b);
  float h = max(k - abs(a - b), 0.0) / k;
  return min(a, b) - h * h * k * 0.25;
}

void main() {
  vec2 pixelCoord = vUv * uResolution;
  vec2 baseCellIndex = floor(pixelCoord / uPixelSize);
  float minDist = 1.0e5;
  float smoothK = uGooeyness * 1.5;

  const int R = 1;
  for (int dx = -R; dx <= R; dx++) {
    for (int dy = -R; dy <= R; dy++) {
      vec2 cellIndex = baseCellIndex + vec2(float(dx), float(dy));
      if (mod(cellIndex.x + cellIndex.y, 2.0) > 0.5) continue;

      vec2 cellCenter = (cellIndex + 0.5) * uPixelSize;
      vec2 fieldUv    = (cellIndex + 0.5) / uFieldRes;
      float luma      = texture2D(uFieldTex, fieldUv).r;

      float cellY     = cellCenter.y / uResolution.y;
      float wavePhase = cellY * uWaveFrequency * 6.2831853 - uWaveTime;
      float waveBias  = sin(wavePhase) * uWaveAmplitude;

      float dist   = length(pixelCoord - cellCenter);
      float radius = lumaToRadius(luma, uPixelSize, waveBias);
      minDist = smin(minDist, dist - radius, smoothK * uPixelSize);
    }
  }

  float aa    = max(fwidth(minDist), 0.0001);
  float shape = 1.0 - smoothstep(-aa, aa, minDist);

  if (uTransparentBg == 1) {
    gl_FragColor = vec4(uFg * uReveal, shape * uReveal);
  } else {
    vec3 color = mix(uBg, uFg, shape);
    gl_FragColor = vec4(color * uReveal, 1.0);
  }
}
`;

export type ShaderCanvasProps = {
  className?: string;
  amplitude?: number;
  timeSpeed?: number;
  pixelSize?: number;
  gooeyness?: number;
  contrast?: number;
  bias?: number;
  invert?: boolean;
  bg?: string;
  fg?: string;
  transparentBg?: boolean;
  waveAmplitude?: number;
  waveFrequency?: number;
  waveTimeSpeed?: number;
  autoReveal?: boolean;
  interactive?: boolean;
  maxDpr?: number;
};

type Settings = Required<Omit<ShaderCanvasProps, 'className'>>;

type FieldUniforms = {
  uTime: { value: number };
  uAmplitude: { value: number };
  uReveal: { value: number };
};

type DotUniforms = {
  uFieldTex: { value: THREE.Texture | null };
  uFieldRes: { value: THREE.Vector2 };
  uResolution: { value: THREE.Vector2 };
  uReveal: { value: number };
  uPixelSize: { value: number };
  uGooeyness: { value: number };
  uContrast: { value: number };
  uBias: { value: number };
  uInvert: { value: number };
  uBg: { value: THREE.Vector3 };
  uFg: { value: THREE.Vector3 };
  uTransparentBg: { value: number };
  uWaveTime: { value: number };
  uWaveFrequency: { value: number };
  uWaveAmplitude: { value: number };
};

/** Evalúa una curva `cubic-bezier(x1, y1, x2, y2)` de CSS en el progreso `x`. */
function cubicBezierEasing(x1: number, y1: number, x2: number, y2: number) {
  const axis = (t: number, a: number, b: number): number => {
    const u = 1 - t;
    return 3 * u * u * t * a + 3 * u * t * t * b + t * t * t;
  };

  return (x: number): number => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;

    let low = 0;
    let high = 1;
    let t = x;
    for (let i = 0; i < 24; i++) {
      if (axis(t, x1, x2) < x) {
        low = t;
      } else {
        high = t;
      }
      t = (low + high) / 2;
    }
    return axis(t, y1, y2);
  };
}

/** Parsea `#RGB` / `#RRGGBB` directo a componentes 0..1, sin pasar por
 * `THREE.Color` — su gestión de color convertiría sRGB a lineal y desviaría
 * el hex que se pide; estos shaders escriben `gl_FragColor` directo. */
function hexToRgb(hex: string): [number, number, number] {
  let value = hex.trim().replace(/^#/, '');
  if (value.length === 3) {
    value = value[0] + value[0] + value[1] + value[1] + value[2] + value[2];
  }
  if (!/^[0-9a-fA-F]{6}$/.test(value)) return [0, 0, 0];
  const int = Number.parseInt(value, 16);
  return [((int >> 16) & 255) / 255, ((int >> 8) & 255) / 255, (int & 255) / 255];
}

export function ShaderCanvas({
  className,
  amplitude = 0.8,
  timeSpeed = 0.0045,
  pixelSize = 4,
  gooeyness = 0.58,
  contrast = 1.5,
  bias = 0,
  invert = true,
  bg = '#E8E8E3',
  fg = '#080807',
  transparentBg = false,
  waveAmplitude = 0,
  waveFrequency = 1,
  waveTimeSpeed = 0,
  autoReveal = true,
  interactive = true,
  maxDpr = 1,
}: ShaderCanvasProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const settingsRef = useRef<Settings>({
    amplitude,
    timeSpeed,
    pixelSize,
    gooeyness,
    contrast,
    bias,
    invert,
    bg,
    fg,
    transparentBg,
    waveAmplitude,
    waveFrequency,
    waveTimeSpeed,
    autoReveal,
    interactive,
    maxDpr,
  });
  const syncRef = useRef<(() => void) | null>(null);
  const [rebuild, setRebuild] = useState(0);

  // `transparentBg` decide el alpha del contexto WebGL, que solo se elige al
  // construir — es la única prop que reconstruye la escena. `rebuild` es la
  // otra: no se lee dentro del efecto, solo se incrementa para forzarlo a
  // repetirse tras perder el contexto WebGL.
  // biome-ignore lint/correctness/useExhaustiveDependencies: rebuild es señal, no un valor que se lea.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: transparentBg,
        antialias: false,
        powerPreference: 'high-performance',
      });
    } catch {
      return; // Sin WebGL disponible — el canvas se queda en blanco, no revienta.
    }
    renderer.setClearColor(0x000000, transparentBg ? 0 : 1);

    const onContextLost = (event: Event) => {
      event.preventDefault();
      stopLoop();
    };
    const onContextRestored = () => {
      setRebuild((count) => count + 1);
    };
    canvas.addEventListener('webglcontextlost', onContextLost);
    canvas.addEventListener('webglcontextrestored', onContextRestored);

    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const geometry = new THREE.PlaneGeometry(2, 2);

    const fieldUniforms: FieldUniforms = {
      uTime: { value: 0 },
      uAmplitude: { value: settingsRef.current.amplitude },
      uReveal: { value: settingsRef.current.autoReveal ? 0 : 1 },
    };

    const dotUniforms: DotUniforms = {
      uFieldTex: { value: null },
      uFieldRes: { value: new THREE.Vector2(1, 1) },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uReveal: { value: settingsRef.current.autoReveal ? 0 : 1 },
      uPixelSize: { value: settingsRef.current.pixelSize },
      uGooeyness: { value: settingsRef.current.gooeyness },
      uContrast: { value: settingsRef.current.contrast },
      uBias: { value: settingsRef.current.bias },
      uInvert: { value: settingsRef.current.invert ? 1 : 0 },
      uBg: { value: new THREE.Vector3() },
      uFg: { value: new THREE.Vector3() },
      uTransparentBg: { value: transparentBg ? 1 : 0 },
      uWaveTime: { value: 0 },
      uWaveFrequency: { value: settingsRef.current.waveFrequency },
      uWaveAmplitude: { value: settingsRef.current.waveAmplitude },
    };

    const fieldMaterial = new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: FIELD_FRAGMENT_SHADER,
      uniforms: fieldUniforms,
      depthTest: false,
      depthWrite: false,
    });

    const dotMaterial = new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: DOT_FRAGMENT_SHADER,
      uniforms: dotUniforms,
      transparent: transparentBg,
      depthTest: false,
      depthWrite: false,
      // `fwidth` es núcleo en WebGL2 (el contexto que usa three.js por
      // defecto), así que ya no hace falta declarar la extensión
      // `OES_standard_derivatives` de WebGL1.
    });

    const fieldScene = new THREE.Scene();
    fieldScene.add(new THREE.Mesh(geometry, fieldMaterial));

    const dotScene = new THREE.Scene();
    dotScene.add(new THREE.Mesh(geometry, dotMaterial));

    // Un texel por celda de punto: la pasada 2 muestrea el campo una vez por
    // celda, nunca por píxel, así que un target a resolución completa sería
    // puro desperdicio.
    const fieldTarget = new THREE.WebGLRenderTarget(1, 1, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      depthBuffer: false,
      stencilBuffer: false,
      generateMipmaps: false,
    });
    dotUniforms.uFieldTex.value = fieldTarget.texture;

    const applySize = () => {
      const rect = canvas.getBoundingClientRect();
      const cssWidth = Math.max(1, Math.round(rect.width));
      const cssHeight = Math.max(1, Math.round(rect.height));
      const ratio = Math.max(
        0.5,
        Math.min(window.devicePixelRatio || 1, settingsRef.current.maxDpr),
      );

      renderer.setPixelRatio(ratio);
      renderer.setSize(cssWidth, cssHeight, false);

      const bufferWidth = Math.max(1, Math.round(cssWidth * ratio));
      const bufferHeight = Math.max(1, Math.round(cssHeight * ratio));
      dotUniforms.uResolution.value.set(bufferWidth, bufferHeight);

      // pixelSize está en px CSS, se escala por el ratio de dispositivo para
      // mantener el punto a un tamaño físico constante en pantallas retina.
      const cellSize = Math.max(1, settingsRef.current.pixelSize * ratio);
      dotUniforms.uPixelSize.value = cellSize;

      const fieldWidth = Math.max(1, Math.ceil(bufferWidth / cellSize));
      const fieldHeight = Math.max(1, Math.ceil(bufferHeight / cellSize));
      fieldTarget.setSize(fieldWidth, fieldHeight);
      dotUniforms.uFieldRes.value.set(fieldWidth, fieldHeight);
    };

    const applySettings = () => {
      const s = settingsRef.current;
      dotUniforms.uGooeyness.value = s.gooeyness;
      dotUniforms.uContrast.value = s.contrast;
      dotUniforms.uBias.value = s.bias;
      dotUniforms.uInvert.value = s.invert ? 1 : 0;
      dotUniforms.uWaveFrequency.value = s.waveFrequency;
      dotUniforms.uWaveAmplitude.value = s.waveAmplitude;
      dotUniforms.uBg.value.fromArray(hexToRgb(s.bg));
      dotUniforms.uFg.value.fromArray(hexToRgb(s.fg));
      if (!s.autoReveal) {
        fieldUniforms.uReveal.value = 1;
        dotUniforms.uReveal.value = 1;
      }
    };

    const renderFrame = () => {
      renderer.setRenderTarget(fieldTarget);
      renderer.render(fieldScene, camera);
      renderer.setRenderTarget(null);
      renderer.render(dotScene, camera);
    };

    const ease = cubicBezierEasing(...REVEAL_EASE);
    const mountedAt = performance.now();
    const revealAt = (now: number): number => {
      if (!settingsRef.current.autoReveal) return 1;
      const progress = (now - mountedAt - REVEAL_DELAY_MS) / REVEAL_DURATION_MS;
      if (progress <= 0) return 0;
      if (progress >= 1) return 1;
      return ease(progress);
    };

    let currentAmplitude = settingsRef.current.amplitude;
    let currentTimeSpeed = settingsRef.current.timeSpeed;
    let holding = false;
    let rafId: number | null = null;
    let lastFrame = 0;

    const step = (now: number) => {
      rafId = requestAnimationFrame(step);
      if (now - lastFrame < TARGET_FRAME_MS - FRAME_SLACK_MS) return;
      lastFrame = now;

      const s = settingsRef.current;
      const held = holding && s.interactive;
      const targetAmplitude = s.amplitude * (held ? HOLD_AMPLITUDE_MULTIPLIER : 1);
      const targetTimeSpeed = s.timeSpeed * (held ? HOLD_TIME_SPEED_MULTIPLIER : 1);
      currentAmplitude += (targetAmplitude - currentAmplitude) * LERP_SPEED;
      currentTimeSpeed += (targetTimeSpeed - currentTimeSpeed) * LERP_SPEED;

      const reveal = revealAt(now);
      fieldUniforms.uAmplitude.value = currentAmplitude;
      fieldUniforms.uTime.value += currentTimeSpeed;
      fieldUniforms.uReveal.value = reveal;
      dotUniforms.uReveal.value = reveal;
      dotUniforms.uWaveTime.value += s.waveTimeSpeed;

      renderFrame();
    };

    const startLoop = () => {
      if (rafId !== null) return;
      lastFrame = performance.now() - TARGET_FRAME_MS;
      rafId = requestAnimationFrame(step);
    };

    const stopLoop = () => {
      if (rafId === null) return;
      cancelAnimationFrame(rafId);
      rafId = null;
    };

    const renderStill = () => {
      fieldUniforms.uReveal.value = 1;
      dotUniforms.uReveal.value = 1;
      fieldUniforms.uAmplitude.value = settingsRef.current.amplitude;
      renderFrame();
    };

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const applyMotionPreference = () => {
      if (motionQuery.matches) {
        stopLoop();
        renderStill();
      } else {
        startLoop();
      }
    };

    applySettings();
    applySize();
    applyMotionPreference();

    syncRef.current = () => {
      applySettings();
      applySize();
      if (rafId === null) renderStill();
    };

    const resizeObserver = new ResizeObserver(() => {
      applySize();
      if (rafId === null) renderStill();
    });
    resizeObserver.observe(canvas.parentElement ?? canvas);

    const pointerTarget = canvas.parentElement ?? canvas;
    const onPointerDown = () => {
      holding = true;
    };
    const onPointerRelease = () => {
      holding = false;
    };
    pointerTarget.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointerup', onPointerRelease);
    window.addEventListener('pointercancel', onPointerRelease);
    motionQuery.addEventListener('change', applyMotionPreference);

    return () => {
      syncRef.current = null;
      stopLoop();
      resizeObserver.disconnect();
      pointerTarget.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', onPointerRelease);
      window.removeEventListener('pointercancel', onPointerRelease);
      motionQuery.removeEventListener('change', applyMotionPreference);

      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);

      fieldTarget.dispose();
      fieldMaterial.dispose();
      dotMaterial.dispose();
      geometry.dispose();
      renderer.setRenderTarget(null);
      // `forceContextLoss()` NO se llama aquí: dejaría el elemento canvas
      // inhabilitado para siempre, y React lo reutiliza entre navegaciones
      // client-side — el canvas volvería muerto.
      renderer.dispose();
    };
  }, [transparentBg, rebuild]);

  // El resto de props son "hot-swappable": se reflejan en el ref que lee el
  // loop y se empujan los uniforms estáticos — sin desmontar nada.
  useEffect(() => {
    settingsRef.current = {
      amplitude,
      timeSpeed,
      pixelSize,
      gooeyness,
      contrast,
      bias,
      invert,
      bg,
      fg,
      transparentBg,
      waveAmplitude,
      waveFrequency,
      waveTimeSpeed,
      autoReveal,
      interactive,
      maxDpr,
    };
    syncRef.current?.();
  }, [
    amplitude,
    timeSpeed,
    pixelSize,
    gooeyness,
    contrast,
    bias,
    invert,
    bg,
    fg,
    transparentBg,
    waveAmplitude,
    waveFrequency,
    waveTimeSpeed,
    autoReveal,
    interactive,
    maxDpr,
  ]);

  return (
    // Sin `tabindex`, un <canvas> no es focusable — `aria-hidden` es
    // exactamente lo que pide un lienzo puramente decorativo sin alternativa
    // textual.
    // biome-ignore lint/a11y/noAriaHiddenOnFocusable: no lleva tabindex.
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={`absolute inset-0 h-full w-full ${className ?? ''}`}
    />
  );
}
