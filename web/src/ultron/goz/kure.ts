// Ultron'un Gözü · Three.js dünya küresi ve veri katmanları. Koyu, turuncu ışıltılı küre; kıyılar ve ülke sınırları
// ince çizgi; atmosferde turuncu hale. Katmanlar: deprem halkaları (büyüklükle orantılı, dışa yayılır; Türkiye'dekiler
// daha parlak), uçuşlar (nokta + yön izi), yangınlar (titreyen), uydular (yörünge + nokta), siber nabız (Türkiye).
// render(t) deterministik: kamera geçişleri ve açılış zamanı t'ye bağlı (kayıt modu aynı kareyi üretir).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import * as sat from './uydu';
import { LAND } from '../../data/world';
import { BORDERS } from '../../data/borders';
import { tohumlu, yumusak } from '../zaman';
import type { GozVeri, KatmanAd } from '../api';

export type GorselKatman = 'deprem' | 'ucus' | 'yangin' | 'uydu' | 'haber' | 'siber' | 'hava';
export const GORSEL_KATMANLAR: GorselKatman[] = ['deprem', 'ucus', 'yangin', 'uydu', 'haber', 'siber', 'hava'];
const RAD = Math.PI / 180;
/** (enlem, boylam) → küre üstünde nokta (lon 0 → +z, kameraya bakar) */
export const vek = (lat: number, lon: number, r = 1) => new THREE.Vector3(Math.cos(lat * RAD) * Math.sin(lon * RAD) * r, Math.sin(lat * RAD) * r, Math.cos(lat * RAD) * Math.cos(lon * RAD) * r);
/** Uydu irtifası → görsel yarıçap (sıkıştırılmış ölçek: LEO yakın, GEO çerçevenin içinde) */
export const uyduR = (km: number) => 1.04 + 0.33 * Math.log10(1 + km / 400);

export interface UyduIz { ad: string; grup: 'istasyon' | 'turk'; rec: sat.SatRec; donem: number }
export interface Etiket { id: string; lat: number; lon: number; r: number; metin: string; tur: 'uydu' | 'haber' | 'siber' | 'deprem' }

const HALKA_VS = `attribute float aMag; attribute float aFaz; attribute float aTr; varying vec2 vUv; varying float vMag; varying float vFaz; varying float vTr;
void main(){ vUv = uv; vMag = aMag; vFaz = aFaz; vTr = aTr; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`;
const HALKA_FS = `uniform float uZaman, uOpak; uniform vec3 uRenk, uRenkTr; varying vec2 vUv; varying float vMag; varying float vFaz; varying float vTr;
void main(){ float r = length(vUv - 0.5) * 2.0; float ph = fract(uZaman * (0.35 + vMag * 0.04) + vFaz);
  float halka = smoothstep(0.09, 0.0, abs(r - ph)) * (1.0 - ph); float merkez = smoothstep(0.16, 0.0, r);
  vec3 c = mix(uRenk, uRenkTr, vTr); float a = (halka * 0.9 + merkez) * uOpak * (0.55 + 0.45 * vTr + vMag * 0.05);
  gl_FragColor = vec4(c * a, 1.0); }`;
const NOKTA_VS = `attribute float aTohum; attribute float aBoy; uniform float uZaman, uOlcek, uTitre; varying float vT;
void main(){ vT = aTohum; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
  float tit = 1.0 + uTitre * 0.5 * sin(uZaman * (9.0 + aTohum * 7.0) + aTohum * 40.0);
  gl_PointSize = aBoy * uOlcek * tit / max(0.2, -mv.z); }`;
const NOKTA_FS = `uniform vec3 uRenk, uRenk2; uniform float uOpak, uZaman, uTitre; varying float vT;
void main(){ float r = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.05, r);
  float tit = mix(1.0, 0.55 + 0.45 * sin(uZaman * 13.0 + vT * 60.0), uTitre);
  gl_FragColor = vec4(mix(uRenk, uRenk2, vT) * a * uOpak * tit, 1.0); }`;

