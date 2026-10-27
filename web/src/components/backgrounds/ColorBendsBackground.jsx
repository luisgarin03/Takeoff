// Adapted from https://reactbits.dev/r/ColorBends-JS-CSS.json
// React Bits / David Haz; license in public/asset-licenses.txt.
'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import './ColorBendsBackground.css';

const MAX_COLORS = 8;

const frag = `
#define MAX_COLORS ${MAX_COLORS}
uniform vec2 uCanvas;
uniform float uTime;
uniform float uSpeed;
uniform vec2 uRot;
uniform int uColorCount;
uniform vec3 uColors[MAX_COLORS];
uniform int uTransparent;
uniform float uScale;
uniform float uFrequency;
uniform float uWarpStrength;
uniform vec2 uPointer; // in NDC [-1,1]
uniform float uMouseInfluence;
uniform float uParallax;
uniform float uNoise;
uniform int uIterations;
uniform float uIntensity;
uniform float uBandWidth;
varying vec2 vUv;

void main() {
  float t = uTime * uSpeed;
  vec2 p = vUv * 2.0 - 1.0;
  p += uPointer * uParallax * 0.1;
  vec2 rp = vec2(p.x * uRot.x - p.y * uRot.y, p.x * uRot.y + p.y * uRot.x);
  vec2 q = vec2(rp.x * (uCanvas.x / uCanvas.y), rp.y);
  q /= max(uScale, 0.0001);
  q /= 0.5 + 0.2 * dot(q, q);
  q += 0.2 * cos(t) - 7.56;
  vec2 toward = (uPointer - rp);
  q += toward * uMouseInfluence * 0.2;

    for (int j = 0; j < 5; j++) {
      if (j >= uIterations - 1) break;
      vec2 rr = sin(1.5 * (q.yx * uFrequency) + 2.0 * cos(q * uFrequency));
      q += (rr - q) * 0.15;
    }

    vec3 col = vec3(0.0);
    float a = 1.0;

    if (uColorCount > 0) {
      vec2 s = q;
      vec3 sumCol = vec3(0.0);
      float cover = 0.0;
      for (int i = 0; i < MAX_COLORS; ++i) {
            if (i >= uColorCount) break;
            s -= 0.01;
            vec2 r = sin(1.5 * (s.yx * uFrequency) + 2.0 * cos(s * uFrequency));
            float m0 = length(r + sin(5.0 * r.y * uFrequency - 3.0 * t + float(i)) / 4.0);
            float kBelow = clamp(uWarpStrength, 0.0, 1.0);
            float kMix = pow(kBelow, 0.3); // strong response across 0..1
            float gain = 1.0 + max(uWarpStrength - 1.0, 0.0); // allow >1 to amplify displacement
            vec2 disp = (r - s) * kBelow;
            vec2 warped = s + disp * gain;
            float m1 = length(warped + sin(5.0 * warped.y * uFrequency - 3.0 * t + float(i)) / 4.0);
            float m = mix(m0, m1, kMix);
            float w = 1.0 - exp(-uBandWidth / exp(uBandWidth * m));
            sumCol += uColors[i] * w;
            cover = max(cover, w);
      }
      col = clamp(sumCol, 0.0, 1.0);
      a = uTransparent > 0 ? cover : 1.0;
    } else {
        vec2 s = q;
        for (int k = 0; k < 3; ++k) {
            s -= 0.01;
            vec2 r = sin(1.5 * (s.yx * uFrequency) + 2.0 * cos(s * uFrequency));
            float m0 = length(r + sin(5.0 * r.y * uFrequency - 3.0 * t + float(k)) / 4.0);
            float kBelow = clamp(uWarpStrength, 0.0, 1.0);
            float kMix = pow(kBelow, 0.3);
            float gain = 1.0 + max(uWarpStrength - 1.0, 0.0);
            vec2 disp = (r - s) * kBelow;
            vec2 warped = s + disp * gain;
            float m1 = length(warped + sin(5.0 * warped.y * uFrequency - 3.0 * t + float(k)) / 4.0);
            float m = mix(m0, m1, kMix);
            col[k] = 1.0 - exp(-uBandWidth / exp(uBandWidth * m));
        }
        a = uTransparent > 0 ? max(max(col.r, col.g), col.b) : 1.0;
    }

    col *= uIntensity;

    if (uNoise > 0.0001) {
      float n = fract(sin(dot(gl_FragCoord.xy + vec2(uTime), vec2(12.9898, 78.233))) * 43758.5453123);
      col += (n - 0.5) * uNoise;
      col = clamp(col, 0.0, 1.0);
    }

    vec3 rgb = (uTransparent > 0) ? col * a : col;
    gl_FragColor = vec4(rgb, a);
}
`;

