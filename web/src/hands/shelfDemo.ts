// Kitaplık demosu (?el=demo&kitaplik=1): kamera yokken arka plana prosedürel bir kitaplık çizilir ve sahte bir kamera
// akışı olarak <video>'ya verilir. Böylece kırpma, tarama ve kamera kıpırdadı kontrolü gerçek kamerayla aynı yoldan geçer.
// Kitaplar gerçek bir ev kitaplığından örnekler, raf raf.
import type { Kitap, Kutu } from '../lib/library';

export const DEMO_W = 1920;
export const DEMO_H = 1080;

type Stil = 'krem' | 'renk' | 'koyu' | 'kagit';
interface DemoBook { ad: string; yazar: string; renk: string; yazi?: string; stil?: Stil; kalin?: number; boy?: number; belirsiz?: boolean }

const HAY = (ad: string, yazar: string, kalin = 1): DemoBook => ({ ad, yazar, renk: '#ece3cf', yazi: '#2a2622', stil: 'krem', kalin, boy: 0.93 });
const SAP = (ad: string): DemoBook => ({ ad, yazar: 'Andrzej Sapkowski', renk: '#c0151d', yazi: '#f6efe2', kalin: 1.25, boy: 0.97 });
const AYN = (ad: string, renk: string, kalin = 1.15): DemoBook => ({ ad, yazar: 'Ayn Rand', renk, yazi: '#ffcf4a', kalin, boy: 0.9 });
const AGA = (ad: string, renk = '#1d2a3a'): DemoBook => ({ ad, yazar: 'Agatha Christie', renk, yazi: '#e8e0cc', stil: 'koyu', kalin: 0.8, boy: 0.82 });

