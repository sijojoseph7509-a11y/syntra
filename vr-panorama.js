/* ==========================================================================
   SYNTRA — 360° photo worlds
   · Grounded: the lower half of the photo is laid flat on the real floor
     (Quest 'local-floor'), so you stand on the ground instead of floating
     in the middle of a big photo sphere.
   · Alive: a shader adds gentle motion to the still photo
       water    → ripples that wobble the reflections (only inside a mask
                  drawn per photo, so piers and rocks stay still)
       foliage  → leaves stir in the wind (only green / autumn pixels)
       stars    → twinkle (night skies)
   ========================================================================== */
import * as THREE from 'three';

/* The photo, shaped like a real place around you instead of a flat floor + far sphere.
   Every point stays on its own line of sight from the eye (so the photo looks exactly
   right when you stand still), only its distance changes:
     · the ground near you is a true floor, `height` below the eye
     · further out the ground curves up into a wall `wall` metres away (4 m; everything you interact with is within 2.6 m), so bushes,
       trees, hills and buildings stand upright around you instead of being
       painted flat onto the ground (and their tops thrown far off into the sky)
     · the sky is a dome over that wall
   The seams are blended smoothly, so no crease is visible. */
export function groundedGeometry(radius, height, resolution = 128, wall = 4) {
  const geo = new THREE.SphereGeometry(1, resolution * 2, resolution);
  geo.scale(-1, 1, 1);
  const pos = geo.attributes.position, v = new THREE.Vector3();
  const K = 8;                                              // softness of the seams (higher = sharper)
  const smin = (a, b) => Math.pow(Math.pow(a, -K) + Math.pow(b, -K), -1 / K);
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const flat = Math.max(Math.hypot(v.x, v.z), 1e-4);       // cos of the angle above / below the horizon
    let t = wall / flat;                                     // distance to the upright wall
    if (v.y < 0) t = smin(t, height / -v.y);                 // …or the floor, whichever is nearer
    else t = smin(t, radius);                                // …or the sky dome
    v.multiplyScalar(t);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeBoundingSphere();
  geo.computeVertexNormals();
  return geo;
}

/* Real 3D from a depth map (made once by tools/make_depth.py): every point of the
   photo is placed at its true distance, so trees, hedges and hills stand where they
   really are and your two eyes see real depth. Points stay on their line of sight,
   so standing still the photo looks exactly as taken.
   depth: { w, h, data: Float32Array of metres, row 0 = top of the photo } */
export const DEPTH_NEAR = .5, DEPTH_FAR = 60;
export async function loadDepth(url) {
  const img = new Image(); img.src = url;
  await img.decode();
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const g = c.getContext('2d', { willReadFrequently: true, colorSpace: 'srgb' });
  g.drawImage(img, 0, 0);
  const px = g.getImageData(0, 0, c.width, c.height).data;
  const data = new Float32Array(c.width * c.height), a = Math.log(DEPTH_NEAR), b = Math.log(DEPTH_FAR) - a;
  for (let i = 0; i < data.length; i++) data[i] = Math.exp(a + ((px[i * 4] << 8) | px[i * 4 + 1]) / 65535 * b);   // 16 bits: red high, green low
  return { w: c.width, h: c.height, data };
}
export function depthGeometry(depth, height, keepClear = 2.9, resolution = 160) {
  const geo = new THREE.SphereGeometry(1, resolution * 2, resolution);
  geo.scale(-1, 1, 1);
  const pos = geo.attributes.position, uv = geo.attributes.uv, v = new THREE.Vector3();
  const { w, h, data } = depth;
  const at = (x, y) => data[Math.min(h - 1, Math.max(0, y)) * w + ((x % w) + w) % w];
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const x = uv.getX(i) * w - .5, y = (1 - uv.getY(i)) * h - .5;       // same place in the photo as the texture
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    let t = (at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx) * (1 - fy) + (at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx) * fy;
    // keep the bottle, name card and notes (all within ~2.6 m) in front of the scenery
    const floor = v.y < -1e-3 ? height / -v.y : Infinity;
    t = Math.max(t, Math.min(keepClear, floor));
    v.multiplyScalar(t);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeBoundingSphere();
  return geo;
}

/* water masks: polygons in image coordinates (0–1, from the top-left),
   traced from each photo. Drawn softly into a small texture. */
export function maskTexture(polys) {
  const W = 1024, H = 512, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  g.filter = 'blur(8px)'; g.fillStyle = '#fff';
  for (const poly of polys) {
    g.beginPath();
    poly.forEach(([x, y], i) => (i ? g.lineTo(x * W, y * H) : g.moveTo(x * W, y * H)));
    g.closePath(); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.minFilter = THREE.LinearFilter; t.generateMipmaps = false;
  return t;
}

const BLACK = (() => { const t = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); t.needsUpdate = true; return t; })();

