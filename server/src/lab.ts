// Uzay Laboratuvarı (El Kontrolü): istemci açıkken her sohbet isteğine ekrandaki durumu ekler. Bu dosya o isteğin
// durumunu tutar ve yasam_izi_tara aracını çalıştırır: sonucu istemcinin hesapladığı taramadan (web/src/hands/space/
// life.ts) alır, ekranda animasyonu başlatır. Yaşam olasılığı yüzdesi üretmez.

let notify: (e: object) => void = () => {};
export function initLab(broadcast: (e: object) => void) { notify = broadcast; }

interface LabIstek { ctx: Record<string, any>; client: string }
let cur: LabIstek | null = null;
/** Sohbet isteği başlarken (laboratuvar açıksa) ve bitince (null) */
export function setLabRequest(r: LabIstek | null) { cur = r; }

const fold = (s: string) => s.toLocaleLowerCase('tr').replace(/ı/g, 'i').normalize('NFD').replace(/\p{M}/gu, '').replace(/[^a-z0-9]/g, '');
/** STT ve konuşma dilindeki yazımlar */
const TAKMA: Record<string, string> = { avrupa: 'europa', ganimed: 'ganymede', ganimet: 'ganymede', enseladus: 'enceladus', merkur: 'merkur', venus: 'venus' };

/** Laboratuvar notu (sistem notu olarak kullanıcı mesajına eklenir): tarama sonuçları hariç, onlar araçla gelir */
export function labNote(): string | undefined {
  if (!cur) return undefined;
  const { yasam_taramasi: _t, ...rest } = cur.ctx;
  void _t;
  return JSON.stringify(rest);
}

export function yasamIziTara(args: { hedef?: string; hizli?: boolean }): string {
  const tum = cur?.ctx?.yasam_taramasi as Record<string, { ad: string }> | undefined;
  if (!cur || !tum) return JSON.stringify({ hata: "Uzay Laboratuvarı açık değil. Kullanıcı önce \"uzay laboratuvarını aç\" demeli." });
  const h0 = fold(String(args.hedef ?? ''));
  const h = TAKMA[h0] ?? h0;
  const idOf = (ad: string) => Object.keys(tum).find(k => fold(k) === fold(ad) || fold(tum[k].ad) === fold(ad));
  let ids: string[];
  if (!h || h === 'odak' || h === 'bolge' || h === 'bubolge') ids = ((cur.ctx.bolge as string[]) ?? []).map(idOf).filter((x): x is string => !!x);
  else {
    const id = Object.keys(tum).find(k => fold(k) === h || fold(tum[k].ad) === h || (h.length >= 4 && fold(tum[k].ad).startsWith(h.slice(0, 5))));
    ids = id ? [id] : [];
  }
  if (!ids.length) return JSON.stringify({ hata: 'Bu cisim laboratuvarda yok', mevcut: Object.values(tum).map(t => t.ad) });
  notify({ type: 'lab_cmd', cmd: { tip: 'tara', hedef: ids.length > 1 ? 'odak' : ids[0], hizli: !!args.hizli, surucu: true }, origin: cur.client });
  return JSON.stringify({
    ok: true,
    animasyon: "Ekranda başladı. 8 adım cevabının sahneleriyle sırayla ilerler: 1 odak, 2 yüzey, 3 spektrum, 4 yer altı, 5 kontrol listesi, 6 ESI, 7 keşifler, 8 sonuç.",
    sonuclar: ids.map(id => tum[id]),
  });
}
