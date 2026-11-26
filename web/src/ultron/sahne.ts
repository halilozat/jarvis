// Ultron Paketi · Savaş Modu WebGL sahnesi (Three.js). render(durum) deterministiktir: bütün rastgelelik sabit tohumlu,
// zamana bağlı titreşimler karma(floor(t·fps)) ile. Jarvis: mavi, ağ gibi bağlı, simetrik parçacık küresi. Ultron: turuncu,
// sivri, titreşen, düzensiz küme; kıvılcım ve ark'lar. Özgün, soyut tasarım (film görüntüsü/karakteri kullanılmaz).
// Tuval opak siyah çizilir ve CSS'te mix-blend-mode: screen ile uygulamanın üstüne ışık olarak biner (bloom bozulmaz).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { LAND } from '../data/world';
import { karma, tohumlu, yumusak, type Durum } from './zaman';

export interface SahneAyari {
  renk: { jarvis: string; jarvisAcik: string; ultron: string; ultronKoyu: string; ultronCekirdek: string; arka: string };
  parcacik: { jarvis: number; ultron: number; tunelKare: number; kivilcim: number };
  bloom: { guc: number; yaricap: number; esik: number };
  tohum: number;
}

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

// ---------------------------------------------------------------- Parçacık gölgelendiricisi

const NOKTA_VS = /* glsl */ `
attribute float aTohum; attribute vec3 aHedef; attribute vec3 aKure;
uniform float uZaman, uTitre, uDagil, uKure, uBoyut, uOlcek, uDon, uKureDon, uNabiz;
varying float vT; varying float vK; varying float vOn;
vec3 donY(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(c*p.x + s*p.z, p.y, -s*p.x + c*p.z); }
void main() {
  float ph = aTohum * 6.2831853;
  vec3 p = donY(position, uDon) * (1.0 + uNabiz * 0.06 * sin(uZaman * 9.0 + ph * 4.0));
  p += uTitre * vec3(sin(uZaman*23.0 + ph*3.1), sin(uZaman*19.0 + ph*1.7), sin(uZaman*21.0 + ph*2.3));
  float d = clamp(uDagil * 1.5 - aTohum * 0.5, 0.0, 1.0); d = d*d*(3.0 - 2.0*d);
  vec3 orta = mix(p, aHedef, 0.5) + vec3(0.0, 1.1*(aTohum - 0.5), 0.9*sin(ph));
  p = mix(mix(p, orta, d), mix(orta, aHedef, d), d);
  float k = clamp(uKure * 1.35 - aTohum * 0.35, 0.0, 1.0); k = k*k*(3.0 - 2.0*k);
  p = mix(p, donY(aKure, uKureDon), k);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uBoyut * (0.55 + aTohum) * uOlcek / max(0.1, -mv.z);
  vT = aTohum; vK = k;
  // Arka yüz soluk (ön ve arka üst üste binip beyaza doymasın)
  vOn = 0.18 + 0.82 * smoothstep(-0.6, 0.8, normalize(p).z);
}`;
const NOKTA_FS = /* glsl */ `
uniform vec3 uRenk, uRenk2, uRenkK; uniform float uOpak;
varying float vT; varying float vK; varying float vOn;
void main() {
  float r = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, r);
  vec3 c = mix(mix(uRenk, uRenk2, vT * vT), uRenkK, vK);
  gl_FragColor = vec4(c * a * uOpak * vOn, 1.0);
}`;
/** Çizgiler: noktalarla aynı dönüş/dağılma; Ultron'da segment başına tekrarlanabilir titreme */
const CIZGI_VS = /* glsl */ `
attribute float aTohum; attribute vec3 aHedef;
uniform float uZaman, uTitre, uDagil, uDon;
varying float vT;
vec3 donY(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(c*p.x + s*p.z, p.y, -s*p.x + c*p.z); }
void main() {
  float ph = aTohum * 6.2831853;
  vec3 p = donY(position, uDon);
  p += uTitre * vec3(sin(uZaman*23.0 + ph*3.1), sin(uZaman*19.0 + ph*1.7), sin(uZaman*21.0 + ph*2.3));
  float d = clamp(uDagil * 1.5 - aTohum * 0.5, 0.0, 1.0); d = d*d*(3.0 - 2.0*d);
  p = mix(p, aHedef, d);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  vT = aTohum;
}`;
const CIZGI_FS = /* glsl */ `
uniform vec3 uRenk; uniform float uOpak, uZaman, uTitresim;
varying float vT;
float h(vec2 v) { return fract(sin(dot(v, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  float yan = mix(1.0, step(0.45, h(vec2(floor(vT * 997.0), floor(uZaman * 18.0)))), uTitresim);
  gl_FragColor = vec4(uRenk * uOpak * yan, 1.0);
}`;

function noktaMalzeme(r1: string, r2: string, boyut: number) {
  return new THREE.ShaderMaterial({
    vertexShader: NOKTA_VS, fragmentShader: NOKTA_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: {
      uZaman: { value: 0 }, uTitre: { value: 0 }, uDagil: { value: 0 }, uKure: { value: 0 }, uBoyut: { value: boyut }, uOlcek: { value: 1 },
      uDon: { value: 0 }, uKureDon: { value: 0 }, uNabiz: { value: 0 }, uOpak: { value: 1 },
      uRenk: { value: new THREE.Color(r1) }, uRenk2: { value: new THREE.Color(r2) }, uRenkK: { value: new THREE.Color(r1) },
    },
  });
}
function cizgiMalzeme(renk: string) {
  return new THREE.ShaderMaterial({
    vertexShader: CIZGI_VS, fragmentShader: CIZGI_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uZaman: { value: 0 }, uTitre: { value: 0 }, uDagil: { value: 0 }, uDon: { value: 0 }, uOpak: { value: 1 }, uTitresim: { value: 0 }, uRenk: { value: new THREE.Color(renk) } },
  });
}

