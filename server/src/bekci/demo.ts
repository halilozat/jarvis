// Bekçi · demo (video çekimi): örnek bir mesajı yeni gelmiş gibi akışa sokar. HİÇBİR gerçek ağ isteği yapılmaz:
// alan adı yaşı, USOM, sandbox ve metin analizi aşağıdaki sabit sonuçlardan gelir. Alan adları örnektir.
import type { Fikstur, Mesaj } from './analiz.js';

const gunOnceTarih = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

export function demoSms(): { mesaj: Mesaj; fikstur: Fikstur } {
  return {
    mesaj: {
      id: `demo-sms-${Date.now()}`, kaynak: 'sms', gonderen: '+90 500 000 00 00', zaman: new Date().toISOString(),
      metin: 'PTT: Gonderiniz adres bilgisi eksik oldugu icin dagitima cikarilamadi. 24 saat icinde 9,80 TL odeme yapmazsaniz iade edilecektir: ptt-ornek.xyz/odeme',
    },
    fikstur: {
      yas: { 'ptt-ornek.xyz': { gun: 3, tarih: gunOnceTarih(3), kaynak: 'rdap' } },
      usom: [],
      gsb: [],
      metin: { scam_likelihood: 96, tactics: ['kargo_teslim_edilemedi', 'aciliyet', 'odeme_talebi'], impersonated_brand: 'PTT', short_reason_tr: 'Kargo bahanesiyle küçük bir ödeme isteyip resmî olmayan bir adrese yönlendiriyor.', model: 'örnek analiz (demo)' },
      sandbox: { uuid: 'demo', ekran: '', formAlanlari: ['kart numarası', 'CVV', 'son kullanma tarihi'], durum: 'tamam' },
    },
  };
}

export function demoMail(): { mesaj: Mesaj; fikstur: Fikstur } {
  return {
    mesaj: {
      id: `demo-mail-${Date.now()}`, kaynak: 'mail', gonderen: 'bildirim@edevlet-ornek.top', zaman: new Date().toISOString(),
      konu: 'Odenmemis trafik cezaniz hakkinda son bildirim',
      metin: 'Sayin vatandasimiz, adiniza kesilmis 2.450 TL tutarindaki trafik cezasi odenmemistir. 48 saat icinde odeme yapilmazsa haciz islemi baslatilacaktir. Odeme icin e-Devlet uzerinden giris yapiniz.',
      mail: {
        fromAlan: 'edevlet-ornek.top', gorunenAd: 'e-Devlet Kapısı', replyToAlan: 'ornek-destek.xyz', auth: { spf: 'fail', dkim: 'none', dmarc: 'fail' },
        ekler: [{ ad: 'ceza-detay.html', tur: 'text/html' }],
        htmlLinkler: [{ ham: 'https://edevlet-ornek.top/giris', url: 'https://edevlet-ornek.top/giris', host: 'edevlet-ornek.top', alan: 'edevlet-ornek.top', ip: false, unicode: 'edevlet-ornek.top', gorunen: 'www.turkiye.gov.tr' }],
        qrLinkler: [],
      },
    },
    fikstur: {
      yas: { 'edevlet-ornek.top': { gun: 5, tarih: gunOnceTarih(5), kaynak: 'rdap' } },
      usom: [], gsb: [],
      metin: { scam_likelihood: 97, tactics: ['ceza_tehdidi', 'aciliyet', 'odeme_talebi'], impersonated_brand: 'e-Devlet', short_reason_tr: 'Haciz tehdidiyle e-Devlet olmayan bir giriş sayfasına yönlendiriyor.', model: 'örnek analiz (demo)' },
      sandbox: { uuid: 'demo', ekran: '', formAlanlari: ['TC kimlik numarası', 'şifre'], durum: 'tamam' },
    },
  };
}