const vert = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

// Fixed landing-page preset; shader math above is the exported React Bits effect.
export default function ColorBendsBackground() {
  const containerRef = useRef(null);
  useEffect(() => {
    const container = containerRef.current;
    const surface = container.parentElement;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('webgl2', { alpha: true, antialias: false, powerPreference: 'low-power' });
    if (!context) return; // Keep the dark CSS fallback when WebGL is unavailable.
    const renderer = new THREE.WebGLRenderer({ canvas, context, alpha: true, antialias: false });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setClearColor(0x000000, 0);
    const colors = ['273CFF', '84162D', '7CFF67'].map(hex => new THREE.Vector3(
      parseInt(hex.slice(0, 2), 16) / 255, parseInt(hex.slice(2, 4), 16) / 255, parseInt(hex.slice(4, 6), 16) / 255));
    while (colors.length < MAX_COLORS) colors.push(new THREE.Vector3());
    const material = new THREE.ShaderMaterial({
      vertexShader: vert, fragmentShader: frag, transparent: true, premultipliedAlpha: true,
      uniforms: {
        uCanvas: { value: new THREE.Vector2(1, 1) }, uTime: { value: 0 }, uSpeed: { value: 0.2 },
        uRot: { value: new THREE.Vector2(0, 1) }, uColorCount: { value: 3 }, uColors: { value: colors },
        uTransparent: { value: 1 }, uScale: { value: 1 }, uFrequency: { value: 1 },
        uWarpStrength: { value: 1 }, uPointer: { value: new THREE.Vector2() },
        uMouseInfluence: { value: 1 }, uParallax: { value: 0.5 }, uNoise: { value: 0.15 },
        uIterations: { value: 1 }, uIntensity: { value: 1.5 }, uBandWidth: { value: 6 }
      }
    });
    const geometry = new THREE.PlaneGeometry(2, 2);
    const scene = new THREE.Scene();
    scene.add(new THREE.Mesh(geometry, material));
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    container.appendChild(canvas);
    let frame = 0, last = 0, elapsed = 0;
    const pointer = new THREE.Vector2();
    const render = () => renderer.render(scene, camera);
    const loop = (now) => {
      frame = requestAnimationFrame(loop);
      if (now - last < 1000 / 30) return; // Slow ambient effect needs at most 30 fps.
      const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
      last = now;
      elapsed += dt;
      material.uniforms.uTime.value = elapsed;
      material.uniforms.uPointer.value.lerp(pointer, Math.min(1, dt * 8));
      render();
    };
    const sync = () => {
      cancelAnimationFrame(frame);
      last = 0;
      if (document.hidden) return;
      render();
      if (!motion.matches) frame = requestAnimationFrame(loop);
    };
    const resize = () => {
      const { width, height } = container.getBoundingClientRect();
      renderer.setSize(Math.max(1, width), Math.max(1, height), false);
      material.uniforms.uCanvas.value.set(Math.max(1, width), Math.max(1, height));
      if (!document.hidden) render();
    };
    const move = (event) => {
      if (motion.matches) return;
      const rect = container.getBoundingClientRect();
      pointer.set((event.clientX - rect.left) / Math.max(1, rect.width) * 2 - 1,
        -((event.clientY - rect.top) / Math.max(1, rect.height) * 2 - 1));
    };
    const leave = () => pointer.set(0, 0);
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    surface.addEventListener('pointermove', move, { passive: true });
    surface.addEventListener('pointerleave', leave);
    document.addEventListener('visibilitychange', sync);
    motion.addEventListener('change', sync);
    resize();
    sync();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      surface.removeEventListener('pointermove', move);
      surface.removeEventListener('pointerleave', leave);
      document.removeEventListener('visibilitychange', sync);
      motion.removeEventListener('change', sync);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    };
  }, []);
  return <div ref={containerRef} className="color-bends-background" aria-hidden="true" />;
}
