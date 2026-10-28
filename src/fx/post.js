// post.js — pipeline HDR maison : bright pass, deux niveaux de flou,
// compositing ACES, étalonnage froid, vignette, grain, aberration chromatique.
// Aucun addon three.js : quatre shaders et deux caméras orthographiques.

import * as THREE from "three";

const QUAD_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const BRIGHT_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tDiffuse;
uniform float uThreshold;
uniform float uKnee;
uniform float uIntensity;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tDiffuse, vUv).rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float s = smoothstep(uThreshold, uThreshold + uKnee, l);
  gl_FragColor = vec4(c * s * uIntensity, 1.0);
}
`;

const BLUR_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tDiffuse;
uniform vec2 uDir;
varying vec2 vUv;
void main() {
  vec4 sum = vec4(0.0);
  float w[5];
  w[0] = 0.2270270270;
  w[1] = 0.1945945946;
  w[2] = 0.1216216216;
  w[3] = 0.0540540541;
  w[4] = 0.0162162162;
  sum += texture2D(tDiffuse, vUv) * w[0];
  for (int i = 1; i < 5; i++) {
    vec2 o = uDir * float(i);
    sum += texture2D(tDiffuse, vUv + o) * w[i];
    sum += texture2D(tDiffuse, vUv - o) * w[i];
  }
  gl_FragColor = sum;
}
`;

const COMPOSITE_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tScene;
uniform sampler2D tBloom1;
uniform sampler2D tBloom2;
uniform vec2 uResolution;
uniform float uTime;
uniform float uExposure;
uniform float uBloom;
uniform float uVignette;
uniform float uGrain;
uniform float uAberration;
uniform float uDawn;
uniform float uDamage;
uniform float uContrast;
uniform float uSaturation;
varying vec2 vUv;

vec3 aces(vec3 x) {
  // approximation d'ACES filmique (Narkowicz), adaptée au HDR
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}
vec3 toSRGB(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0)), vec3(0.41666)) - 0.055, step(0.0031308, c));
}
float hash(vec2 p) {
  p = fract(p * vec2(443.897, 441.423));
  p += dot(p, p.yx + 19.19);
  return fract((p.x + p.y) * p.x);
}