/** Raf raf (fotoğraflardaki sırayla). Her raf soldan sağa. */
export const DEMO_SHELVES: DemoBook[][] = [
  [
    SAP('Son Dilek'), SAP('Kader Kılıcı'), SAP('Elflerin Kanı'), SAP('Nefret Çağı'), SAP('Ateşle İmtihan'), SAP('Kırlangıç Kulesi'),
    { ad: 'Nutuk', yazar: 'Mustafa Kemal Atatürk', renk: '#9c1f24', yazi: '#fff4e0', kalin: 1.5, boy: 0.84 },
    { ad: 'Şu Çılgın Türkler', yazar: 'Turgut Özakman', renk: '#f2ece4', yazi: '#5b2a7a', stil: 'kagit', kalin: 1.25, boy: 0.86 },
    { ad: 'Sınıf Arkadaşım Atatürk', yazar: 'Ali Fuat Cebesoy', renk: '#1e3e6e', yazi: '#f0e6d0', kalin: 0.85, boy: 0.84 },
    { ad: 'Hangi Atatürk', yazar: 'Attilâ İlhan', renk: '#151515', yazi: '#e83a2e', kalin: 0.95, boy: 0.84 },
    { ad: 'Da Vinci Şifresi', yazar: 'Dan Brown', renk: '#b3171c', yazi: '#f3d7a0', kalin: 1.35, boy: 0.88 },
    { ad: 'İnsan Geleceğini Nasıl Kurar?', yazar: 'İlber Ortaylı', renk: '#181818', yazi: '#f0a92b', kalin: 0.95, boy: 0.86 },
    { ad: 'Hayatım', yazar: 'Kazım Karabekir', renk: '#ece8df', yazi: '#2b2b2b', stil: 'kagit', kalin: 1.1, boy: 0.9 },
  ],
  [
    { ad: 'Körlük', yazar: 'José Saramago', renk: '#f4d21c', yazi: '#1a1a1a', kalin: 1.05, boy: 0.84 },
    { ad: '1984', yazar: 'George Orwell', renk: '#1a1a1a', yazi: '#f4f0e6', kalin: 0.95, boy: 0.84 },
    { ad: 'Hesaplaşma', yazar: 'Trevanian', renk: '#f2d024', yazi: '#2d2d2d', kalin: 1.1, boy: 0.86 },
    { ad: 'Sevme Sanatı', yazar: 'Erich Fromm', renk: '#f0c419', yazi: '#2b2b2b', kalin: 0.7, boy: 0.84 },
    { ad: 'Mülksüzler', yazar: 'Ursula K. Le Guin', renk: '#1b4d8c', yazi: '#f5ecd8', kalin: 1.0, boy: 0.84 },
    { ad: 'Tahıla Karşı', yazar: 'James C. Scott', renk: '#f2c230', yazi: '#2b2420', kalin: 0.95, boy: 0.86 },
    { ad: 'Devlet Gibi Görmek', yazar: 'James C. Scott', renk: '#1d56b8', yazi: '#f6f1e4', kalin: 1.3, boy: 0.9 },
    { ad: 'Canlı Devre', yazar: 'David Eagleman', renk: '#1c1c1c', yazi: '#f2f2f2', kalin: 0.95, boy: 0.86 },
    { ad: 'Geleceği Kurgulamak', yazar: 'Noam Chomsky', renk: '#f2efe8', yazi: '#c0262b', stil: 'kagit', kalin: 0.85, boy: 0.86 },
    { ad: 'Ateşi Yakalamak', yazar: 'Suzanne Collins', renk: '#c92727', yazi: '#f8e9d2', kalin: 1.0, boy: 0.86 },
    { ad: 'İçindeki Devi Uyandır', yazar: 'Anthony Robbins', renk: '#173a7a', yazi: '#f2f2f2', kalin: 1.25, boy: 0.9 },
    { ad: 'Bunu Herkes Bilir', yazar: 'Emrah Safa Gürkan', renk: '#f39a1e', yazi: '#2a2a2a', kalin: 0.85, boy: 0.86 },
    { ad: 'Zengin Baba Yoksul Baba', yazar: 'Robert T. Kiyosaki', renk: '#6a2c8c', yazi: '#f6e05e', kalin: 0.85, boy: 0.86 },
    { ad: 'Denizler Altında Yirmi Bin Fersah', yazar: 'Jules Verne', renk: '#2a6d8f', yazi: '#f4e9c8', kalin: 1.15, boy: 0.82 },
    { ad: 'Kaptan Grant\'ın Çocukları', yazar: 'Jules Verne', renk: '#2f7fc1', yazi: '#ffe27a', kalin: 1.1, boy: 0.82 },
    { ad: 'Havadaki Köy', yazar: 'Jules Verne', renk: '#2b2b2b', yazi: '#ffe27a', kalin: 0.75, boy: 0.82 },
    { ad: 'İnatçı Keraban', yazar: 'Jules Verne', renk: '#b8322f', yazi: '#ffe27a', kalin: 1.05, boy: 0.82 },
  ],
  [
    { ad: 'Leonardo da Vinci', yazar: 'Walter Isaacson', renk: '#2d1a0e', yazi: '#e9c27d', kalin: 1.6, boy: 0.98 },
    { ad: 'Liderlik', yazar: 'Acar Baltaş', renk: '#e9e9ea', yazi: '#2f2f2f', stil: 'kagit', kalin: 0.7, boy: 0.84 },
    { ad: 'Pür Dikkat', yazar: 'Nir Eyal & Julie Li', renk: '#f05a28', yazi: '#ffffff', kalin: 0.85, boy: 0.86 },
    { ad: 'Hayalini Yorganına Göre Uzat', yazar: 'Acar Baltaş', renk: '#4d6a8a', yazi: '#f7d36a', kalin: 0.75, boy: 0.86 },
    { ad: 'Einstein Seyahatnamesi', yazar: 'Albert Einstein', renk: '#132544', yazi: '#f3ead6', kalin: 0.95, boy: 0.86 },
    { ad: 'Hay bin Yakzan', yazar: 'İbn Tufeyl', renk: '#1b1b1b', yazi: '#e9e2d2', kalin: 0.65, boy: 0.84 },
    { ad: 'Son Yıllarım', yazar: 'Albert Einstein', renk: '#6f6f72', yazi: '#f1f1f1', kalin: 0.9, boy: 0.88 },
    { ad: 'Para Kurdunun Zihninde', yazar: 'Robert G. Hagstrom', renk: '#141414', yazi: '#f2f2f2', kalin: 1.05, boy: 0.88 },
    { ad: 'Kahve Soğumadan Önce', yazar: 'Toshikazu Kawaguchi', renk: '#ece3d3', yazi: '#7a4a2a', stil: 'kagit', kalin: 0.8, boy: 0.84 },
    { ad: 'İmkânsızın Şarkısı', yazar: 'Haruki Murakami', renk: '#e8462b', yazi: '#fbf3e6', kalin: 0.95, boy: 0.86 },
    { ad: 'Kırmızı Saçlı Kadın', yazar: 'Orhan Pamuk', renk: '#d62650', yazi: '#fff0f2', kalin: 0.8, boy: 0.86 },
    { ad: 'Faust', yazar: 'Goethe', renk: '#c9273a', yazi: '#f7ead6', kalin: 0.9, boy: 0.86 },
    { ad: 'Hayvan Çiftliği', yazar: 'George Orwell', renk: '#efe9de', yazi: '#2a2a2a', stil: 'kagit', kalin: 0.6, boy: 0.84 },
  ],
  [
    HAY('Savaş ve Barış I', 'Tolstoy', 1.5), HAY('Savaş ve Barış II', 'Tolstoy', 1.5), HAY('Monte Cristo Kontu I', 'Alexandre Dumas', 1.3),
    HAY('Monte Cristo Kontu II', 'Alexandre Dumas', 1.3), HAY('David Copperfield', 'Charles Dickens', 1.5),
    HAY('Babalar ve Oğullar', 'Turgenyev'), HAY('Sefiller', 'Victor Hugo', 1.2), HAY('İvan İlyiç\'in Ölümü', 'Tolstoy', 0.7),
    HAY('Önemsiz Bir Kadın', 'Oscar Wilde', 0.7), HAY('Sokrates\'in Savunması', 'Platon', 0.75),
    { ad: 'Otostopçunun Galaksi Rehberi', yazar: 'Douglas Adams', renk: '#1d2f57', yazi: '#f5f0e2', kalin: 1.7, boy: 0.98 },
    { ad: 'Sherlock Holmes', yazar: 'Arthur Conan Doyle', renk: '#ece4d0', yazi: '#7a5a22', stil: 'kagit', kalin: 1.9, boy: 0.98 },
    { ad: 'Gündelik Hayatımızın Tarihi', yazar: 'Kudret Emiroğlu', renk: '#f39a1b', yazi: '#2a1b0b', kalin: 1.55, boy: 0.98 },
    HAY('Oblomov', 'Gonçarov', 1.4),
    HAY('İki Şehrin Hikâyesi', 'Charles Dickens', 1.2), HAY('Anna Karenina', 'Tolstoy', 1.6),
    { ad: 'Karamazov Kardeşler', yazar: 'Dostoyevski', renk: '#ece3cf', yazi: '#2a2622', stil: 'krem', kalin: 1.5, boy: 0.93, belirsiz: true },
    HAY('Devlet', 'Platon', 1.3), HAY('Böyle Söyledi Zerdüşt', 'Nietzsche', 1.1), HAY('İnsan Neyle Yaşar?', 'Tolstoy', 0.55),
  ],
  [
    AYN('Atlas Vazgeçti 1', '#a3182a'), AYN('Atlas Vazgeçti 2', '#a3182a'), AYN('Atlas Vazgeçti 3', '#a3182a'), AYN('Hayatın Kaynağı', '#1f6f8b', 1.35),
    AYN('Yaşamak İstiyorum', '#8c1a3a', 1.2), AYN('Bencilliğin Erdemi', '#6b3a1c', 0.6), AYN('İdeal', '#3a1f4d', 0.7),
    AYN('Kapitalizm: Bilinmeyen İdeal', '#1d8a4a', 1.05), AYN('İş Adamları İçin Felsefe', '#7a1d63', 1.0),
    AGA('On Kişiydiler'), AGA('Doğu Ekspresinde Cinayet', '#26343f'), AGA('Acı Kahve', '#3b2420'), AGA('16.50 Treni', '#5a1717'), AGA('Beş Küçük Domuz', '#3a1414'),
    AGA('Üç Perdelik Cinayet', '#2a2030'), AGA('Noel\'de Cinayet', '#1f3b2c'), AGA('Beklenmeyen Misafir', '#1e2433'),
    { ad: 'Kuyucaklı Yusuf', yazar: 'Sabahattin Ali', renk: '#151515', yazi: '#f0e9da', kalin: 0.75, boy: 0.84 },
    { ad: 'İçimizdeki Şeytan', yazar: 'Sabahattin Ali', renk: '#151515', yazi: '#f0e9da', kalin: 0.75, boy: 0.84 },
    { ad: 'Sırça Köşk', yazar: 'Sabahattin Ali', renk: '#151515', yazi: '#f0e9da', kalin: 0.6, boy: 0.84 },
    { ad: 'Oyunbaz', yazar: 'Wulf Dorn', renk: '#3b4650', yazi: '#e9edf0', kalin: 1.1, boy: 0.88 },
    { ad: 'Yüzük Kardeşliği', yazar: 'J.R.R. Tolkien', renk: '#1d4a2e', yazi: '#efe6c8', kalin: 1.2, boy: 0.92 },
    { ad: 'İki Kule', yazar: 'J.R.R. Tolkien', renk: '#1d4a2e', yazi: '#efe6c8', kalin: 1.1, boy: 0.92 },
    { ad: 'Kralın Dönüşü', yazar: 'J.R.R. Tolkien', renk: '#1d4a2e', yazi: '#efe6c8', kalin: 1.15, boy: 0.92 },
    { ad: 'Kırmızı ve Siyah', yazar: 'Stendhal', renk: '#8c1c22', yazi: '#f2d899', kalin: 1.3, boy: 0.95, belirsiz: true },
    { ad: 'Goriot Baba', yazar: 'Honoré de Balzac', renk: '#7d1a20', yazi: '#f2d899', kalin: 1.1, boy: 0.95 },
  ],
];

