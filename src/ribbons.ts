import * as T from 'three';

/**
 * Camera-facing glowing ribbons, all in one instanced draw: laser beams, lightning segments, eye glows.
 *
 * Each ribbon is a quad from `start` to `end` that the vertex shader turns to face the camera (its side is
 * perpendicular to both the ribbon and the view ray), with its own width at each end, colour and opacity.
 * The fragment fades it across its width: soft (a glow) or hard-edged (a hot core). Nothing is allocated per
 * frame: callers `clear()`, `add()` what is alive, then `commit()` once (lightweight-game-objects: one pooled
 * draw per effect family, no per-frame allocation).
 */
const VERTEX = /* glsl */`
attribute vec3 aStart; attribute vec3 aEnd; attribute vec3 aShape; attribute vec4 aColor;
varying vec4 vColor; varying float vAcross; varying float vHard;
void main(){
  vec3 s=(modelViewMatrix*vec4(aStart,1.)).xyz, e=(modelViewMatrix*vec4(aEnd,1.)).xyz;
  vec3 p=mix(s,e,position.x), side=cross(e-s,p);
  float l=length(side); side=l>1e-6?side/l:vec3(1.,0.,0.);
  p+=side*position.y*mix(aShape.x,aShape.y,position.x)*.5;
  vAcross=position.y; vColor=aColor; vHard=aShape.z;
  gl_Position=projectionMatrix*vec4(p,1.);
}`;
const FRAGMENT = /* glsl */`
varying vec4 vColor; varying float vAcross; varying float vHard;
void main(){
  float k=1.-abs(vAcross);
  gl_FragColor=vec4(vColor.rgb,vColor.a*mix(k*(.35+.65*k),smoothstep(0.,.45,k),vHard));
  #include <colorspace_fragment>
}`;

export class RibbonBatch {
  readonly mesh: T.Mesh;
  count = 0;
  readonly max: number;
  private start: Float32Array; private end: Float32Array; private shape: Float32Array; private color: Float32Array;
  private attributes: T.InstancedBufferAttribute[];
  private geometry: T.InstancedBufferGeometry;
  private tint = new T.Color();

  constructor(max = 256, { renderOrder = 3, blending = T.NormalBlending as T.Blending } = {}) {
    this.max = max;
    const geometry = this.geometry = new T.InstancedBufferGeometry();
    geometry.setAttribute('position', new T.BufferAttribute(new Float32Array([0, -1, 0, 1, -1, 0, 0, 1, 0, 1, 1, 0]), 3));
    geometry.setIndex([0, 1, 2, 2, 1, 3]);
    this.start = new Float32Array(max * 3); this.end = new Float32Array(max * 3); this.shape = new Float32Array(max * 3); this.color = new Float32Array(max * 4);
    this.attributes = [new T.InstancedBufferAttribute(this.start, 3), new T.InstancedBufferAttribute(this.end, 3), new T.InstancedBufferAttribute(this.shape, 3), new T.InstancedBufferAttribute(this.color, 4)];
    ['aStart', 'aEnd', 'aShape', 'aColor'].forEach((name, i) => { this.attributes[i].setUsage(T.DynamicDrawUsage); geometry.setAttribute(name, this.attributes[i]); });
    geometry.instanceCount = 0;
    const material = new T.ShaderMaterial({ vertexShader: VERTEX, fragmentShader: FRAGMENT, transparent: true, depthWrite: false, blending, side: T.DoubleSide });
    this.mesh = new T.Mesh(geometry, material);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = renderOrder; this.mesh.castShadow = false; this.mesh.receiveShadow = false; this.mesh.name = 'ribbons';
  }

  clear() { this.count = 0; }

  /** One ribbon; `color` is a CSS colour string or a Color, `hard` 0 = soft glow … 1 = crisp core. Returns false when full. */
  add(ax: number, ay: number, az: number, bx: number, by: number, bz: number, widthA: number, widthB: number, color: string | T.Color, alpha: number, hard = 0) {
    if (this.count >= this.max || !(alpha > 0)) return false;
    const i = this.count++, c = typeof color === 'string' ? this.tint.set(color) : color;
    this.start[i * 3] = ax; this.start[i * 3 + 1] = ay; this.start[i * 3 + 2] = az;
    this.end[i * 3] = bx; this.end[i * 3 + 1] = by; this.end[i * 3 + 2] = bz;
    this.shape[i * 3] = widthA; this.shape[i * 3 + 1] = widthB; this.shape[i * 3 + 2] = hard;
    this.color[i * 4] = c.r; this.color[i * 4 + 1] = c.g; this.color[i * 4 + 2] = c.b; this.color[i * 4 + 3] = Math.min(1, alpha);
    return true;
  }

  commit() {
    this.geometry.instanceCount = this.count;
    this.mesh.visible = this.count > 0;
    if (!this.count) return;
    for (const attribute of this.attributes) { attribute.clearUpdateRanges(); attribute.addUpdateRange(0, this.count * attribute.itemSize); attribute.needsUpdate = true; }
  }

  dispose() { this.geometry.dispose(); (this.mesh.material as T.Material).dispose(); }
}