/** Yumuşak ışıma dokusu (sprite'lar için) */
function isima(ic: string, dis: string): THREE.Texture {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, ic); gr.addColorStop(0.25, dis); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function sprite(tex: THREE.Texture, olcek: number) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  s.scale.setScalar(olcek);
  return s;
}

// ---------------------------------------------------------------- Tünel kareleri (Jarvis'in kendi modüllerinden)

const KARE_TURLERI = ['haber', 'gezegen', 'sms', 'toplanti', 'ev'] as const;
function kareDokusu(tur: (typeof KARE_TURLERI)[number], i: number): THREE.Texture {
  const c = document.createElement('canvas'); c.width = 512; c.height = 320;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(0, 0, 512, 320);
  g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 3; g.strokeRect(6, 6, 500, 308);
  g.fillStyle = '#fff'; g.font = '600 26px ui-monospace, Menlo, monospace';
  const yaz = (s: string, x: number, y: number, boy = 26, a = 1) => { g.globalAlpha = a; g.font = `600 ${boy}px ui-monospace, Menlo, monospace`; g.fillText(s, x, y); g.globalAlpha = 1; };
  const r = tohumlu(1000 + i);
  if (tur === 'haber') {
    yaz('HABER · SON DAKİKA', 24, 48, 22, 0.8);
    const b = [['Piyasalar güne', 'yükselişle başladı'], ['Merkez Bankası', 'faiz kararını açıkladı'], ['Fırtına uyarısı:', 'kıyılarda dikkat'], ['Yeni sezon', 'takvimi belli oldu']][i % 4];
    yaz(b[0], 24, 140, 40); yaz(b[1], 24, 190, 40);
    for (let k = 0; k < 3; k++) { g.globalAlpha = 0.4; g.fillRect(24, 230 + k * 22, 300 + r() * 160, 8); }
  } else if (tur === 'gezegen') {
    yaz('UZAY LAB · YÖRÜNGE', 24, 48, 22, 0.8);
    g.globalAlpha = 0.5; g.beginPath(); g.ellipse(256, 190, 190, 70, -0.2, 0, Math.PI * 2); g.stroke();
    g.globalAlpha = 1; g.beginPath(); g.arc(256, 190, 46, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(256 + Math.cos(i) * 180, 190 + Math.sin(i) * 60, 14, 0, Math.PI * 2); g.fill();
  } else if (tur === 'sms') {
    yaz('BEKÇİ · ŞÜPHELİ MESAJ', 24, 48, 22, 0.8);
    g.globalAlpha = 0.9; g.strokeRect(24, 80, 464, 150);
    yaz('Kargonuz teslim edilemedi.', 44, 130, 26); yaz('Ödeme: bit.ly/xxxxx', 44, 175, 26, 0.85);
    yaz('⚠ RİSK 92/100', 24, 280, 30);
  } else if (tur === 'toplanti') {
    yaz('TOPLANTI ODASI', 24, 48, 22, 0.8);
    yaz('JARVIS ▸ Bence kabul edin', 24, 120, 26); yaz('        efendim.', 24, 155, 26, 0.8);
    yaz('FRIDAY ▸ Patron, maaş tek', 24, 215, 26); yaz('        ölçüt değil.', 24, 250, 26, 0.8);
  } else {
    yaz('AKILLI EV', 24, 48, 22, 0.8);
    const c2 = [['SALON IŞIK', 'AÇIK'], ['TERMOSTAT', '22°'], ['KAPI', 'KİLİTLİ'], ['PERDE', '%40']];
    c2.forEach(([a, b], k) => { yaz(a, 24, 110 + k * 50, 28); yaz(b, 360, 110 + k * 50, 28); });
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

// ---------------------------------------------------------------- Sahne

export class SavasSahnesi {
  readonly renderer: THREE.WebGLRenderer;
  private sahne = new THREE.Scene();
  private kamera = new THREE.PerspectiveCamera(50, 16 / 9, 0.05, 200);
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private dikey = false;
  private J = V(-1.9, 0, 0); private U = V(1.9, 0, 0); private P0 = V(1.25, 0.35, 0);
  private kz = 6.2;
  private dusukKalite = false;

  private jNokta!: THREE.Points; private jCizgi!: THREE.LineSegments;
  private uNokta!: THREE.Points; private uCizgi!: THREE.LineSegments;
  private uGrup = new THREE.Group(); private jGrup = new THREE.Group();
  private uCekirdek!: THREE.Sprite; private nokta!: THREE.Sprite;
  private reaktor = new THREE.Group(); private reaktorIsik!: THREE.Sprite; private halkalar: THREE.LineLoop[] = [];
  private izgara!: THREE.LineSegments; private tarama!: THREE.Mesh;
  private tunel = new THREE.Group(); private kareler: { m: THREE.Mesh; tur: string; sira: number }[] = [];
  private cizgiler!: THREE.LineSegments; private cizgiTohum: Float32Array = new Float32Array();
  private kalkan = new THREE.Group(); private kalkanCizgi!: THREE.LineSegments; private kalkanDolgu!: THREE.InstancedMesh; private hucreSira: number[] = [];
  private hucreMerkez: THREE.Vector3[] = [];
  private ark!: THREE.LineSegments; private arkPoz!: Float32Array; private arkRenk!: Float32Array;
  private kureKabuk!: THREE.Mesh;
  private UZUN = 70;

  private ayar: SahneAyari;
  constructor(canvas: HTMLCanvasElement, ayar: SahneAyari, o: { kayit?: boolean } = {}) {
    this.ayar = ayar;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: !!o.kayit, powerPreference: 'high-performance' });
    this.renderer.setClearColor(new THREE.Color('#000000'), 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.sahne, this.kamera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), ayar.bloom.guc, ayar.bloom.yaricap, ayar.bloom.esik);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.kur();
  }

  // ---------------------------------------------------------------- Kurulum

  private kur() {
    const a = this.ayar, r = tohumlu(a.tohum);
    // Jarvis: Fibonacci küresi + en yakın komşulara ağ çizgileri
    const nJ = a.parcacik.jarvis;
    const jp = new Float32Array(nJ * 3), jt = new Float32Array(nJ), jh = new Float32Array(nJ * 3), jk = new Float32Array(nJ * 3);
    const altin = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < nJ; i++) {
      const y = 1 - (i / (nJ - 1)) * 2, rr = Math.sqrt(1 - y * y), th = altin * i;
      const rad = 1 + (r() - 0.5) * 0.04;
      jp.set([Math.cos(th) * rr * rad, y * rad, Math.sin(th) * rr * rad], i * 3);
      jt[i] = r();
    }
    const jGeo = new THREE.BufferGeometry();
    jGeo.setAttribute('position', new THREE.BufferAttribute(jp, 3));
    jGeo.setAttribute('aTohum', new THREE.BufferAttribute(jt, 1));
    jGeo.setAttribute('aHedef', new THREE.BufferAttribute(jh, 3));
    jGeo.setAttribute('aKure', new THREE.BufferAttribute(jk, 3));
    this.jNokta = new THREE.Points(jGeo, noktaMalzeme(a.renk.jarvis, a.renk.jarvisAcik, 10));
    // Ağ: her noktayı sıradaki 2 Fibonacci komşusuna (spiralde yakın) bağla
    const seg: number[] = [], segT: number[] = [], segH: number[] = [];
    for (let i = 0; i < nJ; i++) for (const d of [13, 21, 34]) {
      const j = i + d; if (j >= nJ || r() > 0.4) continue;
      seg.push(jp[i * 3], jp[i * 3 + 1], jp[i * 3 + 2], jp[j * 3], jp[j * 3 + 1], jp[j * 3 + 2]); segT.push(jt[i], jt[i]); segH.push(0, 0, 0, 0, 0, 0);
    }
    const jcGeo = new THREE.BufferGeometry();
    jcGeo.setAttribute('position', new THREE.Float32BufferAttribute(seg, 3));
    jcGeo.setAttribute('aTohum', new THREE.Float32BufferAttribute(segT, 1));
    jcGeo.setAttribute('aHedef', new THREE.Float32BufferAttribute(segH, 3));
    this.jCizgi = new THREE.LineSegments(jcGeo, cizgiMalzeme(a.renk.jarvis));
    this.jGrup.add(this.jNokta, this.jCizgi);

    // Ultron: sivri, düzensiz küme (çekirdek kabuğu + dikenler)
    const nU = a.parcacik.ultron;
    const up = new Float32Array(nU * 3), ut = new Float32Array(nU), uh = new Float32Array(nU * 3), uk = new Float32Array(nU * 3);
    const dikenler = Array.from({ length: 16 }, () => V(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1).normalize());
    for (let i = 0; i < nU; i++) {
      let d: THREE.Vector3, rad: number;
      if (r() < 0.38) { const k = dikenler[Math.floor(r() * dikenler.length)]; d = k.clone().add(V(r() - 0.5, r() - 0.5, r() - 0.5).multiplyScalar(0.22)).normalize(); rad = 0.45 + Math.pow(r(), 1.6) * 1.15; }
      else { d = V(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1).normalize(); rad = 0.35 + Math.pow(r(), 0.6) * 0.55; }
      up.set([d.x * rad, d.y * rad, d.z * rad], i * 3);
      ut[i] = r();
    }
    // Final A: dünya küresi hedefleri (kıyı çizgilerinden + seyrek yüzey)
    const kiyi: number[] = [];
    for (const s of LAND) { const p = s.split(',').map(Number); for (let i = 0; i < p.length; i += 2) kiyi.push(p[i], p[i + 1]); }
    const KR = 1.45;
    for (let i = 0; i < nU; i++) {
      let lon: number, lat: number;
      if (i % 5 < 4 && kiyi.length) { const k = Math.floor(r() * (kiyi.length / 2)); lon = kiyi[k * 2] + (r() - 0.5) * 0.6; lat = kiyi[k * 2 + 1] + (r() - 0.5) * 0.6; }
      else { lon = r() * 360 - 180; lat = Math.asin(r() * 2 - 1) * 180 / Math.PI; }
      const la = lat * Math.PI / 180, lo = lon * Math.PI / 180;
      uk.set([Math.cos(la) * Math.sin(lo) * KR, Math.sin(la) * KR, Math.cos(la) * Math.cos(lo) * KR], i * 3);
    }
    const uGeo = new THREE.BufferGeometry();
    uGeo.setAttribute('position', new THREE.BufferAttribute(up, 3));
    uGeo.setAttribute('aTohum', new THREE.BufferAttribute(ut, 1));
    uGeo.setAttribute('aHedef', new THREE.BufferAttribute(uh, 3));
    uGeo.setAttribute('aKure', new THREE.BufferAttribute(uk, 3));
    const um = noktaMalzeme(a.renk.ultron, a.renk.ultronCekirdek, 30);
    um.uniforms.uRenkK.value = new THREE.Color(a.renk.ultron);
    this.uNokta = new THREE.Points(uGeo, um);
    // Lif çizgileri: rastgele çiftler (yakın olanlar)
    const us: number[] = [], usT: number[] = [], usH: number[] = [];
    for (let k = 0; k < 1400; k++) {
      const i = Math.floor(r() * nU); let j = Math.floor(r() * nU);
      for (let deneme = 0; deneme < 6; deneme++) { const dx = up[i * 3] - up[j * 3], dy = up[i * 3 + 1] - up[j * 3 + 1], dz = up[i * 3 + 2] - up[j * 3 + 2]; if (dx * dx + dy * dy + dz * dz < 0.25) break; j = Math.floor(r() * nU); }
      us.push(up[i * 3], up[i * 3 + 1], up[i * 3 + 2], up[j * 3], up[j * 3 + 1], up[j * 3 + 2]); const tt = r(); usT.push(tt, tt); usH.push(0, 0, 0, 0, 0, 0);
    }
    const ucGeo = new THREE.BufferGeometry();
    ucGeo.setAttribute('position', new THREE.Float32BufferAttribute(us, 3));
    ucGeo.setAttribute('aTohum', new THREE.Float32BufferAttribute(usT, 1));
    ucGeo.setAttribute('aHedef', new THREE.Float32BufferAttribute(usH, 3));
    this.uCizgi = new THREE.LineSegments(ucGeo, cizgiMalzeme(a.renk.ultronKoyu));
    (this.uCizgi.material as THREE.ShaderMaterial).uniforms.uTitresim.value = 1;
    this.uCekirdek = sprite(isima('rgba(255,236,190,1)', 'rgba(255,120,30,0.55)'), 1.6);
    this.uGrup.add(this.uNokta, this.uCizgi, this.uCekirdek);
    // Final A kabuğu: koyu küre + turuncu kenar ışıması
    this.kureKabuk = new THREE.Mesh(new THREE.SphereGeometry(KR * 0.985, 64, 48), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uOpak: { value: 0 }, uRenk: { value: new THREE.Color(a.renk.ultron) } },
      vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vN = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }',
      fragmentShader: 'uniform float uOpak; uniform vec3 uRenk; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - max(0.0, dot(vN, vV)), 2.6); gl_FragColor = vec4(uRenk * f * uOpak, 1.0); }',
    }));
    this.uGrup.add(this.kureKabuk);
    this.sahne.add(this.jGrup, this.uGrup);

    // Turuncu nokta (vuruş 1–3)
    this.nokta = sprite(isima('rgba(255,240,200,1)', 'rgba(255,106,26,0.7)'), 0.9);
    this.sahne.add(this.nokta);
    // Reaktör (Jarvis'in sönük ışığı → geri dönüş)
    this.reaktorIsik = sprite(isima('rgba(220,248,255,1)', 'rgba(61,180,255,0.6)'), 2.2);
    this.reaktor.add(this.reaktorIsik);
    for (const [ry, seg] of [[0.55, 64], [0.78, 96], [1.05, 128]] as const) {
      const pts = Array.from({ length: seg }, (_, i) => { const t = (i / seg) * Math.PI * 2; return V(Math.cos(t) * ry, Math.sin(t) * ry, 0); });
      const l = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: a.renk.jarvis, transparent: true, blending: THREE.AdditiveBlending }));
      this.halkalar.push(l); this.reaktor.add(l);
    }
    this.sahne.add(this.reaktor);
    // Veri ızgarası
    const ig: number[] = [];
    for (let i = -20; i <= 20; i++) { ig.push(i * 0.5, -6, 0, i * 0.5, 6, 0); }
    for (let j = -12; j <= 12; j++) { ig.push(-10, j * 0.5, 0, 10, j * 0.5, 0); }
    this.izgara = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(ig, 3)), new THREE.LineBasicMaterial({ color: '#ff8a3a', transparent: true, blending: THREE.AdditiveBlending }));
    this.izgara.position.z = -3; this.izgara.rotation.x = -0.55;
    this.sahne.add(this.izgara);
    // Tarama ışını (reaktörden noktaya ince şerit)
    this.tarama = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.05), new THREE.MeshBasicMaterial({ color: a.renk.jarvisAcik, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.sahne.add(this.tarama);

    // Veri tüneli
    const dokular = Object.fromEntries(KARE_TURLERI.map(t => [t, [0, 1, 2, 3].map(i => kareDokusu(t, i))]));
    for (let i = 0; i < a.parcacik.tunelKare; i++) {
      const tur = KARE_TURLERI[i % KARE_TURLERI.length];
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.0), new THREE.MeshBasicMaterial({ map: dokular[tur][Math.floor(r() * 4)], transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, color: a.renk.jarvis }));
      const aci = i * 2.399 + r() * 0.3, z = -2 - (i / a.parcacik.tunelKare) * (this.UZUN - 8);
      const yr = 2.3 + r() * 0.6;
      m.position.set(Math.cos(aci) * yr, Math.sin(aci) * yr, z);
      m.lookAt(V(0, 0, z));
      this.kareler.push({ m, tur, sira: r() });
      this.tunel.add(m);
    }
    // Hız çizgileri
    const nc = 700;
    this.cizgiTohum = new Float32Array(nc * 3);
    for (let i = 0; i < nc; i++) { const aci = r() * Math.PI * 2, rr = 0.6 + r() * 3.5; this.cizgiTohum.set([Math.cos(aci) * rr, Math.sin(aci) * rr, r()], i * 3); }
    const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nc * 6), 3));
    this.cizgiler = new THREE.LineSegments(cg, new THREE.LineBasicMaterial({ color: '#7fd8ff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.tunel.add(this.cizgiler);
    this.sahne.add(this.tunel);

    // Altıgen kalkan (eksenel koordinatlar, yarıçap 4 → 61 hücre)
    const hb = 0.17, hk: number[] = [];
    const hucreler: [number, number][] = [];
    for (let q = -4; q <= 4; q++) for (let s = Math.max(-4, -q - 4); s <= Math.min(4, -q + 4); s++) hucreler.push([q, s]);
    const dolguGeo = new THREE.CircleGeometry(hb * 0.92, 6);
    this.kalkanDolgu = new THREE.InstancedMesh(dolguGeo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }), hucreler.length);
    const mat = new THREE.Matrix4();
    hucreler.forEach(([q, s], i) => {
      const x = hb * Math.sqrt(3) * (q + s / 2), y = hb * 1.5 * s, z = -(x * x + y * y) * 0.18;
      const c = V(x, y, z); this.hucreMerkez.push(c);
      for (let k = 0; k < 6; k++) {
        const a1 = Math.PI / 6 + (k * Math.PI) / 3, a2 = Math.PI / 6 + ((k + 1) * Math.PI) / 3;
        hk.push(x + Math.cos(a1) * hb, y + Math.sin(a1) * hb, z, x + Math.cos(a2) * hb, y + Math.sin(a2) * hb, z);
      }
      mat.makeRotationZ(Math.PI / 6).setPosition(c); this.kalkanDolgu.setMatrixAt(i, mat);
      this.kalkanDolgu.setColorAt(i, new THREE.Color(a.renk.jarvis));
      this.hucreSira.push(r());
    });
    const kg = new THREE.BufferGeometry();
    kg.setAttribute('position', new THREE.Float32BufferAttribute(hk, 3));
    kg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(hk.length), 3));
    this.kalkanCizgi = new THREE.LineSegments(kg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.kalkan.add(this.kalkanCizgi, this.kalkanDolgu);
    this.sahne.add(this.kalkan);

    // Ark'lar: 9 şimşek × 32 parça
    const nA = 9 * 32 * 2;
    this.arkPoz = new Float32Array(nA * 3); this.arkRenk = new Float32Array(nA * 3);
    const ag = new THREE.BufferGeometry();
    ag.setAttribute('position', new THREE.BufferAttribute(this.arkPoz, 3));
    ag.setAttribute('color', new THREE.BufferAttribute(this.arkRenk, 3));
    this.ark = new THREE.LineSegments(ag, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.ark.frustumCulled = false;
    this.sahne.add(this.ark);
  }

  /** Jarvis parçacıklarının dağılma hedefi: Ultron kümesinin içi (Ultron o sırada merkeze gelir) */
  private hedefleriKur() {
    const r = tohumlu(this.ayar.tohum + 5);
    const h = this.jNokta.geometry.getAttribute('aHedef') as THREE.BufferAttribute;
    for (let i = 0; i < h.count; i++) {
      const d = V(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1).normalize().multiplyScalar(0.2 + r() * 0.7);
      h.setXYZ(i, -this.J.x + d.x, -this.J.y + d.y, d.z);
    }
    h.needsUpdate = true;
    const hc = this.jCizgi.geometry.getAttribute('aHedef') as THREE.BufferAttribute;
    for (let i = 0; i < hc.count; i++) hc.setXYZ(i, -this.J.x, -this.J.y, 0);
    hc.needsUpdate = true;
  }

  boyut(w: number, h: number, dpr = Math.min(2, window.devicePixelRatio || 1)) {
    this.dikey = h > w * 1.05;
    // 9:16: Jarvis üstte, Ultron altta (alt ~350 px ve sağ ~120 px güvenli alanın dışında); 16:9: soldan sağa
    if (this.dikey) { this.J.set(0, 1.95, 0); this.U.set(0, -0.95, 0); this.P0.set(0.45, -0.6, 0); this.kz = 8.6; }
    else { this.J.set(-1.95, 0.05, 0); this.U.set(1.95, 0.05, 0); this.P0.set(1.25, 0.35, 0); this.kz = 6.2; }
    this.hedefleriKur();
    this.renderer.setPixelRatio(this.dusukKalite ? 1 : dpr);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(this.dusukKalite ? 1 : dpr);
    this.composer.setSize(w, h);
    this.kamera.aspect = w / h;
    this.kamera.updateProjectionMatrix();
    const olcek = h * (this.dusukKalite ? 1 : dpr) / 1080;
    for (const p of [this.jNokta, this.uNokta]) (p.material as THREE.ShaderMaterial).uniforms.uOlcek.value = olcek;
  }

  /** Otomatik kalite düşürme: piksel oranı 1, bloom kapalı */
  kalite(dusuk: boolean) {
    if (dusuk === this.dusukKalite) return;
    this.dusukKalite = dusuk;
    this.bloom.enabled = !dusuk;
    const c = this.renderer.domElement;
    this.boyut(c.clientWidth || c.width, c.clientHeight || c.height);
  }

  // ---------------------------------------------------------------- Kare

  render(d: Durum) {
    const t = d.t;
    const a = this.ayar;
    const jm = this.jNokta.material as THREE.ShaderMaterial, um = this.uNokta.material as THREE.ShaderMaterial;
    const jcm = this.jCizgi.material as THREE.ShaderMaterial, ucm = this.uCizgi.material as THREE.ShaderMaterial;
    const merkez = V(0, this.dikey ? 0.2 : 0, 0);

    // Kamera (tünelde ileri uçar; çatışmada sarsılır)
    let kx = 0, ky = 0, kz = this.kz;
    if (d.tunel >= 0) {
      const k = d.tunel < 1 ? yumusak(0, 1, d.tunel) : 1;
      kz = 4 - k * (this.UZUN - 12);
      kx = Math.sin(t * 0.9) * 0.25; ky = Math.cos(t * 0.7) * 0.2;
    }
    const s = d.sarsinti * 0.06;
    kx += (karma(Math.floor(t * 30), 1) - 0.5) * s; ky += (karma(Math.floor(t * 30), 2) - 0.5) * s;
    this.kamera.position.set(kx, ky, kz);
    this.kamera.lookAt(kx * 0.3, ky * 0.3, kz - 10);
    if (d.tunel < 0) this.kamera.lookAt(0, 0, 0);

    // Tünel
    this.tunel.visible = d.tunel >= 0;
    if (this.tunel.visible) {
      // Tünel çöker: vuruş 4'ün ilk 0,8 sn'sinde kareler dışa savrulup söner
      const cokus = d.vurus >= 4 ? Math.min(1, d.vurusT / 0.8) : 0;
      this.tunel.scale.set(1 + cokus * 2.5, 1 + cokus * 2.5, 1);
      for (const k of this.kareler) {
        const mm = k.m.material as THREE.MeshBasicMaterial;
        const tur = d.dokunulan[k.tur] ?? 0;
        const kk = Math.max(0, Math.min(1, tur * 1.6 - k.sira * 0.6));
        mm.color.set(a.renk.jarvis).lerp(new THREE.Color(a.renk.ultron), kk);
        const titre = kk > 0 && kk < 1 ? (karma(Math.floor(t * 24), Math.floor(k.sira * 1000)) > 0.5 ? 1.6 : 0.5) : 1;
        mm.opacity = (0.35 + 0.65 * kk) * titre * (1 - cokus);
      }
      // Hız çizgileri: kameraya doğru akar
      const pa = this.cizgiler.geometry.getAttribute('position') as THREE.BufferAttribute;
      const hiz = 18 + 30 * Math.sin(Math.min(1, d.tunel) * Math.PI);
      for (let i = 0; i < pa.count / 2; i++) {
        const x = this.cizgiTohum[i * 3], y = this.cizgiTohum[i * 3 + 1], u = this.cizgiTohum[i * 3 + 2];
        const z = kz - 2 - (((u * 60 - t * hiz) % 60) + 60) % 60;
        pa.setXYZ(i * 2, x, y, z); pa.setXYZ(i * 2 + 1, x, y, z - hiz * 0.05);
      }
      pa.needsUpdate = true;
      (this.cizgiler.material as THREE.LineBasicMaterial).opacity = 0.5;
    }

    // Turuncu nokta → tünelde önden giden ışık
    const kp = d.kureler;
    this.nokta.visible = d.nokta > 0.001 || d.tunel >= 0;
    if (d.tunel >= 0) { this.nokta.position.set(kx * 0.4 + Math.sin(t * 2.1) * 0.3, ky * 0.4 + Math.cos(t * 1.7) * 0.25, kz - 7); this.nokta.scale.setScalar(1.3); (this.nokta.material as THREE.SpriteMaterial).opacity = 1; }
    else {
      this.nokta.position.copy(this.P0);
      const nabiz = 0.8 + 0.35 * Math.max(0, Math.sin(t * 5.2)) ** 3;
      this.nokta.scale.setScalar(0.55 * nabiz * (1 + d.tarama * 0.4));
      (this.nokta.material as THREE.SpriteMaterial).opacity = d.nokta;
    }

    // Izgara
    this.izgara.visible = d.izgara > 0.001;
    (this.izgara.material as THREE.LineBasicMaterial).opacity = d.izgara * 0.12;
    this.izgara.position.y = -((t * 0.15) % 0.5);

    // Reaktör: merkezde; karşılaşmada Jarvis küresinin yerine gider ve küre olur
    const rPos = merkez.clone().lerp(this.J, kp);
    this.reaktor.position.copy(rPos);
    const rOpak = d.tunel >= 0 ? 0 : d.reaktor * (1 - kp);
    const titreme = d.reaktorSon > 0 && d.reaktorSon < 1 ? (karma(Math.floor(t * 20), 4) > 0.45 ? 1 : 0.15) : 1;
    (this.reaktorIsik.material as THREE.SpriteMaterial).opacity = rOpak * titreme;
    this.reaktorIsik.scale.setScalar(1.6 + d.reaktor * 0.9);
    this.halkalar.forEach((h, i) => { (h.material as THREE.LineBasicMaterial).opacity = rOpak * titreme * (0.5 - i * 0.1); h.rotation.z = t * (0.4 + i * 0.25) * (i % 2 ? -1 : 1); });
    this.reaktor.visible = rOpak > 0.001;
    if (d.maviKivilcim > 0) { this.reaktor.visible = true; this.reaktor.position.copy(merkez); this.reaktorIsik.scale.setScalar(0.3 + d.maviKivilcim * 3.5); (this.reaktorIsik.material as THREE.SpriteMaterial).opacity = Math.min(1, d.maviKivilcim * 2); this.halkalar.forEach(h => ((h.material as THREE.LineBasicMaterial).opacity = d.maviKivilcim * 0.5)); }

    // Tarama ışını
    this.tarama.visible = d.tarama > 0 && d.tarama < 1 && d.tunel < 0;
    if (this.tarama.visible) {
      const a0 = rPos, b0 = this.P0, boy = a0.distanceTo(b0);
      const ilerle = Math.min(1, d.tarama * 2.2);
      this.tarama.scale.set(boy * ilerle, 1 + Math.sin(t * 30) * 0.3, 1);
      this.tarama.position.copy(a0.clone().lerp(b0, ilerle / 2));
      this.tarama.rotation.z = Math.atan2(b0.y - a0.y, b0.x - a0.x);
      (this.tarama.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - Math.max(0, d.tarama - 0.7) / 0.3);
    }

    // Jarvis küresi
    const jGor = kp * (1 - d.reaktorSon * 0.2);
    this.jGrup.visible = jGor > 0.001 && d.tunel < 0 && d.maviKivilcim === 0;
    this.jGrup.position.copy(this.J);
    jm.uniforms.uZaman.value = t; jm.uniforms.uDon.value = t * 0.22; jm.uniforms.uTitre.value = 0.004 + d.catlak * 0.02 + d.dagil * 0.03;
    jm.uniforms.uDagil.value = d.dagil; jm.uniforms.uOpak.value = jGor * (0.5 + 0.06 * Math.sin(t * 3));
    jm.uniforms.uRenk2.value.set(a.renk.jarvisAcik).lerp(new THREE.Color(a.renk.ultron), d.dagil * 0.8);
    jm.uniforms.uRenk.value.set(a.renk.jarvis).lerp(new THREE.Color(a.renk.ultronKoyu), d.dagil * 0.9);
    jcm.uniforms.uZaman.value = t; jcm.uniforms.uDon.value = t * 0.22; jcm.uniforms.uDagil.value = d.dagil; jcm.uniforms.uOpak.value = jGor * 0.28 * (1 - d.dagil);
    jcm.uniforms.uTitresim.value = d.catlak * 0.6;

    // Ultron kümesi: nokta → büyüyen düzensiz küme; çöküşte merkeze gelir; Final A'da küreye dönüşür
    const uGor = Math.max(kp, d.kure > 0 ? 1 : 0);
    const merkezeGel = yumusak(0.55, 1, d.dagil);
    this.uGrup.visible = uGor > 0.001 && d.tunel < 0;
    this.uGrup.position.copy(this.P0.clone().lerp(this.U, kp).lerp(merkez, merkezeGel));
    this.uGrup.scale.setScalar((0.3 + 0.7 * kp) * (1 + d.dagil * 0.35));
    const ofke = 0.012 + d.ark * 0.03 + (d.vurus === 4 ? 0.008 : 0);
    um.uniforms.uZaman.value = t; um.uniforms.uDon.value = t * 0.35 + Math.sin(t * 1.3) * 0.2; um.uniforms.uTitre.value = ofke * (1 - d.kure);
    um.uniforms.uKure.value = d.kure; um.uniforms.uKureDon.value = t * 0.3; um.uniforms.uNabiz.value = 1 - d.kure; um.uniforms.uOpak.value = uGor * (0.75 + d.ark * 0.3) * (1 - d.kure * 0.45);
    ucm.uniforms.uZaman.value = t; ucm.uniforms.uDon.value = um.uniforms.uDon.value; ucm.uniforms.uTitre.value = ofke; ucm.uniforms.uOpak.value = uGor * 0.5 * (1 - d.kure);
    (this.uCekirdek.material as THREE.SpriteMaterial).opacity = uGor * (0.55 + 0.25 * Math.sin(t * 6)) * (1 - d.kure) * (d.maviKivilcim > 0 ? 1 - d.maviKivilcim : 1);
    (this.kureKabuk.material as THREE.ShaderMaterial).uniforms.uOpak.value = d.kure * 0.55;
    this.kureKabuk.visible = d.kure > 0.01;
    if (d.maviKivilcim > 0) { um.uniforms.uDagil.value = 0; um.uniforms.uOpak.value = uGor * (1 - d.maviKivilcim); um.uniforms.uTitre.value = 0.02 + d.maviKivilcim * 0.4; ucm.uniforms.uOpak.value = 0.5 * (1 - d.maviKivilcim); }

    // Kalkan: Jarvis'in önünde, Ultron'a bakar; hücre hücre turuncuya döner ve çatlar
    this.kalkan.visible = d.kalkan > 0.01 && d.tunel < 0;
    if (this.kalkan.visible) {
      const yon = this.U.clone().sub(this.J).normalize();
      this.kalkan.position.copy(this.J.clone().add(yon.clone().multiplyScalar(this.dikey ? 1.5 : 1.35)));
      this.kalkan.scale.setScalar(this.dikey ? 0.62 : 1);
      // Kalkan çoğunlukla kameraya bakar, Ultron'a doğru hafif döner (yandan ince şerit gibi görünmesin)
      this.kalkan.lookAt(this.kalkan.position.clone().add(yon.clone().multiplyScalar(0.55)).add(V(0, 0, 1)));
      const renk = this.kalkanCizgi.geometry.getAttribute('color') as THREE.BufferAttribute;
      const mavi = new THREE.Color(a.renk.jarvis), tur = new THREE.Color(a.renk.ultron), c = new THREE.Color();
      this.hucreSira.forEach((sira, i) => {
        const ele = d.catlak > sira * 0.95 ? 1 : 0;
        const tit = ele ? (karma(Math.floor(t * 16), i) > 0.3 ? 1 : 0.25) : 0.85 + 0.15 * Math.sin(t * 4 + i);
        c.copy(ele ? tur : mavi).multiplyScalar(d.kalkan * tit);
        for (let k = 0; k < 12; k++) renk.setXYZ(i * 12 + k, c.r, c.g, c.b);
        this.kalkanDolgu.setColorAt(i, c);
      });
      renk.needsUpdate = true;
      if (this.kalkanDolgu.instanceColor) this.kalkanDolgu.instanceColor.needsUpdate = true;
    }

    // Ark'lar ve kıvılcımlar
    const kivilcim = d.vurus === 4 && kp > 0.5 ? (karma(Math.floor(t * 6), 11) > 0.55 ? 0.35 : 0) : 0;
    const arkGuc = Math.max(d.ark, kivilcim);
    this.ark.visible = arkGuc > 0.01 && d.tunel < 0;
    if (this.ark.visible) this.arklar(t, arkGuc, d.ark > 0.05 ? 9 : 2);

    // Bloom: çöküşte patlar
    this.bloom.strength = a.bloom.guc * (1 + d.flas * 1.5 + d.ark * 0.3);
    this.composer.render();
  }

  /** Şimşekler: orta nokta kaydırma; her 1/24 sn'de yeni biçim (karma ile tekrarlanabilir) */
  private arklar(t: number, guc: number, adet: number) {
    const kare = Math.floor(t * 24);
    const bas = this.uGrup.position.clone();
    const yon = this.J.clone().sub(this.U).normalize();
    const kalkanNokta = this.kalkan.visible ? this.kalkan.position : this.J.clone().add(yon.clone().multiplyScalar(-1.05));
    let v = 0;
    const renk = new THREE.Color();
    for (let b = 0; b < 9; b++) {
      const etkin = b < adet && karma(kare, b * 7 + 1) < 0.85;
      const pts: THREE.Vector3[] = [];
      const A = bas.clone().add(yon.clone().multiplyScalar(0.5)).add(V((karma(kare, b) - 0.5) * 0.8, (karma(kare, b + 50) - 0.5) * 0.8, (karma(kare, b + 90) - 0.5) * 0.5));
      const B = kalkanNokta.clone().add(V((karma(kare, b + 20) - 0.5) * 1.1, (karma(kare, b + 70) - 0.5) * 1.1, (karma(kare, b + 33) - 0.5) * 0.4));
      pts.push(A, B);
      let ofs = A.distanceTo(B) * 0.22;
      for (let seviye = 0; seviye < 5; seviye++) {
        const yeni: THREE.Vector3[] = [];
        for (let i = 0; i < pts.length - 1; i++) {
          const m = pts[i].clone().lerp(pts[i + 1], 0.5).add(V((karma(kare * 31 + b, seviye * 64 + i) - 0.5) * ofs, (karma(kare * 37 + b, seviye * 64 + i + 7) - 0.5) * ofs, (karma(kare * 41 + b, seviye * 64 + i + 13) - 0.5) * ofs * 0.5));
          yeni.push(pts[i], m);
        }
        yeni.push(pts[pts.length - 1]);
        pts.splice(0, pts.length, ...yeni);
        ofs *= 0.55;
      }
      for (let i = 0; i < 32; i++) {
        const p1 = pts[i], p2 = pts[i + 1];
        this.arkPoz.set([p1.x, p1.y, p1.z, p2.x, p2.y, p2.z], v * 3);
        const k = etkin ? guc * (0.6 + 0.4 * karma(kare, b + i)) : 0;
        renk.set(i < 10 ? '#fff3dc' : i < 22 ? '#ffb070' : '#ff6a1a').multiplyScalar(k);
        this.arkRenk.set([renk.r, renk.g, renk.b, renk.r, renk.g, renk.b], v * 3);
        v += 2;
      }
    }
    this.ark.geometry.getAttribute('position').needsUpdate = true;
    this.ark.geometry.getAttribute('color').needsUpdate = true;
  }

  dispose() {
    this.sahne.traverse(o => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose?.();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      for (const x of Array.isArray(mat) ? mat : mat ? [mat] : []) { (x as any).map?.dispose?.(); x.dispose(); }
    });
    this.composer.dispose();
    this.renderer.dispose();
  }
}