export function panoramaMaterial(map, { tint = new THREE.Color(1, 1, 1), water = null, waterAmt = 0, foliage = 0, stars = 0, height = 1.65 } = {}) {
  return new THREE.ShaderMaterial({
    side: THREE.FrontSide, depthWrite: false, fog: false, toneMapped: false,
    uniforms: {
      map: { value: map }, tint: { value: tint }, time: { value: 0 },
      waterMask: { value: water || BLACK }, waterAmt: { value: water ? waterAmt : 0 },
      foliage: { value: foliage }, stars: { value: stars }, camH: { value: height },
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: /* glsl */`
      uniform sampler2D map; uniform sampler2D waterMask;
      uniform vec3 tint; uniform float time, waterAmt, foliage, stars, camH;
      varying vec2 vUv;
      const float PI = 3.14159265;

      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

      // small wind-driven waves on a flat water surface (world metres)
      vec2 waveSlope(vec2 p, float t) {
        vec2 s = vec2(0.);
        s += vec2(.8, .6) * cos(dot(p, vec2(.8, .6)) * 2.1 + t * 1.3) * .5;
        s += vec2(-.5, .9) * cos(dot(p, vec2(-.5, .9)) * 3.3 + t * 1.9) * .35;
        s += vec2(.95, -.3) * cos(dot(p, vec2(.95, -.3)) * 5.6 + t * 2.6) * .22;
        s += vec2(.2, 1.) * cos(dot(p, vec2(.2, 1.)) * 8.7 + t * 3.4) * .14;
        s += vec2(-.9, -.45) * cos(dot(p, vec2(-.9, -.45)) * 13.1 + t * 4.3) * .08;
        return s;
      }

      void main() {
        vec2 uv = vUv;
        // sample with the gradients of the undisturbed photo, so moving pixels never pick a
        // blurry mip level (that is what made dotted seams and sparkles)
        vec2 dx = dFdx(vUv), dy = dFdy(vUv);
        vec3 base = textureGrad(map, vUv, dx, dy).rgb;
        float shimmer = 0.;

        // water: find where this pixel sits on the water plane, ripple there
        if (waterAmt > 0.) {
          float m = texture2D(waterMask, vUv).r;
          float beta = max((.5 - vUv.y) * PI, .0001);          // angle below the horizon
          float d = camH / tan(beta);                           // distance to that bit of water
          float phi = vUv.x * 2. * PI;
          vec2 s = waveSlope(d * vec2(cos(phi), sin(phi)), time);
          float fade = m * smoothstep(60., 8., d) * smoothstep(0., .01, beta) * waterAmt;
          uv += vec2(s.x * .35, s.y) * (.0045 / (1. + d * .12)) * fade;
          shimmer = (s.x + s.y) * .045 * fade;
        }

        // foliage: a smooth, slow wind field nudges green / autumn pixels (leaves stirring)
        if (foliage > 0.) {
          vec3 soft = textureGrad(map, vUv, dx * 6., dy * 6.).rgb;   // judge "leafy" on a softened copy: no hard edges
          float mx = max(soft.r, max(soft.g, soft.b)), mn = min(soft.r, min(soft.g, soft.b));
          float sat = (mx - mn) / (mx + .001);
          float green = smoothstep(.0, .04, soft.g - soft.b) * smoothstep(-.04, .02, soft.g - soft.r * .8);
          float autumn = smoothstep(.3, .4, mx) * smoothstep(.0, .06, soft.r - soft.b * 1.6);
          float leafy = smoothstep(.18, .4, sat) * max(green, autumn) * smoothstep(.06, .2, mx) * smoothstep(.45, .5, vUv.y);
          float gust = .55 + .45 * sin(time * .45 + vUv.x * 12.566);
          float w = sin(time * 1.6 + vUv.x * 420. + vUv.y * 260.) * .6 + sin(time * 2.7 + vUv.y * 610. - vUv.x * 150.) * .4;
          uv += vec2(w, .35 * sin(time * 2.1 + vUv.x * 380.)) * .00018 * leafy * gust * foliage;
        }

        vec3 c = textureGrad(map, uv, dx, dy).rgb * (1. + shimmer);

        // stars twinkle: only points clearly brighter than the sky around them
        if (stars > 0.) {
          vec3 around = textureGrad(map, vUv, dx * 10., dy * 10.).rgb;
          float star = smoothstep(.08, .25, dot(c - around, vec3(.3, .59, .11))) * smoothstep(.52, .6, vUv.y);
          float tw = sin(time * (1.5 + hash(floor(vUv * 4096.)) * 2.5) + hash(floor(vUv * 2048.)) * 6.283);
          c *= 1. + tw * .45 * star * stars;
        }

        gl_FragColor = vec4(c * tint, 1.);
        #include <colorspace_fragment>
      }`,
  });
}
