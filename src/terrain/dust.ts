import * as THREE from 'three';

const vertexShader = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  varying float vAlpha;
  void main() {
    vAlpha = aAlpha;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * (600.0 / -mv.z);
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d) * vAlpha;
    if (a < 0.01) discard;
    gl_FragColor = vec4(uColor, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/** Soft dust puffs kicked up by the tyres. Simulated in world space. */
export class Dust {
  readonly points: THREE.Points;
  private pos: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private size: Float32Array;
  private alpha: Float32Array;
  private next = 0;
  private carry = 0;

  constructor(private count = 500) {
    this.pos = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    this.life = new Float32Array(count);
    this.maxLife = new Float32Array(count).fill(1);
    this.size = new Float32Array(count);
    this.alpha = new Float32Array(count);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    this.points = new THREE.Points(
      geo,
      new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color('#dcc8a6') } },
        vertexShader,
        fragmentShader,
        transparent: true,
        depthWrite: false,
      }),
    );
    this.points.frustumCulled = false;
    this.points.name = 'dust';
  }

  /**
   * Emit puffs at a tyre contact point. `rate` is particles per second; `airSpeed`
   * is the speed at which the world (and the air) streams past the bike, in m/s.
   */
  emit(dt: number, x: number, y: number, rate: number, airSpeed: number): void {
    this.carry += rate * dt;
    while (this.carry >= 1) {
      this.carry -= 1;
      const i = this.next;
      this.next = (this.next + 1) % this.count;
      this.pos[i * 3] = x + (Math.random() - 0.5) * 0.15;
      this.pos[i * 3 + 1] = y + 0.03;
      this.pos[i * 3 + 2] = (Math.random() - 0.5) * 0.12;
      this.vel[i * 3] = -airSpeed * (0.75 + Math.random() * 0.3);
      this.vel[i * 3 + 1] = 0.4 + Math.random() * 1.1;
      this.vel[i * 3 + 2] = (Math.random() - 0.5) * 1.4;
      this.life[i] = 0;
      this.maxLife[i] = 1.2 + Math.random() * 1.4;
    }
    this.airSpeed = airSpeed;
  }

  private airSpeed = 0;

  update(dt: number): void {
    const drag = Math.min(1, dt * 1.2);
    for (let i = 0; i < this.count; i++) {
      if (this.life[i] >= this.maxLife[i]) {
        this.alpha[i] = 0;
        continue;
      }
      this.life[i] += dt;
      const t = this.life[i] / this.maxLife[i];
      // Drag pulls each puff toward the speed of the passing air.
      this.vel[i * 3] += (-this.airSpeed - this.vel[i * 3]) * drag;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * (1 - drag) - 0.6 * dt;
      this.vel[i * 3 + 2] *= 1 - drag;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.size[i] = 0.18 + t * 0.9;
      this.alpha[i] = 0.65 * Math.sin(Math.PI * Math.min(1, t * 1.4 + 0.05)) * (1 - t);
    }
    const g = this.points.geometry;
    g.getAttribute('position').needsUpdate = true;
    g.getAttribute('aSize').needsUpdate = true;
    g.getAttribute('aAlpha').needsUpdate = true;
  }
}