/** Demo kitapların özetleri ve notları (açılan sayfalarda görünür) */
const DEMO_OZET: Record<string, { ozet: string; notlar?: string[]; alintilar?: string[]; durum?: Kitap['durum']; sayfa?: number; toplam?: number; jarvis?: Omit<NonNullable<Kitap['jarvis']>, 'at'> }> = {
  'Otostopçunun Galaksi Rehberi': {
    ozet: 'Dünya bir otoyol yapımı için yıkılmadan hemen önce Arthur Dent, uzaylı arkadaşı Ford Prefect sayesinde bir uzay gemisine otostop çeker. Galaksiyi dolaşan bu absürt yolculuk, hayatın anlamını arayan insanlığı tatlı bir alayla tiye alır. Bilimkurguyu bu kadar komik okuyabileceğinizi gösteren bir klasik.',
    notlar: ['Havlu her zaman yanında olsun: en kullanışlı eşya.', '42: cevap kadar doğru soruyu bilmek de önemli.'],
    alintilar: ['Panik yapma.'],
    durum: 'bitti', sayfa: 640, toplam: 640,
    jarvis: {
      tur: 'bilimkurgu, mizah', yil: 1979,
      anaFikirler: [
        'Evren bürokrasiyle, kayıtsızlıkla ve saçmalıkla doludur; Adams bunu büyük felsefi sorularla dalga geçerek anlatır.',
        'Arthur Dent sıradan, şaşkın bir insandır; olağanüstü olaylara verdiği sıradan tepkiler mizahın kaynağıdır.',
        'Rehber, galaksideki her şeyi bilen ama çoğu zaman işe yaramayan bir ansiklopedidir: bilginin sınırları üstüne bir şaka.',
        '"Hayatın, evrenin ve her şeyin cevabı" sorusu, doğru soruyu bilmeden cevabın anlamsız olduğunu gösterir.',
        'Teknoloji insanı kurtarmaz: kapılar iç çeker, asansörler bunalıma girer, robotlar depresyondadır.',
        'Arkadaşlık ve havlu gibi küçük şeyler, kaotik bir evrende tutunulacak en sağlam dallardır.',
      ],
      yazarHakkinda: 'Douglas Adams (1952-2001) İngiliz yazar ve senarist. Seri önce BBC radyo dizisi olarak doğdu, sonra romana, diziye ve filme dönüştü. Teknolojiye meraklıydı; erken bir Mac kullanıcısıydı.',
      temalar: ['absürt mizah', 'anlam arayışı', 'bürokrasi', 'teknoloji', 'dostluk'],
      nedenOku: 'Ağır soruları gülümseterek düşündürür. Kısa bölümleri ve hızlı temposuyla bilimkurguya yeni başlayanlar için ideal bir kapı.',
      kimeUygun: 'Mizahı ve bilimkurguyu sevenlere, "42" esprisini anlamak isteyenlere.',
      benzer: ['1984', 'Mülksüzler', 'Körlük'],
    },
  },
  'Anna Karenina': {
    ozet: 'Moskova ve Petersburg sosyetesinde Anna\'nın tutkulu ama yıkıcı aşkı ile Levin\'in sade hayatta anlam arayışı paralel ilerler. Tolstoy evliliği, toplumun ikiyüzlülüğünü ve mutluluğun ne olduğunu derinlemesine sorgular. Karakter psikolojisinin en ustalıklı örneklerinden biri.',
    alintilar: ['Bütün mutlu aileler birbirine benzer; her mutsuz ailenin kendine özgü bir mutsuzluğu vardır.'],
    durum: 'okunuyor', sayfa: 312, toplam: 864,
  },
  'Mülksüzler': {
    ozet: 'Fizikçi Shevek, mülkiyetin olmadığı anarşist Anarres\'ten zengin ama eşitsiz kardeş gezegen Urras\'a giden ilk kişidir. İki toplumun karşılaştırması özgürlük, sahiplik ve dayanışma üzerine güçlü bir düşünce deneyine dönüşür. Ütopyanın kusurlarını da dürüstçe gösteren bir bilimkurgu.',
    notlar: ['Anarres\'teki dil: "benim" yerine "kullandığım" denmesi.'],
    durum: 'okunacak',
  },
  'Tahıla Karşı': {
    ozet: 'James C. Scott, tahıl tarımının ve ilk devletlerin insanlık için sanıldığı kadar parlak bir ilerleme olmadığını savunur. Kayıt tutma, vergi ve zorunlu emeğin tahılla nasıl iç içe geçtiğini arkeolojik bulgularla anlatır. Uygarlık hikâyesine alışılmadık bir açıdan bakmak isteyenler için.',
    durum: 'okunuyor', sayfa: 96, toplam: 280,
  },
  'Körlük': {
    ozet: 'İsimsiz bir şehirde insanlar açıklanamayan beyaz bir körlüğe yakalanır ve karantinaya alınır. Düzen çöktükçe insanın en karanlık ve en şefkatli yanları aynı anda ortaya çıkar. Saramago\'nun alışılmadık anlatımıyla toplum üzerine sarsıcı bir alegori.',
    durum: 'bitti',
  },
  '1984': {
    ozet: 'Winston Smith, her şeyi gözetleyen Büyük Birader\'in yönettiği Okyanusya\'da gerçeği yeniden yazan bir memurdur. Yasak bir aşk ve küçük bir isyan, onu düşünce polisinin karşısına çıkarır. Gözetim ve dil üzerine yazılmış en etkili romanlardan biri.',
    durum: 'bitti',
  },
  'Yüzük Kardeşliği': {
    ozet: 'Hobbit Frodo, karanlık lord Sauron\'un güç yüzüğünü yok etmek için Orta Dünya\'yı aşan tehlikeli bir yolculuğa çıkar. Dostluk, fedakârlık ve gücün yozlaştırıcılığı destansı bir macerayla anlatılır. Modern fantastik edebiyatın temel taşı.',
    durum: 'bitti',
  },
  'Leonardo da Vinci': {
    ozet: 'Walter Isaacson, Leonardo\'nun defterlerinden yola çıkarak onun merakla dolu zihnini adım adım izler. Sanat, anatomi, mühendislik ve gözlem arasındaki bağlantılar yaratıcılığın nasıl çalıştığını gösterir. Merakın bir süper güç olduğunu hatırlatan bir biyografi.',
    notlar: ['Defter tutma alışkanlığı: her fikri hemen yaz.'],
    durum: 'okunuyor', sayfa: 210, toplam: 600,
  },
};

