// Haber kaynakları: tek liste, elle düzenlenebilir. Haber Modu, "aydınlat beni" brifingi ve pano buradan okur.
//
// Düzenleme:
// - Kaynak eklemek: KAYNAKLAR'a { ad, cizgi, beslemeler: [{ url, kategori }] } ekleyin. `npm run test` her beslemeyi dener.
// - Kaynak çıkarmak: satırı silin ya da başına // koyun.
// - "cizgi" yalnızca listenin dengesini görmek içindir (her gruptan kaynak olsun diye). Ekranda ya da Jarvis'in
//   sözlerinde hiçbir kaynağa etiket olarak gösterilmez; Jarvis kaynakları değerlendirmez, yalnızca karşılaştırır.
// - Kategori: beslemenin kendi kategorisi. "gundem" beslemelerindeki haberlerin kategorisi bağlantı adresinden
//   ("/ekonomi/", "/dunya-haberleri/" …) tahmin edilir (news.ts → kategoriTahmin).
//
// Son kontrol (Ekim 2026, curl ile): aşağıdaki her besleme haber döndürdü.
// Çalışmayanlar (listede yok): T24 (t24.com.tr/rss 25 sn'de cevap vermiyor), Halk TV (bot isteklerini başka siteye
// yönlendiriyor), Amerika'nın Sesi (çalışan RSS adresi bulunamadı), Gazete Oksijen (RSS yok), Doğruluk Payı (RSS yok).

export type Kategori = 'gundem' | 'ekonomi' | 'dunya' | 'spor' | 'teknoloji' | 'bilim';
export const KATEGORILER: { id: Kategori; ad: string }[] = [
  { id: 'gundem', ad: 'Gündem' }, { id: 'ekonomi', ad: 'Ekonomi' }, { id: 'dunya', ad: 'Dünya' },
  { id: 'spor', ad: 'Spor' }, { id: 'teknoloji', ad: 'Teknoloji' }, { id: 'bilim', ad: 'Bilim' },
];

/** Yayın çizgisi grubu: yalnızca liste dengesi için (bkz. yukarı) */
export type Cizgi = 'kamu' | 'hukumete-yakin' | 'ana-akim' | 'muhalif' | 'bagimsiz' | 'uluslararasi' | 'bilim-teknoloji';

export interface Kaynak {
  ad: string;
  cizgi: Cizgi;
  beslemeler: { url: string; kategori: Kategori }[];
}

const tek = (url: string, kategori: Kategori = 'gundem') => [{ url, kategori }];

