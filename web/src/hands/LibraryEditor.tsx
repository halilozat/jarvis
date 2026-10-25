// Kitaplık ayar modu (El Kontrolü'nde K): taranan kutuları gör, belirsiz/kaçırılan kitabın sırtına fareyle dikdörtgen çiz,
// adını yaz; var olan kutuyu taşı, köşesinden boyutlandır, sil. Bölüm düğmesiyle (B1-B6) bölümün kameradaki alanını
// çiz: tarama, alanın içindeki belirsiz sırtları o bölümün yakın çekim listesiyle tamamlar. Kaydet → server/data/kitaplik.json
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Bolum, Kitap, Kutu } from '../lib/library';
import { makeMapper } from './tracker';

interface Props {
  books: Kitap[];
  /** Kitaplığın bölümleri: alanları burada çizilir */
  bolumler: Bolum[];
  /** Ekran ve video boyutu (kutular video normalize, aynalanmamış) */
  W: number; H: number; vw: number; vh: number;
  scanning: boolean;
  moved: boolean;
  demo: boolean;
  onScan(): void;
  onSave(list: Kitap[], alanlar?: { id: number; alan: Kutu | null }[]): Promise<void>;
  onClose(): void;
}

interface R { x: number; y: number; w: number; h: number }
type Drag =
  | { tip: 'yeni'; x0: number; y0: number; r: R }
  | { tip: 'tasi'; id: string; dx: number; dy: number }
  | { tip: 'boyut'; id: string; corner: number };

const newId = () => Math.random().toString(36).slice(2, 10);

