'use client';

/**
 * EchoDot3D — sub-archivo del organismo LandingHero.
 * Excepción Atomic Design justificada: usa @react-three/fiber,
 * @react-three/drei y Three.js (dependencias pesadas, SSR=false).
 * Solo tiene sentido en el hero de la landing como elemento visual.
 */

import { alpha, colors } from '@praxis/commons';
import { ContactShadows, Environment, Float, useGLTF } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { gsap } from 'gsap';
import { Suspense, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

/**
 * El color del halo que separa el modelo del fondo.
 *
 * `surface-elevated` con un 18 % de índigo: en oscuro da el azul marino que ya
 * tenía, y en claro un lavanda muy suave que sigue destacando el dispositivo sin
 * ensuciar la página. La mezcla se hace en CSS —no en JS— porque los dos
 * ingredientes son variables que cambian con el tema.
 */
const AURA = `color-mix(in srgb, ${colors.primary} 18%, ${colors.surfaceElevated})`;

/* Pre-load the model */
useGLTF.preload('/alexa.glb');

const UTTERANCES = [
  'Alexa, dame un resumen del proyecto',
  'Alexa, ¿qué tareas tengo asignadas?',
  'Alexa, ¿qué hay en la columna En progreso?',
  'Alexa, mueve la tarea de login a Hecho',
  'Alexa, ¿qué vence esta semana?',
  'Alexa, crea una tarea en el tablero de diseño',
  'Alexa, ¿quién tiene más tareas abiertas?',
];

/* ── Echo Dot GLB model ──────────────────────────────────────── */
function EchoDotModel() {
  const { scene } = useGLTF('/alexa.glb');
  const groupRef = useRef<THREE.Group>(null);
  const clonedScene = scene.clone(true);

  useFrame(({ clock }) => {
    if (groupRef.current) {
      groupRef.current.rotation.y = clock.getElapsedTime() * 0.18;
    }
  });

  return (
    <Float speed={3.67} rotationIntensity={2} floatIntensity={0.55} floatingRange={[-0.12, 0.12]}>
      <group ref={groupRef}>
        <primitive object={clonedScene} scale={1.18} position={[0, -1, 0]} />
      </group>
    </Float>
  );
}

/* ── Lighting scene ─────────────────────────────────────────── */
function Scene() {
  return (
    <>
      <ambientLight intensity={0.9} color="#d4d8ff" />
      <hemisphereLight args={['#8b9fff', '#6C63FF', 0.6]} />
      <pointLight position={[2, 5, 5]} intensity={120} color="#ffffff" />
      <pointLight position={[-2, 2, 5]} intensity={60} color="#e0e7ff" />
      <pointLight position={[0, -2.5, 0]} intensity={80} color="#6C63FF" />
      <pointLight position={[-4, 2, -3]} intensity={55} color="#a78bfa" />
      <pointLight position={[4, 0, -3]} intensity={35} color="#818cf8" />
      <pointLight position={[0, 6, 2]} intensity={40} color="#ffffff" />
      <Environment preset="city" />
      <ContactShadows
        position={[0, -3.2, 0]}
        opacity={0.55}
        scale={6}
        blur={2.5}
        far={4}
        color="#6C63FF"
      />
      <EchoDotModel />
    </>
  );
}

function LoadingFallback() {
  return (
    <mesh>
      <sphereGeometry args={[1.3, 32, 32]} />
      <meshStandardMaterial color="#14152A" metalness={0.3} roughness={0.6} />
    </mesh>
  );
}

/* ── Speech bubble ─────────────────────────────────────────── */
function SpeechBubble({ text, visible }: { text: string; visible: boolean }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    if (visible) {
      gsap.fromTo(
        ref.current,
        { opacity: 0, x: -18, scale: 0.9 },
        { opacity: 1, x: 0, scale: 1, duration: 0.45, ease: 'back.out(1.7)' },
      );
    } else {
      gsap.to(ref.current, { opacity: 0, x: 18, scale: 0.9, duration: 0.35, ease: 'power2.in' });
    }
  }, [visible]);

  return (
    <div
      ref={ref}
      className="flex items-center gap-3.5 rounded-2xl rounded-bl-sm px-5 py-4"
      style={{
        /* ⚠️ La burbuja llevaba el color de superficie **a fuego**
           (`rgba(22,27,39,0.92)`, que es `--color-surface` del tema oscuro), así
           que en claro seguía siendo una tarjeta negra sobre una página blanca.
           Con el token se invierte sola y el texto —que ya usaba
           `text-text-primary`— vuelve a tener contraste contra su propio fondo. */
        background: alpha(colors.surface, 92),
        border: `1px solid ${alpha(colors.primary, 35)}`,
        boxShadow: `0 8px 32px ${alpha(colors.overlay, 50)}, 0 0 0 1px ${alpha(colors.primary, 8)}`,
        backdropFilter: 'blur(14px)',
        maxWidth: 400,
        opacity: 0,
      }}
    >
      <div
        className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full"
        style={{
          background: alpha(colors.primary, 15),
          border: `1.5px solid ${alpha(colors.primary, 55)}`,
        }}
      >
        <div
          className="h-2.5 w-2.5 animate-pulse rounded-full"
          style={{ background: 'var(--color-primary)' }}
        />
      </div>
      <output className="font-sans text-base leading-snug text-text-primary" aria-live="polite">
        {text}
      </output>
    </div>
  );
}