export const KAYNAKLAR: Kaynak[] = [
  // Kamu ve ajans
  { ad: 'Anadolu Ajansı', cizgi: 'kamu', beslemeler: [
    { url: 'https://www.aa.com.tr/tr/rss/default?cat=guncel', kategori: 'gundem' },
    { url: 'https://www.aa.com.tr/tr/rss/default?cat=ekonomi', kategori: 'ekonomi' },
    { url: 'https://www.aa.com.tr/tr/rss/default?cat=dunya', kategori: 'dunya' },
    { url: 'https://www.aa.com.tr/tr/rss/default?cat=spor', kategori: 'spor' },
    { url: 'https://www.aa.com.tr/tr/rss/default?cat=bilim-teknoloji', kategori: 'teknoloji' },
  ] },
  { ad: 'TRT Haber', cizgi: 'kamu', beslemeler: [
    { url: 'https://www.trthaber.com/manset_articles.rss', kategori: 'gundem' },
    { url: 'https://www.trthaber.com/ekonomi_articles.rss', kategori: 'ekonomi' },
    { url: 'https://www.trthaber.com/dunya_articles.rss', kategori: 'dunya' },
    { url: 'https://www.trthaber.com/spor_articles.rss', kategori: 'spor' },
    { url: 'https://www.trthaber.com/bilim_teknoloji_articles.rss', kategori: 'teknoloji' },
  ] },
  // Hükümete yakın
  { ad: 'Sabah', cizgi: 'hukumete-yakin', beslemeler: [
    { url: 'https://www.sabah.com.tr/rss/gundem.xml', kategori: 'gundem' },
    { url: 'https://www.sabah.com.tr/rss/ekonomi.xml', kategori: 'ekonomi' },
    { url: 'https://www.sabah.com.tr/rss/dunya.xml', kategori: 'dunya' },
    { url: 'https://www.sabah.com.tr/rss/spor.xml', kategori: 'spor' },
  ] },
  { ad: 'A Haber', cizgi: 'hukumete-yakin', beslemeler: tek('https://www.ahaber.com.tr/rss/gundem.xml') },
  { ad: 'Yeni Şafak', cizgi: 'hukumete-yakin', beslemeler: [
    { url: 'https://www.yenisafak.com/rss?xml=gundem', kategori: 'gundem' },
    { url: 'https://www.yenisafak.com/rss?xml=ekonomi', kategori: 'ekonomi' },
    { url: 'https://www.yenisafak.com/rss?xml=dunya', kategori: 'dunya' },
  ] },
  // Ana akım
  { ad: 'Hürriyet', cizgi: 'ana-akim', beslemeler: [
    { url: 'https://www.hurriyet.com.tr/rss/gundem', kategori: 'gundem' },
    { url: 'https://www.hurriyet.com.tr/rss/ekonomi', kategori: 'ekonomi' },
    { url: 'https://www.hurriyet.com.tr/rss/dunya', kategori: 'dunya' },
    { url: 'https://www.hurriyet.com.tr/rss/spor', kategori: 'spor' },
    { url: 'https://www.hurriyet.com.tr/rss/teknoloji', kategori: 'teknoloji' },
  ] },
  { ad: 'Milliyet', cizgi: 'ana-akim', beslemeler: tek('https://www.milliyet.com.tr/rss/rssnew/gundemrss.xml') },
  { ad: 'CNN Türk', cizgi: 'ana-akim', beslemeler: tek('https://www.cnnturk.com/feed/rss/all/news') },
  { ad: 'NTV', cizgi: 'ana-akim', beslemeler: [
    { url: 'https://www.ntv.com.tr/turkiye.rss', kategori: 'gundem' },
    { url: 'https://www.ntv.com.tr/ekonomi.rss', kategori: 'ekonomi' },
    { url: 'https://www.ntv.com.tr/dunya.rss', kategori: 'dunya' },
    { url: 'https://www.ntv.com.tr/teknoloji.rss', kategori: 'teknoloji' },
    { url: 'https://www.ntv.com.tr/saglik.rss', kategori: 'bilim' },
  ] },
  { ad: 'Habertürk', cizgi: 'ana-akim', beslemeler: [
    { url: 'https://www.haberturk.com/rss', kategori: 'gundem' },
    { url: 'https://www.haberturk.com/rss/ekonomi.xml', kategori: 'ekonomi' },
    { url: 'https://www.haberturk.com/rss/dunya.xml', kategori: 'dunya' },
    { url: 'https://www.haberturk.com/rss/spor.xml', kategori: 'spor' },
    { url: 'https://www.haberturk.com/rss/teknoloji.xml', kategori: 'teknoloji' },
  ] },
  // Muhalif
  { ad: 'Sözcü', cizgi: 'muhalif', beslemeler: [
    { url: 'https://www.sozcu.com.tr/feeds-rss-category-gundem', kategori: 'gundem' },
    { url: 'https://www.sozcu.com.tr/feeds-rss-category-ekonomi', kategori: 'ekonomi' },
    { url: 'https://www.sozcu.com.tr/feeds-rss-category-dunya', kategori: 'dunya' },
    { url: 'https://www.sozcu.com.tr/feeds-rss-category-spor', kategori: 'spor' },
  ] },
  { ad: 'Cumhuriyet', cizgi: 'muhalif', beslemeler: [
    { url: 'https://www.cumhuriyet.com.tr/rss/son_dakika.xml', kategori: 'gundem' },
    { url: 'https://www.cumhuriyet.com.tr/rss/ekonomi.xml', kategori: 'ekonomi' },
    { url: 'https://www.cumhuriyet.com.tr/rss/dunya.xml', kategori: 'dunya' },
    { url: 'https://www.cumhuriyet.com.tr/rss/spor.xml', kategori: 'spor' },
    { url: 'https://www.cumhuriyet.com.tr/rss/bilim-teknoloji.xml', kategori: 'teknoloji' },
  ] },
  { ad: 'BirGün', cizgi: 'muhalif', beslemeler: tek('https://www.birgun.net/rss/home') },
  { ad: 'Evrensel', cizgi: 'muhalif', beslemeler: tek('https://www.evrensel.net/rss/haber.xml') },
  { ad: 'Karar', cizgi: 'muhalif', beslemeler: tek('https://www.karar.com/service/rss.php') },
  // Bağımsız
  { ad: 'Medyascope', cizgi: 'bagimsiz', beslemeler: tek('https://medyascope.tv/feed/') },
  { ad: 'bianet', cizgi: 'bagimsiz', beslemeler: tek('https://bianet.org/rss/bianet') },
  { ad: 'Diken', cizgi: 'bagimsiz', beslemeler: tek('https://www.diken.com.tr/feed/') },
  // Uluslararası Türkçe servisler
  { ad: 'BBC Türkçe', cizgi: 'uluslararasi', beslemeler: tek('https://feeds.bbci.co.uk/turkce/rss.xml') },
  { ad: 'DW Türkçe', cizgi: 'uluslararasi', beslemeler: tek('https://rss.dw.com/rdf/rss-tur-all') },
  { ad: 'Euronews Türkçe', cizgi: 'uluslararasi', beslemeler: tek('https://tr.euronews.com/rss') },
  { ad: 'Independent Türkçe', cizgi: 'uluslararasi', beslemeler: tek('https://www.indyturk.com/rss.xml') },
  { ad: 'Sputnik Türkiye', cizgi: 'uluslararasi', beslemeler: tek('https://sputniknews.com.tr/export/rss2/archive/index.xml') },
  // Bilim ve teknoloji
  { ad: 'Evrim Ağacı', cizgi: 'bilim-teknoloji', beslemeler: tek('https://evrimagaci.org/rss.xml', 'bilim') },
  { ad: 'Webtekno', cizgi: 'bilim-teknoloji', beslemeler: tek('https://www.webtekno.com/rss.xml', 'teknoloji') },
];

/** Bağımsız doğrulama kuruluşlarının beslemeleri (iddia kontrolünde ilgili analiz bağlantısı için) */
export const DOGRULAMA_BESLEMELERI: { ad: string; url: string }[] = [
  { ad: 'Teyit', url: 'https://teyit.org/feed' },
  { ad: 'Malumatfuruş', url: 'https://www.malumatfurus.org/feed/' },
];

/** Düz besleme listesi (news.ts ve `npm run test` için) */
export const FEEDS: { source: string; url: string; category: Kategori }[] = KAYNAKLAR.flatMap(k => k.beslemeler.map(b => ({ source: k.ad, url: b.url, category: b.kategori })));
