import { Blending, ShaderMaterial } from "three";

/**
 * Soft glowing sprites with per-point size (world units) and alpha.
 * Used for neuron halos and travelling action potentials.
 */
export function glowMaterial(blending: Blending): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { uProj: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute float size;
      attribute float alpha;
      attribute vec3 tint;
      uniform float uProj;
      varying float vAlpha;
      varying vec3 vTint;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = max(2.0, size * uProj / -mv.z);
        vAlpha = alpha;
        vTint = tint;
      }`,
    fragmentShader: /* glsl */ `
      varying float vAlpha;
      varying vec3 vTint;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        if (d > 1.0) discard;
        float core = smoothstep(0.35, 0.0, d);
        float halo = pow(1.0 - d, 2.2);
        vec3 c = mix(vTint, vec3(1.0), core * 0.7);
        gl_FragColor = vec4(c, (halo * 0.75 + core * 0.5) * vAlpha);
      }`,
    transparent: true,
    depthWrite: false,
    blending,
  });
}

/** View-dependent rim light: edges of the shell glow, the face stays clear. */
export function rimMaterial(blending: Blending, opacity: number, power: number): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { uOpacity: { value: opacity }, uPower: { value: power } },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vView;
      varying vec3 vColor;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vView = normalize(-mv.xyz);
        vColor = color;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uOpacity;
      uniform float uPower;
      varying vec3 vNormal;
      varying vec3 vView;
      varying vec3 vColor;
      void main() {
        float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), uPower);
        gl_FragColor = vec4(vColor, rim * uOpacity);
      }`,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending,
  });
}