const rnd = (seed: number) => { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };

/** Kitapların ekran düzeni (okunur yön, yani AYNADAN SONRA görünen) — karede x aynalanır */
interface Placed { b: DemoBook; x: number; y: number; w: number; h: number; raf: number }

interface Deco { raf: number; x: number; x1: number; base: number; maxH: number; kind: number }

function layout(): { placed: Placed[]; shelves: { y: number; x0: number; x1: number }[]; decos: Deco[] } {
  const x0 = 70, x1 = DEMO_W - 70;
  const top = 70, bottom = DEMO_H - 40;
  const n = DEMO_SHELVES.length;
  const gap = (bottom - top) / n;
  const placed: Placed[] = [];
  const decos: Deco[] = [];
  const shelves: { y: number; x0: number; x1: number }[] = [];
  const r = rnd(7);
  DEMO_SHELVES.forEach((row, i) => {
    const base = top + gap * (i + 1) - 14; // raf tahtasının üstü
    shelves.push({ y: base, x0, x1 });
    const maxH = gap - 30;
    // Raf boyunca doldur (üç dolap gövdesi; bölmelerin üstüne kitap gelmez), sonda biraz boşluk kalsın
    const dividers = [DEMO_W / 3, (DEMO_W * 2) / 3];
    const total = row.reduce((s, b) => s + (b.kalin ?? 1), 0);
    const space = x1 - x0 - 40 - dividers.length * 30 - (i % 2 ? 90 : 40);
    const unit = Math.min(60, space / total);
    let x = x0 + 14 + (i % 2 ? 30 : 6);
    for (const b of row) {
      const w = (b.kalin ?? 1) * unit;
      for (const d of dividers) if (x + w > d - 11 && x < d + 11) x = d + 13;
      const h = maxH * (b.boy ?? 0.9) * (0.97 + r() * 0.03);
      placed.push({ b, x, y: base - h, w: w - 2, h, raf: i });
      x += w;
    }
    decos.push({ raf: i, x: x + 24, x1: x1 - 16, base, maxH, kind: i });
  });
  return { placed, shelves, decos };
}