export class GozKuresi {
  readonly renderer: THREE.WebGLRenderer;
  private sahne = new THREE.Scene();
  private kamera = new THREE.PerspectiveCamera(42, 16 / 9, 0.05, 100);
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private dunya = new THREE.Group();
  private kabuk!: THREE.Mesh; private hale!: THREE.Mesh; private kiyi!: THREE.LineSegments; private sinir!: THREE.LineSegments; private ag!: THREE.LineSegments;
  private katman: Partial<Record<GorselKatman, THREE.Object3D>> = {};
  private malzeme: THREE.ShaderMaterial[] = [];
  private uydular: UyduIz[] = [];
  private uyduNokta: THREE.Points | null = null;
  private uyduYorunge: THREE.Line[] = [];
  private etiketler: Etiket[] = [];
  private gorunurluk: Record<GorselKatman, boolean> = { deprem: true, ucus: true, yangin: true, uydu: true, haber: true, siber: true, hava: true };
  private acilisSira: Record<GorselKatman, number> = { deprem: 0, ucus: 1, yangin: 2, uydu: 3, haber: 4, siber: 5, hava: 6 };
  private olcek = 1;
  private dikey = false;
  // Kamera: küre döner (boylam, enlem), uzaklık zoom'la
  private odak = { lat: 25, lon: 30, uzak: 3.4 };
  private gecis: { bas: number; sure: number; den: { lat: number; lon: number; uzak: number }; e: { lat: number; lon: number; uzak: number } } | null = null;
  private serbest = true; private serbestBas = 0; private serbestLon = 30;
  /** Son render'daki görünür etiketler (DOM/HUD için) */
  ekranEtiketleri: { id: string; x: number; y: number; metin: string; tur: Etiket['tur'] }[] = [];
  /** Turkiye'deki siber nabzın ekran konumu */
  private renk = { ana: new THREE.Color('#ff6a1a'), koyu: new THREE.Color('#ff3b1f'), cekirdek: new THREE.Color('#ffd27a'), acik: new THREE.Color('#ffb48a') };