void main() {
  vec2 uv = vUv;
  vec2 d = uv - 0.5;
  float edge = smoothstep(0.18, 0.72, length(d));

  // aberration chromatique : uniquement vers les bords
  vec2 ab = d * uAberration * edge * 0.006;
  vec3 scene;
  scene.r = texture2D(tScene, uv + ab).r;
  scene.g = texture2D(tScene, uv).g;
  scene.b = texture2D(tScene, uv - ab).b;

  vec3 bloom = texture2D(tBloom1, uv).rgb * 0.62 + texture2D(tBloom2, uv).rgb * 1.05;
  vec3 col = scene + bloom * uBloom;

  col *= uExposure;
  col = aces(col);

  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));

  // étalonnage : ombres bleu-vert, hautes lumières dorées
  vec3 shadowTint = vec3(-0.002, 0.010, 0.018);
  vec3 highTint = vec3(0.030, 0.008, -0.026);
  col += shadowTint * (1.0 - smoothstep(0.0, 0.35, l));
  col += highTint * smoothstep(0.55, 1.0, l);

  // l'aube réchauffe l'image
  col = mix(col, col * vec3(1.12, 1.01, 0.86) + vec3(0.02, 0.01, 0.0), uDawn * 0.55);

  // saturation & contraste
  col = mix(vec3(l), col, uSaturation);
  col = (col - 0.5) * uContrast + 0.5;

  // vignette
  float vig = smoothstep(0.92, 0.22, length(d) * 1.18);
  col *= mix(1.0, vig, uVignette);

  // éclat de sang aux bords
  col = mix(col, vec3(0.30, 0.03, 0.02), uDamage * smoothstep(0.25, 0.95, length(d)) * 0.55);

  // grain argentique
  float g = hash(uv * uResolution + fract(uTime) * 91.7) - 0.5;
  col += g * uGrain;

  // très légère frange froide dans les noirs (look pellicule)
  col = max(col, vec3(0.0));
  col = toSRGB(col);
  gl_FragColor = vec4(col, 1.0);
}
`;

export function createPost(renderer) {
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial());
  quad.frustumCulled = false;
  scene.add(quad);

  const sceneRT = new THREE.WebGLRenderTarget(2, 2, {
    type: THREE.HalfFloatType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: true,
    stencilBuffer: false,
    samples: 4,
  });
  sceneRT.texture.colorSpace = THREE.LinearSRGBColorSpace;

  const makeRT = () => {
    const rt = new THREE.WebGLRenderTarget(2, 2, {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
    });
    rt.texture.colorSpace = THREE.LinearSRGBColorSpace;
    return rt;
  };
  const b1 = makeRT(), b2 = makeRT(), b3 = makeRT(), b4 = makeRT();

  const brightMat = new THREE.ShaderMaterial({
    uniforms: {
      tDiffuse: { value: null },
      uThreshold: { value: 0.72 },
      uKnee: { value: 0.45 },
      uIntensity: { value: 1.0 },
    },
    vertexShader: QUAD_VERT,
    fragmentShader: BRIGHT_FRAG,
    depthTest: false,
    depthWrite: false,
  });

  const blurMat = new THREE.ShaderMaterial({
    uniforms: { tDiffuse: { value: null }, uDir: { value: new THREE.Vector2() } },
    vertexShader: QUAD_VERT,
    fragmentShader: BLUR_FRAG,
    depthTest: false,
    depthWrite: false,
  });

  const compositeMat = new THREE.ShaderMaterial({
    uniforms: {
      tScene: { value: null },
      tBloom1: { value: null },
      tBloom2: { value: null },
      uResolution: { value: new THREE.Vector2(1600, 900) },
      uTime: { value: 0 },
      uExposure: { value: 1.0 },
      uBloom: { value: 0.62 },
      uVignette: { value: 0.42 },
      uGrain: { value: 0.011 },
      uAberration: { value: 0.35 },
      uDawn: { value: 0.0 },
      uDamage: { value: 0.0 },
      uContrast: { value: 1.045 },
      uSaturation: { value: 1.06 },
    },
    vertexShader: QUAD_VERT,
    fragmentShader: COMPOSITE_FRAG,
    depthTest: false,
    depthWrite: false,
  });

  let width = 2, height = 2, pixelRatio = 1;
  let quality = "high";
  const stats = { calls: 0, triangles: 0, programs: 0, viewCalls: 0, viewTriangles: 0 };

  function setSize(w, h, pr = 1) {
    width = w;
    height = h;
    pixelRatio = pr;
    const RW = Math.max(2, Math.floor(w * pr));
    const RH = Math.max(2, Math.floor(h * pr));
    sceneRT.setSize(RW, RH);
    const hw = Math.max(2, Math.floor(RW / 2));
    const hh = Math.max(2, Math.floor(RH / 2));
    b1.setSize(hw, hh);
    b2.setSize(hw, hh);
    b3.setSize(Math.max(2, Math.floor(hw / 2)), Math.max(2, Math.floor(hh / 2)));
    b4.setSize(Math.max(2, Math.floor(hw / 2)), Math.max(2, Math.floor(hh / 2)));
    compositeMat.uniforms.uResolution.value.set(RW, RH);
  }

  function setQuality(q) {
    quality = q;
    sceneRT.samples = q === "high" ? 4 : q === "medium" ? 2 : 0;
    sceneRT.dispose();
  }

  function pass(material, target) {
    quad.material = material;
    renderer.setRenderTarget(target ?? null);
    renderer.render(scene, camera);
  }

  function render(gameScene, gameCamera, {
    time = 0, exposure = 1, bloom = 0.62, dawn = 0, damage = 0, vignette = 0.55, bloomOn = true,
    overlay = null,
  } = {}) {
    renderer.setRenderTarget(sceneRT);
    renderer.clear();
    renderer.render(gameScene, gameCamera);
    stats.calls = renderer.info.render.calls;
    stats.triangles = renderer.info.render.triangles;
    stats.programs = renderer.info.programs ? renderer.info.programs.length : 0;
    if (overlay) {
      renderer.autoClear = false;
      renderer.clearDepth();
      renderer.render(overlay.scene, overlay.camera);
      renderer.autoClear = true;
      stats.viewCalls = renderer.info.render.calls;
      stats.viewTriangles = renderer.info.render.triangles;
    }

    const RW = sceneRT.width, RH = sceneRT.height;

    if (bloomOn) {
      brightMat.uniforms.tDiffuse.value = sceneRT.texture;
      pass(brightMat, b1);

      blurMat.uniforms.tDiffuse.value = b1.texture;
      blurMat.uniforms.uDir.value.set(1.4 / (RW / 2), 0);
      pass(blurMat, b2);

      blurMat.uniforms.tDiffuse.value = b2.texture;
      blurMat.uniforms.uDir.value.set(0, 1.4 / (RH / 2));
      pass(blurMat, b1);

      // second niveau, flou large
      brightMat.uniforms.tDiffuse.value = b1.texture;
      pass(brightMat, b3);
      blurMat.uniforms.tDiffuse.value = b3.texture;
      blurMat.uniforms.uDir.value.set(2.2 / (RW / 4), 0);
      pass(blurMat, b4);
      blurMat.uniforms.tDiffuse.value = b4.texture;
      blurMat.uniforms.uDir.value.set(0, 2.2 / (RH / 4));
      pass(blurMat, b3);
    }

    compositeMat.uniforms.tScene.value = sceneRT.texture;
    compositeMat.uniforms.tBloom1.value = b1.texture;
    compositeMat.uniforms.tBloom2.value = b3.texture;
    compositeMat.uniforms.uTime.value = time;
    compositeMat.uniforms.uExposure.value = exposure;
    compositeMat.uniforms.uBloom.value = bloomOn ? bloom : 0;
    compositeMat.uniforms.uDawn.value = dawn;
    compositeMat.uniforms.uDamage.value = damage;
    compositeMat.uniforms.uVignette.value = vignette;
    pass(compositeMat, null);
    renderer.setRenderTarget(null);
  }

  return {
    render, setSize, setQuality, sceneRT, stats,
    uniforms: compositeMat.uniforms,
    get quality() { return quality; },
    get size() { return { width, height, pixelRatio }; },
  };
}