export default function LibraryEditor(p: Props) {
  // Kaydedilmemiş değişiklik yoksa liste doğrudan haritadır (tarama bitince ya da sunucudan yeni harita gelince yenilenir)
  const [edits, setEdits] = useState<Kitap[] | null>(null);
  const list = edits ?? p.books;
  /** Bölüm alanı düzenlemeleri (kaydedilmemiş) ve çizilen bölüm */
  const [alanlar, setAlanlar] = useState<Map<number, Kutu | null>>(new Map());
  const [bolumCiz, setBolumCiz] = useState<number | null>(null);
  const alanOf = (b: Bolum) => (alanlar.has(b.id) ? alanlar.get(b.id)! : b.alan);
  const dirty = edits !== null || alanlar.size > 0;
  const setList = (fn: (l: Kitap[]) => Kitap[]) => setEdits(e => fn(e ?? p.books));
  const [sel, setSel] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [saving, setSaving] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  const map = useMemo(() => makeMapper(p.vw, p.vh, p.W, p.H), [p.vw, p.vh, p.W, p.H]);
  /** Ekran → video normalize (makeMapper'ın tersi: ayna + object-fit: cover) */
  const unmap = useMemo(() => {
    const s = Math.max(p.W / p.vw, p.H / p.vh);
    const dw = p.vw * s, dh = p.vh * s, ox = (p.W - dw) / 2, oy = (p.H - dh) / 2;
    return (x: number, y: number) => ({ u: (p.W - x - ox) / dw, v: (y - oy) / dh });
  }, [p.vw, p.vh, p.W, p.H]);

  const toRect = (k: Kutu): R => {
    const a = map(k[1], k[0]), c = map(k[3], k[2]);
    return { x: Math.min(a.x, c.x), y: Math.min(a.y, c.y), w: Math.abs(c.x - a.x), h: Math.abs(c.y - a.y) };
  };
  const toKutu = (r: R): Kutu => {
    const a = unmap(r.x, r.y), c = unmap(r.x + r.w, r.y + r.h);
    const cl = (v: number) => Math.max(0, Math.min(1, v));
    return [cl(Math.min(a.v, c.v)), cl(Math.min(a.u, c.u)), cl(Math.max(a.v, c.v)), cl(Math.max(a.u, c.u))];
  };

  const change = (id: string, patch: Partial<Kitap>) => {
    setList(l => l.map(b => (b.id === id ? { ...b, ...patch, elle: true } : b)));
  };
  const remove = (id: string) => { setList(l => l.filter(b => b.id !== id)); setSel(null); };
  /** Rafta yeri olmayan kayıtlı kitaplar (fotoğraftan, sesle ya da Ayarlar'dan eklenen): adsız kutuya öneri */
  const unplaced = list.filter(b => b.ad && !b.kutu);
  const low = (t: string) => t.trim().toLocaleLowerCase('tr');
  /** Ad yazılırken kayıtlı bir kitapla birebir eşleşirse o kitap bu kutuya yerleşir (notları, özeti korunur) */
  const setName = (cur: Kitap, ad: string) => {
    const hit = unplaced.find(b => b.id !== cur.id && low(b.ad!) === low(ad));
    if (hit && cur.kutu) {
      setList(l => l.filter(b => b.id !== cur.id).map(b => (b.id === hit.id ? { ...b, kutu: cur.kutu, elle: true } : b)));
      setSel(hit.id);
      return;
    }
    change(cur.id, { ad: ad || null });
  };

  const pt = (e: React.PointerEvent) => ({ x: e.clientX, y: e.clientY });
  const onDown = (e: React.PointerEvent, id?: string, corner?: number) => {
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    const q = pt(e);
    if (id !== undefined && corner !== undefined) { setSel(id); setDrag({ tip: 'boyut', id, corner }); return; }
    if (id !== undefined) {
      const b = list.find(x => x.id === id);
      if (!b?.kutu) return;
      const r = toRect(b.kutu);
      setSel(id);
      setDrag({ tip: 'tasi', id, dx: q.x - r.x, dy: q.y - r.y });
      return;
    }
    setSel(null);
    setDrag({ tip: 'yeni', x0: q.x, y0: q.y, r: { x: q.x, y: q.y, w: 0, h: 0 } });
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const q = pt(e);
    if (drag.tip === 'yeni') {
      setDrag({ ...drag, r: { x: Math.min(drag.x0, q.x), y: Math.min(drag.y0, q.y), w: Math.abs(q.x - drag.x0), h: Math.abs(q.y - drag.y0) } });
      return;
    }
    const b = list.find(x => x.id === drag.id);
    if (!b?.kutu) return;
    const r = toRect(b.kutu);
    if (drag.tip === 'tasi') change(b.id, { kutu: toKutu({ ...r, x: q.x - drag.dx, y: q.y - drag.dy }) });
    else {
      // Köşe: 0 sol üst, 1 sağ üst, 2 sağ alt, 3 sol alt
      let { x, y, w, h } = r;
      const x2 = x + w, y2 = y + h;
      if (drag.corner === 0 || drag.corner === 3) { x = Math.min(q.x, x2 - 4); w = x2 - x; } else w = Math.max(4, q.x - x);
      if (drag.corner === 0 || drag.corner === 1) { y = Math.min(q.y, y2 - 8); h = y2 - y; } else h = Math.max(8, q.y - y);
      change(b.id, { kutu: toKutu({ x, y, w, h }) });
    }
  };
  const onUp = () => {
    // Bölüm çizimi: sürüklenen dikdörtgen o bölümün alanı olur
    if (bolumCiz !== null && drag?.tip === 'yeni') {
      if (drag.r.w > 20 && drag.r.h > 20) setAlanlar(m => new Map(m).set(bolumCiz, toKutu(drag.r)));
      setBolumCiz(null);
      setDrag(null);
      return;
    }
    if (drag?.tip === 'yeni' && drag.r.w > 5 && drag.r.h > 12) {
      const id = newId();
      setList(l => [...l, { id, ad: null, yazar: null, kutu: toKutu(drag.r), kapak: null, ozet: null, notlar: [], alintilar: [], durum: 'okunacak', elle: true }]);
      setSel(id);
      setTimeout(() => nameRef.current?.focus(), 30);
    }
    setDrag(null);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && sel) { e.stopPropagation(); e.preventDefault(); remove(sel); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  const save = async () => {
    setSaving(true);
    try {
      await p.onSave(list, alanlar.size ? [...alanlar].map(([id, alan]) => ({ id, alan })) : undefined);
      setEdits(null); setAlanlar(new Map());
    } finally { setSaving(false); }
  };

  const placed = list.filter(b => b.kutu);
  const belirsiz = placed.filter(b => !b.ad).length;
  const yersiz = list.length - placed.length;
  const cur = list.find(b => b.id === sel) ?? null;

  return (
    <div className={'lbe' + (bolumCiz !== null ? ' bolum-ciz' : '')} onPointerMove={onMove} onPointerUp={onUp}>
      <svg className="lbe-svg" width={p.W} height={p.H} onPointerDown={e => onDown(e)}>
        {p.bolumler.map(b => {
          const a = alanOf(b);
          if (!a) return null;
          const r = toRect(a);
          return (
            <g key={`b${b.id}`} className="lbe-bolum">
              <rect x={r.x} y={r.y} width={r.w} height={r.h} />
              <text x={r.x + 8} y={r.y + 18}>B{b.id} · {b.ad}{b.liste.length ? ` · ${b.liste.filter(x => x.ad).length} kitap listede` : ' · fotoğraf yok'}</text>
            </g>
          );
        })}
        {placed.map(b => {
          const r = toRect(b.kutu!);
          const on = b.id === sel;
          return (
            <g key={b.id} className={'lbe-box' + (b.ad ? '' : ' belirsiz') + (on ? ' on' : '')}>
              <rect x={r.x} y={r.y} width={r.w} height={r.h} onPointerDown={e => onDown(e, b.id)} />
              {r.w > 9 && (
                <text x={r.x + r.w / 2} y={r.y + 4} transform={`rotate(90 ${r.x + r.w / 2} ${r.y + 4})`} dominantBaseline="middle">
                  {(b.ad || '?').slice(0, Math.max(2, Math.floor((r.h - 8) / 6.2)))}
                </text>
              )}
              {on && [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]].map(([cx, cy], i) => (
                <circle key={i} cx={cx} cy={cy} r={6} className="lbe-h" onPointerDown={e => onDown(e, b.id, i)} />
              ))}
            </g>
          );
        })}
        {drag?.tip === 'yeni' && <rect className="lbe-new" x={drag.r.x} y={drag.r.y} width={drag.r.w} height={drag.r.h} />}
      </svg>

      <aside className="lbe-panel" onPointerDown={e => e.stopPropagation()}>
        <header>
          <b>KİTAPLIK AYARI</b>
          <span>{placed.length - belirsiz} tanındı · {belirsiz} belirsiz{yersiz ? ` · ${yersiz} kayıtlı kitabın rafta yeri yok` : ''}</span>
        </header>
        {p.moved && <p className="lbe-warn">⚠ Kamera kıpırdamış: kutular kaymış olabilir, yeniden tarayın.</p>}
        <div className="lbe-row">
          <button className="el-btn" disabled={p.scanning} onClick={p.onScan}>{p.scanning ? 'Taranıyor…' : placed.length ? '⟳ Yeniden tara' : '⟳ Kitaplığı tara'}</button>
          <button className="el-btn on" disabled={!dirty || saving} onClick={save}>{saving ? 'Kaydediliyor…' : 'Kaydet'}</button>
          <button className="el-btn" onClick={p.onClose}>Kapat (K)</button>
        </div>
        {cur ? (
          <div className="lbe-form">
            <label>Kitabın adı</label>
            <input ref={nameRef} list="lbe-kayitli" value={cur.ad ?? ''} placeholder={unplaced.length ? 'yazın ya da kayıtlı kitaplardan seçin' : 'sırtta yazan ad'} onChange={e => setName(cur, e.target.value)} maxLength={160} />
            <datalist id="lbe-kayitli">{unplaced.map(b => <option key={b.id} value={b.ad!}>{b.yazar ?? ''}</option>)}</datalist>
            <label>Yazar</label>
            <input value={cur.yazar ?? ''} placeholder="isteğe bağlı" onChange={e => change(cur.id, { yazar: e.target.value || null })} maxLength={120} />
            <div className="lbe-row">
              <button className="el-btn" onClick={() => remove(cur.id)}>Kutuyu sil (Del)</button>
              <button className="el-btn" onClick={() => setSel(null)}>Bitti</button>
            </div>
          </div>
        ) : (
          <p className="lbe-hint">
            Boş bir yere sürükleyin: yeni kutu. Kutuyu sürükleyin: taşı. Köşeden: boyutlandır. Seçip <b>Del</b>: sil.
            Amber kesikli kutular belirsiz: tıklayıp adını yazın.
          </p>
        )}
        {belirsiz > 0 && (
          <div className="lbe-list">
            {placed.filter(b => !b.ad).slice(0, 24).map((b, i) => (
              <button key={b.id} className={b.id === sel ? 'on' : ''} onClick={() => { setSel(b.id); setTimeout(() => nameRef.current?.focus(), 30); }}>? belirsiz {i + 1}</button>
            ))}
            {belirsiz > 24 && <span className="lbe-hint">+{belirsiz - 24} belirsiz daha (kutusuna tıklayın)</span>}
          </div>
        )}
        <div className="lbe-bolumler">
          <label>Bölüm alanları <em>(tarama, belirsizleri bölüm listesiyle tamamlar)</em></label>
          <div className="lbe-row">
            {p.bolumler.map(b => (
              <button key={b.id} className={'el-btn' + (bolumCiz === b.id ? ' on' : '') + (alanOf(b) ? ' var' : '')} title={`${b.ad}: ${alanOf(b) ? 'alanı yeniden çiz' : 'alanını çiz'}`}
                onClick={() => { setSel(null); setBolumCiz(v => (v === b.id ? null : b.id)); }}>B{b.id}{alanOf(b) ? ' ✓' : ''}</button>
            ))}
          </div>
          {bolumCiz !== null && <p className="lbe-hint">Bölüm {bolumCiz}: rafın o bölümünü saran dikdörtgeni sürükleyerek çizin.</p>}
        </div>
        {p.demo && <p className="lbe-hint">Demo: değişiklikler sunucuya kaydedilmez.</p>}
      </aside>
    </div>
  );
}