  constructor(canvas: HTMLCanvasElement, o: { kayit?: boolean; bloom?: { guc: number; yaricap: number; esik: number } } = {}) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: !!o.kayit, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.sahne, this.kamera));
    const b = o.bloom ?? { guc: 0.9, yaricap: 0.5, esik: 0.15 };
    this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), b.guc * 0.8, b.yaricap, b.esik);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.dunya.rotation.order = 'XYZ';
    this.sahne.add(this.dunya);
    this.kur();
  }

  private kur() {
    // Küre: koyu gövde + turuncu kenar ışıması
    this.kabuk = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), new THREE.ShaderMaterial({
      uniforms: { uRenk: { value: this.renk.ana }, uOpak: { value: 1 } },
      vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vN = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }',
      fragmentShader: 'uniform vec3 uRenk; uniform float uOpak; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - max(0.0, dot(vN, vV)), 3.0); vec3 c = vec3(0.022, 0.009, 0.006) + uRenk * f * 0.75; gl_FragColor = vec4(c * uOpak, 1.0); }',
    }));
    this.dunya.add(this.kabuk);
    // Atmosfer halesi (arka yüz)
    this.hale = new THREE.Mesh(new THREE.SphereGeometry(1.14, 64, 48), new THREE.ShaderMaterial({
      side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uRenk: { value: this.renk.ana }, uOpak: { value: 1 } },
      vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vN = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }',
      fragmentShader: 'uniform vec3 uRenk; uniform float uOpak; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(max(0.0, 0.62 - dot(vN, vV) * -1.0) , 4.0); gl_FragColor = vec4(uRenk * f * 1.4 * uOpak, 1.0); }',
    }));
    this.sahne.add(this.hale);
    const cizgiler = (halkalar: string[], r: number) => {
      const p: number[] = [];
      for (const s of halkalar) {
        const k = s.split(',').map(Number);
        for (let i = 0; i + 3 < k.length; i += 2) { const a = vek(k[i + 1], k[i], r), b = vek(k[i + 3], k[i + 2], r); p.push(a.x, a.y, a.z, b.x, b.y, b.z); }
      }
      return new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    };
    this.kiyi = new THREE.LineSegments(cizgiler(LAND, 1.002), new THREE.LineBasicMaterial({ color: '#ff7a2a', transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.sinir = new THREE.LineSegments(cizgiler(BORDERS, 1.0015), new THREE.LineBasicMaterial({ color: '#ff8a3a', transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false }));
    // Enlem-boylam ağı
    const ag: number[] = [];
    for (let lat = -60; lat <= 60; lat += 30) for (let lon = -180; lon < 180; lon += 4) { const a = vek(lat, lon, 1.001), b = vek(lat, lon + 4, 1.001); ag.push(a.x, a.y, a.z, b.x, b.y, b.z); }
    for (let lon = -180; lon < 180; lon += 30) for (let lat = -84; lat < 84; lat += 4) { const a = vek(lat, lon, 1.001), b = vek(lat + 4, lon, 1.001); ag.push(a.x, a.y, a.z, b.x, b.y, b.z); }
    this.ag = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(ag, 3)), new THREE.LineBasicMaterial({ color: '#ff6a1a', transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.dunya.add(this.kiyi, this.sinir, this.ag);
  }

  private noktaMalzeme(r1: THREE.Color, r2: THREE.Color, titre = 0) {
    const m = new THREE.ShaderMaterial({ vertexShader: NOKTA_VS, fragmentShader: NOKTA_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uZaman: { value: 0 }, uOlcek: { value: 1 }, uTitre: { value: titre }, uOpak: { value: 1 }, uRenk: { value: r1 }, uRenk2: { value: r2 } } });
    this.malzeme.push(m);
    return m;
  }
  private katmanKoy(ad: GorselKatman, o: THREE.Object3D) {
    const eski = this.katman[ad];
    if (eski) { this.dunya.remove(eski); eski.traverse(x => { (x as THREE.Mesh).geometry?.dispose?.(); }); }
    this.katman[ad] = o;
    this.dunya.add(o);
  }

  /** Veriyi katmanlara dök (yeni veri geldikçe çağrılır) */
  veri(v: GozVeri) {
    const k = v.katmanlar;
    const r = tohumlu(7);
    // Depremler
    const dep = [...(k.deprem_tr?.durum !== 'yok' ? (k.deprem_tr?.items ?? []).map(d => ({ ...d, tr: true })) : []), ...(k.deprem_dunya?.durum !== 'yok' ? (k.deprem_dunya?.items ?? []) : [])]
      .filter((d: any) => d.mag >= (d.tr ? 1.5 : 2.5)).slice(0, 1600);
    if (dep.length) {
      const geo = new THREE.PlaneGeometry(1, 1);
      const m = new THREE.ShaderMaterial({ vertexShader: HALKA_VS, fragmentShader: HALKA_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        uniforms: { uZaman: { value: 0 }, uOpak: { value: 1 }, uRenk: { value: this.renk.ana }, uRenkTr: { value: this.renk.cekirdek } } });
      this.malzeme.push(m);
      const im = new THREE.InstancedMesh(geo, m, dep.length);
      const mag = new Float32Array(dep.length), faz = new Float32Array(dep.length), tr = new Float32Array(dep.length);
      const mat = new THREE.Matrix4(), q = new THREE.Quaternion(), z = new THREE.Vector3(0, 0, 1);
      dep.forEach((d: any, i) => {
        const p = vek(d.lat, d.lon, 1.003), n = p.clone().normalize();
        const s = 0.012 + Math.pow(Math.max(0, d.mag), 1.7) * 0.0065;
        q.setFromUnitVectors(z, n); mat.compose(p, q, new THREE.Vector3(s, s, s)); im.setMatrixAt(i, mat);
        mag[i] = d.mag; faz[i] = r(); tr[i] = d.tr ? 1 : 0;
      });
      geo.setAttribute('aMag', new THREE.InstancedBufferAttribute(mag, 1));
      geo.setAttribute('aFaz', new THREE.InstancedBufferAttribute(faz, 1));
      geo.setAttribute('aTr', new THREE.InstancedBufferAttribute(tr, 1));
      im.frustumCulled = false;
      this.katmanKoy('deprem', im);
    }
    // Uçuşlar: nokta + yön izi
    const ucak = k.ucus?.durum !== 'yok' ? (k.ucus?.items ?? []) as [number, number, number, number][] : [];
    if (ucak.length) {
      const g = new THREE.Group();
      const p = new Float32Array(ucak.length * 3), t = new Float32Array(ucak.length), b = new Float32Array(ucak.length), iz: number[] = [];
      ucak.forEach(([lat, lon, yon, irt], i) => {
        const rr = 1.006 + (Math.min(13000, irt || 0) / 1000 / 6371) * 8; // irtifa metre; 8× abartılı (görünür olsun)
        const v = vek(lat, lon, rr); p.set([v.x, v.y, v.z], i * 3); t[i] = r(); b[i] = 6;
        // Yönün tersine 0,6° iz
        const d = 0.6, la2 = lat - Math.cos(yon * RAD) * d, lo2 = lon - Math.sin(yon * RAD) * d / Math.max(0.2, Math.cos(lat * RAD));
        const w = vek(la2, lo2, rr); iz.push(v.x, v.y, v.z, w.x, w.y, w.z);
      });
      const pg = new THREE.BufferGeometry();
      pg.setAttribute('position', new THREE.BufferAttribute(p, 3)); pg.setAttribute('aTohum', new THREE.BufferAttribute(t, 1)); pg.setAttribute('aBoy', new THREE.BufferAttribute(b, 1));
      g.add(new THREE.Points(pg, this.noktaMalzeme(new THREE.Color('#ffe2c4'), this.renk.acik)));
      g.add(new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(iz, 3)), new THREE.LineBasicMaterial({ color: '#ff9a5a', transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false })));
      this.katmanKoy('ucus', g);
    }
    // Yangınlar
    const yan = k.yangin?.durum !== 'yok' ? (k.yangin?.items ?? []) as [number, number, number][] : [];
    if (yan.length) {
      const p = new Float32Array(yan.length * 3), t = new Float32Array(yan.length), b = new Float32Array(yan.length);
      yan.forEach(([lat, lon, frp], i) => { const v = vek(lat, lon, 1.004); p.set([v.x, v.y, v.z], i * 3); t[i] = r(); b[i] = 7 + Math.min(14, Math.sqrt(frp || 1) * 1.2); });
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('aTohum', new THREE.BufferAttribute(t, 1)); g.setAttribute('aBoy', new THREE.BufferAttribute(b, 1));
      this.katmanKoy('yangin', new THREE.Points(g, this.noktaMalzeme(new THREE.Color('#ff2a10'), new THREE.Color('#ffd24a'), 1)));
    }
    // Uydular: TLE → satrec; yörünge çizgisi bir dönem
    this.uydular = [];
    for (const u of (k.uydu?.durum !== 'yok' ? k.uydu?.items ?? [] : []) as { ad: string; tle1: string; tle2: string; grup: 'istasyon' | 'turk' }[]) {
      try { const rec = sat.twoline2satrec(u.tle1, u.tle2); this.uydular.push({ ad: u.ad, grup: u.grup, rec, donem: (2 * Math.PI) / rec.no }); } catch { /* bozuk TLE */ }
    }
    this.uyduKur(new Date(v.zaman));
    // Siber nabız ve hava uyarıları (Türkiye ve şehirler)
    const g = new THREE.Group();
    if (k.siber && k.siber.durum !== 'yok') {
      const m = new THREE.ShaderMaterial({ vertexShader: HALKA_VS, fragmentShader: HALKA_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        uniforms: { uZaman: { value: 0 }, uOpak: { value: 1 }, uRenk: { value: new THREE.Color('#ff3b1f') }, uRenkTr: { value: new THREE.Color('#ff3b1f') } } });
      this.malzeme.push(m);
      const geo = new THREE.PlaneGeometry(1, 1);
      geo.setAttribute('aMag', new THREE.InstancedBufferAttribute(new Float32Array([6]), 1));
      geo.setAttribute('aFaz', new THREE.InstancedBufferAttribute(new Float32Array([0]), 1));
      geo.setAttribute('aTr', new THREE.InstancedBufferAttribute(new Float32Array([1]), 1));
      const im = new THREE.InstancedMesh(geo, m, 1);
      const p = vek(39, 35, 1.005), q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), p.clone().normalize());
      im.setMatrixAt(0, new THREE.Matrix4().compose(p, q, new THREE.Vector3(0.28, 0.28, 0.28)));
      im.frustumCulled = false;
      g.add(im);
    }
    this.katmanKoy('siber', g);
    const hava = (k.hava?.durum !== 'yok' ? k.hava?.items ?? [] : []) as { lat: number; lon: number; uyarilar: string[]; ev?: boolean }[];
    if (hava.length) {
      const p = new Float32Array(hava.length * 3), t = new Float32Array(hava.length), b = new Float32Array(hava.length);
      hava.forEach((h, i) => { const v = vek(h.lat, h.lon, 1.004); p.set([v.x, v.y, v.z], i * 3); t[i] = h.uyarilar.length ? 1 : 0.1; b[i] = h.uyarilar.length ? 22 : h.ev ? 16 : 8; });
      const hg = new THREE.BufferGeometry();
      hg.setAttribute('position', new THREE.BufferAttribute(p, 3)); hg.setAttribute('aTohum', new THREE.BufferAttribute(t, 1)); hg.setAttribute('aBoy', new THREE.BufferAttribute(b, 1));
      this.katmanKoy('hava', new THREE.Points(hg, this.noktaMalzeme(new THREE.Color('#ffd27a'), new THREE.Color('#ff3b1f'))));
    }
    // Etiketler: haber kartları (yerli manşet), siber sayacı, ISS ve Türk uyduları (uyduKur'da)
    const haber = (k.haber?.durum !== 'yok' ? k.haber?.items ?? [] : []) as { baslik: string; yer: string | null; lat: number | null; lon: number | null }[];
    const yerler = new Set<string>();
    this.etiketler = this.etiketler.filter(e => e.tur === 'uydu');
    for (const h of haber) {
      if (h.lat == null || h.lon == null || !h.yer || yerler.has(h.yer) || yerler.size >= 8) continue;
      yerler.add(h.yer);
      this.etiketler.push({ id: 'h-' + h.yer, lat: h.lat, lon: h.lon, r: 1.01, metin: `${h.yer.toLocaleUpperCase('tr')} · ${h.baslik.length > 64 ? h.baslik.slice(0, 62) + '…' : h.baslik}`, tur: 'haber' });
    }
    this.katmanKoy('haber', new THREE.Group()); // haber kartları DOM'da; görünürlük bu grupla yönetilir
    if (k.siber && k.siber.durum !== 'yok') this.etiketler.push({ id: 'siber', lat: 39, lon: 35, r: 1.01, metin: `${k.siber.summary.malicious_links_today ?? 0} zararlı link · USOM ${(k.siber.summary.usom_list_size as number | null)?.toLocaleString('tr-TR') ?? '—'}`, tur: 'siber' });
    this.gorunurlukUygula();
  }

  private uyduKur(an: Date) {
    for (const y of this.uyduYorunge) { this.dunya.remove(y); y.geometry.dispose(); }
    this.uyduYorunge = [];
    this.etiketler = this.etiketler.filter(e => e.tur !== 'uydu');
    if (!this.uydular.length) { if (this.uyduNokta) this.dunya.remove(this.uyduNokta); this.uyduNokta = null; return; }
    const g = new THREE.Group();
    for (const u of this.uydular) {
      const pts: THREE.Vector3[] = [];
      const adim = u.donem / 120;
      for (let i = 0; i <= 120; i++) { const p = this.uyduKonum(u, new Date(an.getTime() + (i - 60) * adim * 60_000)); if (p) pts.push(p); }
      const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: u.grup === 'istasyon' ? '#ffd27a' : '#ff8a3a', transparent: true, opacity: u.grup === 'istasyon' ? 0.45 : 0.2, blending: THREE.AdditiveBlending, depthWrite: false }));
      this.uyduYorunge.push(l); g.add(l);
      if (u.ad.startsWith('ISS') || u.grup === 'turk') this.etiketler.push({ id: 'u-' + u.ad, lat: 0, lon: 0, r: 0, metin: u.ad.replace(/ \(.*\)$/, '').replace(/^TURKSAT/, 'Türksat').replace(/^GOKTURK/, 'Göktürk').replace(/^IMECE/, 'İMECE'), tur: 'uydu' });
    }
    const p = new Float32Array(this.uydular.length * 3), t = new Float32Array(this.uydular.length), b = new Float32Array(this.uydular.length);
    this.uydular.forEach((u, i) => { t[i] = u.grup === 'istasyon' ? 1 : 0.3; b[i] = u.grup === 'istasyon' ? 26 : 16; });
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(p, 3)); pg.setAttribute('aTohum', new THREE.BufferAttribute(t, 1)); pg.setAttribute('aBoy', new THREE.BufferAttribute(b, 1));
    this.uyduNokta = new THREE.Points(pg, this.noktaMalzeme(new THREE.Color('#ff9a5a'), new THREE.Color('#fff1c8')));
    g.add(this.uyduNokta);
    this.katmanKoy('uydu', g);
  }
  /** SGP4 → dünyaya göre (dönen) konum; küre grubu Dünya ile birlikte döndüğü için ECF/geodetik kullanılır */
  private uyduKonum(u: UyduIz, an: Date): THREE.Vector3 | null {
    const pv = sat.propagate(u.rec, an);
    if (!pv || typeof pv.position === 'boolean' || !pv.position) return null;
    const g = sat.eciToGeodetic(pv.position, sat.gstime(an));
    return vek(sat.degreesLat(g.latitude), sat.degreesLong(g.longitude), uyduR(g.height));
  }

  gorunur(ad: GorselKatman, acik: boolean) { this.gorunurluk[ad] = acik; this.gorunurlukUygula(); }
  gorunurlukDurumu() { return { ...this.gorunurluk }; }
  private gorunurlukUygula() { for (const ad of GORSEL_KATMANLAR) { const o = this.katman[ad]; if (o) o.visible = this.gorunurluk[ad]; } }

  boyut(w: number, h: number, dpr = Math.min(2, window.devicePixelRatio || 1)) {
    this.dikey = h > w * 1.05;
    this.renderer.setPixelRatio(dpr); this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(dpr); this.composer.setSize(w, h);
    this.kamera.aspect = w / h;
    this.kamera.fov = this.dikey ? 58 : 42;
    this.kamera.updateProjectionMatrix();
    this.olcek = (h * dpr) / 1080;
    for (const m of this.malzeme) if (m.uniforms.uOlcek) m.uniforms.uOlcek.value = this.olcek;
  }

  /** Kamera geçişi (t: sahne saati, sn). zoom: 1 uzak … 3.4 yakın */
  odakla(lat: number, lon: number, zoom: number, t: number, sure = 1.8) {
    const su = this.su(t);
    this.gecis = { bas: t, sure, den: su, e: { lat, lon: yakinBoylam(su.lon, lon), uzak: 1 + 3 / Math.max(0.6, zoom) } };
    this.serbest = false;
  }
  /** Serbest dönüşe dön (odak bırakılır) */
  serbestBirak(t: number) { const su = this.su(t); this.serbest = true; this.serbestBas = t; this.serbestLon = su.lon; this.odak = su; this.gecis = null; }
  private su(t: number) {
    if (this.gecis) {
      const k = yumusak(this.gecis.bas, this.gecis.bas + this.gecis.sure, t);
      const a = this.gecis.den, b = this.gecis.e;
      return { lat: a.lat + (b.lat - a.lat) * k, lon: a.lon + (b.lon - a.lon) * k, uzak: a.uzak + (b.uzak - a.uzak) * k };
    }
    if (this.serbest) return { lat: 22, lon: this.serbestLon + (t - this.serbestBas) * 7, uzak: this.dikey ? 3.9 : 3.3 };
    return this.odak;
  }

  /** Ekran konumu (CSS pikseli) ve ön yüzde mi */
  ekran(p: THREE.Vector3, w: number, h: number) {
    const dp = p.clone().applyMatrix4(this.dunya.matrixWorld);
    const gor = dp.clone().normalize().dot(this.kamera.position.clone().sub(dp).normalize()) > 0.08;
    const v = dp.project(this.kamera);
    return { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h, gor };
  }

  /**
   * Kare çiz. acilis: katmanların tek tek yanması için açılış saati (sn; null = hepsi açık). seviye: Ultron'un ses seviyesi.
   * w, h: etiketlerin ekran konumu için CSS boyutu.
   */
  render(t: number, o: { acilis: number | null; w: number; h: number; an?: Date }) {
    const su = this.su(t);
    if (this.gecis && t > this.gecis.bas + this.gecis.sure) this.odak = su;
    this.dunya.rotation.set(su.lat * RAD, -su.lon * RAD, 0);
    this.kamera.position.set(0, this.dikey ? -0.15 : 0, su.uzak);
    this.kamera.lookAt(0, this.dikey ? -0.15 : 0, 0);
    this.hale.rotation.copy(this.dunya.rotation);
    for (const m of this.malzeme) m.uniforms.uZaman.value = t;
    // Açılış: küre belirir, sonra katmanlar sırayla
    const ac = o.acilis == null ? 1 : yumusak(0, 1.2, o.acilis);
    (this.kabuk.material as THREE.ShaderMaterial).uniforms.uOpak.value = ac;
    (this.hale.material as THREE.ShaderMaterial).uniforms.uOpak.value = ac;
    (this.kiyi.material as THREE.LineBasicMaterial).opacity = 0.75 * ac;
    (this.sinir.material as THREE.LineBasicMaterial).opacity = 0.28 * ac;
    for (const ad of GORSEL_KATMANLAR) {
      const ob = this.katman[ad];
      if (!ob) continue;
      const k = o.acilis == null ? 1 : yumusak(1.4 + this.acilisSira[ad] * 0.7, 2.0 + this.acilisSira[ad] * 0.7, o.acilis);
      ob.visible = this.gorunurluk[ad] && k > 0.01;
      ob.traverse(x => {
        const m = (x as THREE.Mesh).material as THREE.Material & { uniforms?: any; opacity?: number; userData: any };
        if (!m) return;
        if (m.uniforms?.uOpak) m.uniforms.uOpak.value = k;
        else if ('opacity' in m) { m.userData.taban ??= m.opacity; m.opacity = (m.userData.taban as number) * k; }
      });
    }
    // Uydular: anlık konum (kayıtta an sabit + t)
    if (this.uyduNokta) {
      const an = new Date((o.an ?? new Date()).getTime());
      const pa = this.uyduNokta.geometry.getAttribute('position') as THREE.BufferAttribute;
      this.uydular.forEach((u, i) => { const p = this.uyduKonum(u, an); if (p) pa.setXYZ(i, p.x, p.y, p.z); });
      pa.needsUpdate = true;
      for (const e of this.etiketler) if (e.tur === 'uydu') {
        const u = this.uydular.find(x => 'u-' + x.ad === e.id); const p = u && this.uyduKonum(u, an);
        if (p) { const r = p.length(); e.r = r; e.lat = Math.asin(p.y / r) / RAD; e.lon = Math.atan2(p.x, p.z) / RAD; }
      }
    }
    this.dunya.updateMatrixWorld(true);
    this.kamera.updateMatrixWorld();
    this.ekranEtiketleri = [];
    for (const e of this.etiketler) {
      const ad: GorselKatman = e.tur === 'deprem' ? 'deprem' : e.tur;
      const ob = this.katman[ad];
      if (!ob?.visible || (e.tur === 'uydu' && !e.metin.startsWith('ISS') && this.odak.uzak > 2.6 && !this.gecis && this.serbest)) continue;
      const s = this.ekran(vek(e.lat, e.lon, e.r), o.w, o.h);
      if (s.gor) this.ekranEtiketleri.push({ id: e.id, x: s.x, y: s.y, metin: e.metin, tur: e.tur });
    }
    this.composer.render();
  }

  dispose() {
    this.sahne.traverse(x => { const m = x as THREE.Mesh; m.geometry?.dispose?.(); const mt = m.material as THREE.Material | undefined; mt?.dispose?.(); });
    this.composer.dispose(); this.renderer.dispose();
  }
}

/** Boylam geçişi en kısa yoldan */
function yakinBoylam(den: number, e: number) { let d = ((e - den) % 360 + 540) % 360 - 180; return den + d; }

/** Görsel katman ↔ veri katmanı */
export const VERI_KATMANI: Record<GorselKatman, KatmanAd[]> = {
  deprem: ['deprem_dunya', 'deprem_tr'], ucus: ['ucus'], yangin: ['yangin'], uydu: ['uydu'], haber: ['haber'], siber: ['siber'], hava: ['hava'],
};