/* ── Main export ─────────────────────────────────────────────── */
export function EchoDot3D() {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 1400);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!visible) return;
    const holdTimer = setTimeout(() => {
      setVisible(false);
      const nextTimer = setTimeout(() => {
        setCurrentIdx((i) => (i + 1) % UTTERANCES.length);
        setVisible(true);
      }, 480);
      return () => clearTimeout(nextTimer);
    }, 3000);
    return () => clearTimeout(holdTimer);
  }, [visible]);

  return (
    <div className="flex flex-col items-center" style={{ width: 440 }}>
      {/* Alexa Skill label */}
      <div
        className="mb-5 flex items-center gap-2 rounded-full border px-4 py-1.5"
        style={{ borderColor: 'rgba(108,99,255,0.3)', background: 'rgba(108,99,255,0.08)' }}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" aria-hidden="true" />
        <span className="font-sans text-sm font-medium tracking-wide text-primary">
          Integración Alexa Skill
        </span>
      </div>

      {/* Speech bubble */}
      <div className="mb-3 w-full pl-1" style={{ minHeight: 74 }}>
        <SpeechBubble text={UTTERANCES[currentIdx]} visible={visible} />
      </div>

      {/* Three.js Canvas */}
      <div style={{ position: 'relative', width: 420, height: 400 }}>
        {/* Background contrast zone */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            /**
             * ⚠️ **El aura ya no es oscura a fuego.**
             *
             * Era un elipse azul marino fijo (`rgba(38,34,80,…)`) que existía
             * para separar el modelo del fondo. En oscuro cumplía; en claro se
             * veía como una mancha negra alrededor del dispositivo — el fondo
             * había cambiado y la capa que lo contrastaba, no.
             *
             * Ahora parte de `surface-elevated` con un toque de índigo, así que
             * hace lo mismo en los dos temas: **oscurece sobre oscuro y aclara
             * sobre claro**, conservando el tinte de marca que tenía.
             */
            background: `radial-gradient(ellipse 80% 75% at 50% 45%, ${alpha(AURA, 55)} 0%, ${alpha(AURA, 30)} 45%, transparent 72%)`,
            pointerEvents: 'none',
            zIndex: 0,
          }}
        />
        {/* Glow pool */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            bottom: 8,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 320,
            height: 88,
            background:
              'radial-gradient(ellipse, rgba(108,99,255,0.45) 0%, rgba(108,99,255,0.18) 45%, transparent 72%)',
            filter: 'blur(22px)',
            pointerEvents: 'none',
            zIndex: 0,
          }}
        />
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            bottom: -12,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 480,
            height: 128,
            background: 'radial-gradient(ellipse, rgba(108,99,255,0.18) 0%, transparent 68%)',
            filter: 'blur(32px)',
            pointerEvents: 'none',
            zIndex: 0,
          }}
        />
        <Canvas
          camera={{ position: [0, 1.5, 5], fov: 36 }}
          gl={{ antialias: true, alpha: true }}
          style={{ background: 'transparent', position: 'relative', zIndex: 1 }}
          aria-label="Modelo 3D de Amazon Echo Dot"
        >
          <Suspense fallback={<LoadingFallback />}>
            <Scene />
          </Suspense>
        </Canvas>
      </div>
    </div>
  );
}