function drawSpine(g: CanvasRenderingContext2D, p: Placed) {
  const { b, x, y, w, h } = p;
  // Gövde: hafif silindirik gölge
  const gr = g.createLinearGradient(x, 0, x + w, 0);
  gr.addColorStop(0, shade(b.renk, -0.28));
  gr.addColorStop(0.18, shade(b.renk, 0.06));
  gr.addColorStop(0.55, b.renk);
  gr.addColorStop(1, shade(b.renk, -0.35));
  g.fillStyle = gr;
  g.fillRect(x, y, w, h);
  if (b.stil === 'krem') {
    // Hasan Âli Yücel Klasikler: üstte siyah etiket bandı, altta logo
    g.fillStyle = '#1d1b19';
    g.fillRect(x + 1, y + h * 0.07, w - 2, h * 0.15);
    g.fillStyle = '#b89b52';
    g.fillRect(x + 1, y + h * 0.065, w - 2, 2); g.fillRect(x + 1, y + h * 0.22, w - 2, 2);
    g.fillStyle = '#efe6cf';
    g.font = `600 ${Math.min(10, w * 0.22)}px Georgia, serif`;
    g.textAlign = 'center';
    g.fillText('HASAN', x + w / 2, y + h * 0.11);
    g.fillText('ÂLİ YÜCEL', x + w / 2, y + h * 0.15);
    g.fillStyle = '#1d1b19';
    g.fillRect(x + 1, y + h * 0.66, w - 2, 5);
    g.beginPath(); g.arc(x + w / 2, y + h * 0.92, Math.min(7, w * 0.22), 0, Math.PI * 2); g.strokeStyle = '#2a2622'; g.lineWidth = 1.2; g.stroke();
  } else if (b.stil === 'koyu') {
    g.fillStyle = 'rgba(255,255,255,0.08)';
    g.fillRect(x + 2, y + h * 0.05, w - 4, h * 0.12);
  }
  // Yazı: sırt boyunca yukarıdan aşağı (Türkçe/İngilizce sırt geleneği)
  g.save();
  g.translate(x + w / 2, y + h * (b.stil === 'krem' ? 0.25 : 0.06));
  g.rotate(Math.PI / 2);
  g.textBaseline = 'middle';
  g.textAlign = 'left';
  const room = h * (b.stil === 'krem' ? 0.62 : 0.84);
  const fs = Math.max(9, Math.min(w * 0.42, 26));
  g.fillStyle = b.yazi ?? '#fff';
  g.font = `800 ${fs}px "Rajdhani", "Arial Narrow", Arial, sans-serif`;
  const title = b.ad.toLocaleUpperCase('tr');
  let tw = g.measureText(title).width;
  const scale = Math.min(1, (room * 0.68) / tw);
  g.save(); g.scale(scale, 1);
  g.fillText(title, 0, w * 0.06 - (w > 50 ? fs * 0.3 : 0));
  g.restore();
  tw *= scale;
  g.font = `500 ${Math.max(8, fs * 0.55)}px "Rajdhani", Arial, sans-serif`;
  g.globalAlpha = 0.85;
  const au = b.yazar.toLocaleUpperCase('tr');
  const aw = g.measureText(au).width;
  const as = Math.min(1, (room - tw - 16) / Math.max(1, aw));
  if (w > 50) { g.save(); g.scale(Math.min(1, (room * 0.9) / aw), 1); g.fillText(au, 0, fs * 0.55); g.restore(); }
  else if (as > 0.35) { g.save(); g.translate(tw + 14, 0); g.scale(as, 1); g.fillText(au, 0, 0); g.restore(); }
  g.restore();
  // Üst kenarda sayfa çizgisi
  g.fillStyle = 'rgba(255,255,255,0.12)';
  g.fillRect(x, y, w, 2);
}

