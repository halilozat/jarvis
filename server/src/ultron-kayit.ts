// Ultron Paketi · kayıt komutu. Kareler tarayıcıda (WebGL) deterministik çizilir; bu komut kayıt sayfasını açar ve bitmesini
// bekler. Jarvis sunucusu (npm run dev) açık olmalı.
//   npm run ultron:kayit -- --ultron-record=war  [--aspect=9:16] [--final=B]
//   npm run ultron:kayit -- --ultron-record=eye  [--aspect=16:9] [--snapshot=<klasör>]   (aynı rakamlarla tekrar)
//   npm run ultron:kayit -- --ultron-record=full [--aspect=9:16]
//   npm run ultron:kayit -- --ultron-preview t=28.5 [--aspect=9:16]                        (tek kare)
// Çıktı: server/data/ultron-kayit/<tarih>-<mod>-<oran>/ → kareler/kare_00000.png…, seslendirme.wav, muzik.wav, efekt.wav,
// karisim.wav, kayit.json (+ snapshot.json, anlatim.json; ffmpeg varsa ultron.mp4).
import 'dotenv/config';
import { spawn } from 'node:child_process';

const arg = (ad: string) => {
  const i = process.argv.findIndex(a => a === `--${ad}` || a.startsWith(`--${ad}=`));
  if (i < 0) return null;
  const a = process.argv[i];
  return a.includes('=') ? a.slice(a.indexOf('=') + 1) : process.argv[i + 1] ?? '';
};
const mod = arg('ultron-record');
const onizleme = arg('ultron-preview')?.replace(/^t=/, '') ?? null;
const oran = arg('aspect') ?? process.env.ULTRON_ASPECT ?? '9:16';
if (!mod && onizleme == null) { console.log('Kullanım: npm run ultron:kayit -- --ultron-record=war|eye|full [--aspect=9:16|16:9] [--snapshot=<klasör>] | --ultron-preview t=28.5'); process.exit(1); }
if (mod && !['war', 'eye', 'full'].includes(mod)) { console.error(`Bilinmeyen kayıt modu: ${mod}`); process.exit(1); }

const WEB = process.env.ULTRON_KAYIT_ADRES || 'http://localhost:5173';
const API = `http://localhost:${process.env.PORT || 8787}`;
const q = new URLSearchParams({ 'ultron-record': mod ?? 'war', aspect: oran });
if (onizleme != null) q.set('ultron-preview', onizleme);
if (arg('snapshot')) q.set('snapshot', arg('snapshot')!);
if (arg('final')) q.set('ultron-final', arg('final')!);
const url = `${WEB}/?${q}`;
const baslik = process.env.ACCESS_TOKEN ? { 'x-jarvis-token': process.env.ACCESS_TOKEN } : undefined; // yalnızca yerel istek; yazdırılmaz

const son = async () => (await fetch(`${API}/api/ultron/kayit/son`, { headers: baslik }).then(r => r.json()).catch(() => ({ son: null }))) as { son: string | null; bitti: boolean; bilgi: any };
const once = await son();
console.log(`Kayıt sayfası açılıyor: ${url}\n(Erişim anahtarı soruluyorsa tarayıcıda bir kez girin; kayıt sekmesini açık tutun.)`);
spawn(process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open', [url], { stdio: 'ignore', detached: true, shell: process.platform === 'win32' }).unref();
const t0 = Date.now();
for (;;) {
  await new Promise(r => setTimeout(r, 3000));
  const s = await son();
  if (s.son && s.son !== once.son && s.bitti) {
    console.log(`✓ Kayıt bitti: server/data/ultron-kayit/${s.son}`);
    if (s.bilgi?.kare) console.log(`  ${s.bilgi.kare} kare · ${Number(s.bilgi.sure).toFixed(1)} sn · ${s.bilgi.fps} fps · ${s.bilgi.oran}`);
    process.exit(0);
  }
  if (Date.now() - t0 > 30 * 60_000) { console.error('Zaman aşımı (30 dk): kayıt sekmesini kontrol edin.'); process.exit(1); }
}
