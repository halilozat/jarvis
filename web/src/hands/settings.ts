// El Kontrolü · efekt ayarları (⚙ menüsü ya da E tuşu). Bu cihazda saklanır (localStorage); çekimde istenmeyen
// efektler kapatılır, örneğin kitaplık sahnesinde ateş araya girmesin.
import { GEZEGENLER, type GezegenTur } from './fx';

export interface ElAyar {
  ates: boolean;
  muhur: boolean;
  gezegen: boolean;
  patlat: boolean;
  simsek: boolean;
  iz: boolean;
  /** Basılı tutma kontrolleri: 👍 kahve, ✌️ ışık, ✊ sustur */
  kontroller: boolean;
  yuz: boolean;
  kitaplik: boolean;
  /** El raf bölgesindeyken ateş, iz ve şimşek çıkmasın (kitaba uzanırken araya girmesin) */
  rafSessiz: boolean;
  ses: boolean;
  /** Haber Modu açılışında motto seslendirilsin */
  haberMotto: boolean;
  /** Çimdikle oluşan gezegen: sırayla (her çimdikte sonraki) ya da hep aynısı */
  gezegenTur: 'sirayla' | GezegenTur;
}

type AcKapa = { [K in keyof ElAyar]: ElAyar[K] extends boolean ? K : never }[keyof ElAyar];

export const VARSAYILAN: ElAyar = { ates: true, muhur: true, gezegen: true, patlat: true, simsek: true, iz: true, kontroller: true, yuz: true, kitaplik: true, rafSessiz: true, ses: true, haberMotto: true, gezegenTur: 'sirayla' };

/** Menüdeki sıra ve adlar */
export const AYAR_LISTESI: { k: AcKapa; ad: string; alt?: string }[] = [
  { k: 'ates', ad: '✋ Ateş', alt: 'açık avuç' },
  { k: 'muhur', ad: '✋✋ Mühür', alt: 'iki açık el' },
  { k: 'gezegen', ad: '🤏 Gezegen', alt: 'çimdik' },
  { k: 'patlat', ad: '✊→✋ Patlat', alt: 'yumruk açılınca dalga' },
  { k: 'simsek', ad: '☝️☝️ Şimşek', alt: 'iki işaret parmağı' },
  { k: 'iz', ad: '☝️ Işık izi', alt: 'tek işaret parmağı' },
  { k: 'kontroller', ad: '👍 ✌️ ✊ Jarvis kontrolleri', alt: 'kahve, ışık, sustur' },
  { k: 'yuz', ad: '◎ Yüz kilidi', alt: 'F' },
  { k: 'kitaplik', ad: '📚 Kitaplık', alt: 'kitap seç, çek, aç' },
  { k: 'rafSessiz', ad: '📚 Raf bölgesinde ateş/iz yok', alt: 'kitaba uzanırken araya girmesin' },
  { k: 'ses', ad: '🔊 Efekt sesleri', alt: 'M' },
  { k: 'haberMotto', ad: '📰 Haber açılışında motto', alt: 'Jarvis seslendirir' },
];

const KEY = 'jarvis.el.ayar';

export function loadAyar(): ElAyar {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '{}');
    const out = { ...VARSAYILAN };
    for (const k of AYAR_LISTESI.map(a => a.k)) if (typeof v[k] === 'boolean') out[k] = v[k];
    if (v.gezegenTur === 'sirayla' || GEZEGENLER.some(g => g.tur === v.gezegenTur)) out.gezegenTur = v.gezegenTur;
    return out;
  } catch {
    return { ...VARSAYILAN };
  }
}

export function saveAyar(a: ElAyar) {
  try { localStorage.setItem(KEY, JSON.stringify(a)); } catch { /* gizli pencere: yalnızca bu oturum */ }
}