/** Rafın boş kalan yerine süs: fener, çerçeve, yatay kitap yığını, saksı (kitap değildir, haritada yok) */
function drawDeco(g: CanvasRenderingContext2D, d: Deco) {
  const dividers = [DEMO_W / 3, (DEMO_W * 2) / 3];
  let x = d.x;
  const r = rnd(11 + d.raf * 7);
  const items = ['yigin', 'cerceve', 'fener', 'saksi', 'yigin', 'cerceve'];
  let n = d.kind;
  while (x < d.x1 - 60) {
    const kind = items[n++ % items.length];
    const w = kind === 'yigin' ? 130 : kind === 'cerceve' ? 110 : kind === 'fener' ? 70 : 80;
    for (const dv of dividers) if (x + w > dv - 11 && x < dv + 11) x = dv + 24;
    if (x + w > d.x1) break;
    const b = d.base;
    if (kind === 'yigin') {
      const cols = ['#2b4f7a', '#c9a227', '#7a2b2b', '#e9e4d8', '#2f5e3d'];
      let y = b;
      for (let k = 0; k < 4; k++) { const hh = 14 + r() * 8; g.fillStyle = cols[(k + d.raf) % cols.length]; g.fillRect(x + r() * 8, y - hh, w - 10 - r() * 14, hh - 1); y -= hh; }
    } else if (kind === 'cerceve') {
      const hh = d.maxH * 0.62;
      g.fillStyle = '#1b1b1b'; g.fillRect(x, b - hh, w, hh);
      const ph = g.createLinearGradient(x, b - hh, x + w, b);
      ph.addColorStop(0, '#c98a4a'); ph.addColorStop(1, '#5a3418');
      g.fillStyle = ph; g.fillRect(x + 8, b - hh + 8, w - 16, hh - 16);
      g.fillStyle = 'rgba(255,220,170,0.5)'; g.beginPath(); g.ellipse(x + w / 2, b - hh * 0.5, w * 0.22, hh * 0.24, 0, 0, Math.PI * 2); g.fill();
    } else if (kind === 'fener') {
      const hh = d.maxH * 0.55;
      g.fillStyle = '#1e1e1e'; g.fillRect(x, b - hh, w, hh);
      g.fillStyle = 'rgba(255,200,120,0.55)'; g.fillRect(x + 10, b - hh + 14, w - 20, hh - 26);
      g.fillStyle = '#1e1e1e'; g.fillRect(x + w / 2 - 2, b - hh + 14, 4, hh - 26);
    } else {
      const hh = d.maxH * 0.35;
      g.fillStyle = '#f3f1ec'; g.fillRect(x + 10, b - hh, w - 20, hh);
      g.fillStyle = '#3f7d3a';
      for (let k = 0; k < 7; k++) { g.beginPath(); g.ellipse(x + w / 2 + (r() - 0.5) * w * 0.8, b - hh - 8 - r() * d.maxH * 0.35, 12, 7, r() * 3, 0, Math.PI * 2); g.fill(); }
    }
    x += w + 30;
  }
}

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

/**
 * Demo kitaplığı: okunur (ekranda görünen) yönde çizer, sonra kareyi aynalar (kamera gibi).
 * Döner: kare canvas'ı ve kitaplar (kutular aynalanmamış kare koordinatında, gerçek taramayla aynı biçim).
 */
export function buildDemoShelf(): { frame: HTMLCanvasElement; books: Kitap[]; gizli: Map<string, { ad: string; yazar: string }> } {
  const view = document.createElement('canvas');
  view.width = DEMO_W; view.height = DEMO_H;
  const g = view.getContext('2d')!;
  // Duvar ve beyaz raf gövdesi (gri duvar, beyaz kitaplık)
  const wall = g.createLinearGradient(0, 0, 0, DEMO_H);
  wall.addColorStop(0, '#8b8a86'); wall.addColorStop(1, '#6d6b67');
  g.fillStyle = wall; g.fillRect(0, 0, DEMO_W, DEMO_H);
  const { placed, shelves, decos } = layout();
  g.fillStyle = '#efefec';
  g.fillRect(40, 40, DEMO_W - 80, DEMO_H - 60);
  // İç arka panel (hafif gölgeli)
  const back = g.createLinearGradient(0, 0, 0, DEMO_H);
  back.addColorStop(0, '#e2e1dc'); back.addColorStop(1, '#d6d5cf');
  g.fillStyle = back; g.fillRect(64, 60, DEMO_W - 128, DEMO_H - 96);
  // Dikey bölmeler
  g.fillStyle = '#f4f4f1';
  for (const x of [DEMO_W / 3, (DEMO_W * 2) / 3]) g.fillRect(x - 9, 60, 18, DEMO_H - 96);
  for (const p of placed) drawSpine(g, p);
  for (const d of decos) drawDeco(g, d);
  // Bölmeler kitapların önünde (kitaplar bölmeye denk gelirse kesilir gibi)
  for (const s of shelves) {
    g.fillStyle = '#f7f7f4'; g.fillRect(s.x0 - 8, s.y, s.x1 - s.x0 + 16, 16);
    g.fillStyle = 'rgba(0,0,0,0.14)'; g.fillRect(s.x0 - 8, s.y + 16, s.x1 - s.x0 + 16, 5);
  }
  // Raf üstü sarmaşık (fotoğraftaki gibi)
  const r = rnd(3);
  for (let i = 0; i < 40; i++) {
    const x = 60 + r() * (DEMO_W - 120), y = 48 + r() * 30;
    g.fillStyle = `rgba(${40 + r() * 30},${110 + r() * 40},${50 + r() * 20},0.9)`;
    g.beginPath(); g.ellipse(x, y, 11, 8, r() * 3, 0, Math.PI * 2); g.fill();
  }
  // Işık: soldan pencere ışığı
  const light = g.createRadialGradient(DEMO_W * 0.2, DEMO_H * 0.1, 50, DEMO_W * 0.3, DEMO_H * 0.4, DEMO_W * 0.9);
  light.addColorStop(0, 'rgba(255,240,215,0.18)'); light.addColorStop(1, 'rgba(0,0,0,0.22)');
  g.fillStyle = light; g.fillRect(0, 0, DEMO_W, DEMO_H);

  // Kamera karesi = aynalı (ekranda video tekrar aynalanınca yazılar okunur olur)
  const frame = document.createElement('canvas');
  frame.width = DEMO_W; frame.height = DEMO_H;
  const f = frame.getContext('2d')!;
  f.translate(DEMO_W, 0); f.scale(-1, 1);
  f.drawImage(view, 0, 0);

  const books: Kitap[] = placed.map((p, i) => {
    const kutu: Kutu = [p.y / DEMO_H, 1 - (p.x + p.w) / DEMO_W, (p.y + p.h) / DEMO_H, 1 - p.x / DEMO_W];
    const extra = DEMO_OZET[p.b.ad];
    return {
      id: `demo-${i}`,
      ad: p.b.belirsiz ? null : p.b.ad,
      yazar: p.b.belirsiz ? null : p.b.yazar,
      kutu,
      kapak: null,
      ozet: extra?.ozet ?? null,
      notlar: extra?.notlar ?? [],
      alintilar: extra?.alintilar ?? [],
      durum: extra?.durum ?? 'okunacak',
      sayfa: extra?.sayfa,
      toplamSayfa: extra?.toplam,
      jarvis: extra?.jarvis ? { ...extra.jarvis, at: '2026-10-18T00:00:00.000Z' } : undefined,
      emin: p.b.belirsiz ? 0.2 : 0.9,
    };
  });
  // Okunamayan sırtların gerçek adları: demoda bölüm listesiyle tamamlamayı göstermek için
  const gizli = new Map(placed.map((p, i) => [`demo-${i}`, { ad: p.b.ad, yazar: p.b.yazar }]));
  return { frame, books, gizli };
}

/**
 * Demo rafının 6 bölümü (ekranda soldan sağa üç sütun, üst ve alt yarı): B1 sol üst … B6 sağ alt.
 * Kutular video normalize ve aynalanmamış: ekrandaki x = 1 - kutunun x'i.
 */
export function demoBolumu(k: Kutu): number {
  const cx = 1 - (k[1] + k[3]) / 2, cy = (k[0] + k[2]) / 2;
  return (cy < 0.5 ? 0 : 3) + Math.min(2, Math.floor(cx * 3)) + 1;
}
export const DEMO_BOLUM_ALANLARI: Kutu[] = [0, 1, 2, 3, 4, 5].map(i => {
  const col = i % 3, row = Math.floor(i / 3);
  return [row * 0.5 + 0.04, 1 - (col + 1) / 3 + 0.01, row * 0.5 + 0.5, 1 - col / 3 - 0.01];
});

/**
 * Demo taraması: kamera uzaktan okuyamamış gibi her 4. sırt belirsiz gelir; tamamlama adımı bunları (ve gerçekten
 * belirsiz olanları) bölüm listelerinden doldurur.
 */
export function demoTarama(books: Kitap[], gizli: Map<string, { ad: string; yazar: string }>) {
  const maskeli = books.map((b, i) => (b.kutu && i % 4 === 2 ? { ...b, ad: null, yazar: null } : b));
  const tamamlanan = maskeli.filter(b => b.kutu && !b.ad && gizli.has(b.id)).map(b => ({ id: b.id, ad: gizli.get(b.id)!.ad, bolum: demoBolumu(b.kutu!) }));
  const tam = maskeli.map(b => { const t = tamamlanan.find(x => x.id === b.id); return t ? { ...b, ad: t.ad, yazar: gizli.get(b.id)!.yazar, tamamlandi: true } : b; });
  return { maskeli, tamamlanan, tam };
}

/** Sahte kamera akışı: kare canvas'ı <video>'ya bağlanır (videoWidth/Height, kırpma ve küçük resim gerçek gibi çalışır) */
export function demoStream(frame: HTMLCanvasElement): { stream: MediaStream; stop(): void; jiggle(on: boolean): void } {
  const live = document.createElement('canvas');
  live.width = frame.width; live.height = frame.height;
  const g = live.getContext('2d')!;
  g.drawImage(frame, 0, 0);
  const stream = live.captureStream(30);
  // Akış yalnızca canvas değişince kare üretir: ışığı çok hafif oynat (gerçek kamera gürültüsü gibi)
  let t = 0, dx = 0;
  const id = setInterval(() => {
    t++;
    g.globalAlpha = 1;
    g.fillStyle = '#6d6b67'; g.fillRect(0, 0, live.width, live.height);
    g.drawImage(frame, dx, 0);
    g.fillStyle = `rgba(255,240,220,${0.012 + 0.008 * Math.sin(t * 0.7)})`;
    g.fillRect(0, 0, live.width, live.height);
  }, 33);
  return {
    stream,
    stop: () => { clearInterval(id); stream.getTracks().forEach(tr => tr.stop()); },
    /** Test: kamera kıpırdamış gibi kareyi %2 kaydır (demoda J tuşu) */
    jiggle: on => { dx = on ? Math.round(frame.width * 0.02) : 0; },
  };
}

/** Demo zaman çizelgesinde elin uzanacağı kitap */
export const DEMO_TARGET = 'Otostopçunun Galaksi Rehberi';
