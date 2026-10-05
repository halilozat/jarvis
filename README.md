# Jarvis

Bilgisayarda, tablette ve telefonda çalışan **tek** bir kişisel asistan. Beyni [Abacus.AI RouteLLM API](https://abacus.ai): her soruyu otomatik olarak en uygun modele yönlendirir.

- 🗣️ Sesli konuşur, sesle dinler (bas-konuş)
- 📰 "Jarvis, aydınlat beni" → birden fazla haber kaynağını tarar, sahne sahne anlatır
- 🎬 Anlatırken ekranda sayılar, grafikler, Türkiye haritası, kaynak karşılaştırması ve fotoğraflar canlanır
- 🔁 Bir cihazda başlayan konuşma diğerinde devam eder ("devam et")

---

## Kurulum

Gerekenler: Node.js 20+

```bash
npm run setup          # bağımlılıkları kurar, server/.env dosyasını oluşturur
```

`server/.env` dosyasını aç ve en az şunu doldur:

```
ABACUS_API_KEY=...     # apps.abacus.ai → LLM APIs → API anahtarı oluştur
```

Anahtar boşsa uygulama **demo modunda** çalışır (kurgusal haberlerle), arayüzü denemek için yeterlidir.

## Çalıştırma

```bash
npm run dev            # http://localhost:5173
```

İlk kontrol (önerilir):

```bash
npm run test           # RSS kaynaklarını ve RouteLLM tool calling'i test eder
npm run models         # RouteLLM'de kullanılabilen modelleri listeler (ses modelleri dahil)
```

## Telefon ve tablette kullanmak

Mikrofon yalnızca HTTPS'te çalıştığı için bilgisayarındaki Jarvis'e bir tünelle bağlan:

```bash
npm start                                   # arayüzü derler, her şeyi 8787 portundan sunar
cloudflared tunnel --url http://localhost:8787
```

1. `server/.env` içinde `ACCESS_TOKEN=uzun-rastgele-bir-sey` belirle (tüneli bulan kimse kredini harcayamasın).
2. Tünelin verdiği adresi telefonda **bir kez** `https://...trycloudflare.com/?token=uzun-rastgele-bir-sey` olarak aç.
3. **iPhone/iPad:** Safari → Paylaş → *Ana Ekrana Ekle* · **Android:** Chrome → *Uygulamayı yükle* · **Mac:** Chrome adres çubuğundaki yükle simgesi.

Her cihaz kendini otomatik tanır; yanlışsa *☰ → Ayarlar → Bu cihaz* kısmından değiştir.

## Jarvis router'ı nasıl kurulur (birden fazla beyin)

`route-llm` her isteği kendisi yönlendirir. Jarvis'e özel bir yönlendirici (Abacus **Custom Router**) kurarsan her istek türü senin seçtiğin modele gider ve router'ın adı API'de model adı olarak kullanılır.

1. **apps.abacus.ai → LLM APIs → New Custom Router**
2. Önerilen eşleme (5 Ekim 2026 ölçümlerine göre):

   | İstek türü | Model | Neden |
   |---|---|---|
   | Kısa sohbet, selam | hızlı ucuz model (ör. `gemini-2.5-flash`) | `route-llm` "Selam Jarvis" için de akıl yürüten modeli seçebiliyor: ilk token 3,2–3,5 sn. `gemini-2.5-flash` ölçümde ~1 sn. |
   | Gündem brifingi (araç kullanımı + uzun JSON) | güçlü model (ör. `gpt-5.6-luna`) | Üç aracı tek turda paralel çağırıp 6–9 sahnelik JSON'u güvenilir yazıyor. |
   | Görsel/fotoğraf analizi | görsel girdi destekli model (ör. `gemini-3.8-flash`) | Kamera sorusunu `route-llm` de buna yönlendirdi. |
   | Diğer her şey | `route-llm` | |

3. Router'ın adını `server/.env` içine yaz ve sunucuyu yeniden başlat:

   ```
   CHAT_MODEL=jarvis-router
   ```

4. Arayüzün sağ üstündeki **BEYİN** rozeti her cevapta `router → gerçekten çalışan alt model` gösterir (ör. `jarvis-router → gemini-2.5-flash`). Sunucu logu da her cevapta `[beyin] istenen: … → çalışan: …` yazar.

Notlar:
- Router TTS için **kullanılmaz**: sesin her cevapta aynı kalması için TTS sabit bir model + sabit bir ses kimliği ister; `TTS_MODEL` yönlendirmeli bir model olursa sunucu açılışta uyarır ve reddeder.
- Hangi modellerin hangi türde olduğunu görmek için `npm run models` (metin / görsel girdi / ses / görsel üretim / video olarak gruplar ve önerilen `.env` değerlerini yazar).

## Seslendiren

`npm run voices` RouteLLM'deki ses modellerini × bilinen ses adlarını gerçek isteklerle sınar ve yalnızca iki testi geçenleri Ayarlar → Ses'te listeler: metni birebir okumak ve aynı cümleyi her seferinde aynı perdede okumak. Ölçüm: Gemini TTS aynı ses kimliğiyle her istekte başka bir perde üretiyor (bu yüzden ses "sürekli değişiyordu"); gpt-audio sesleri sabit kalıyor. Seçilen ses tüm cihazlarda ortaktır ve her cevaba sabitlenir: cevap sürerken değiştirilse de o cevap tek sesle biter.

## Kullanım

- 🎙️ Mikrofon düğmesi (masaüstünde **boşluk** tuşu): konuş, susunca gönderir
- **Esc** ya da ■: Jarvis'i sustur
- **W** / **S**: test uyanışı / uyku modu (aşağıda)
- ☰ → **Detay**: gündemin uzun özeti ve kaynakları · **Geçmiş**: tüm cihazlardaki konuşma, her cevabı bu cihazda yeniden oynatabilirsin

### İki alkışla uyanma

Jarvis 5 dakika boşta kalınca (*Ayarlar → Uyanış → Boşta kalınca uyku*) ya da **S** tuşuyla uyku moduna geçer. Ekran neredeyse siyahtır, ortada nefes alan bir nokta vardır. Uyandırmak için:

1. **İki kez alkışlayın.** Mikrofon yalnızca *dinleyici cihazda* açıktır (varsayılan masaüstü). Nokta büyür, etrafında dinleme halkası belirir.
2. **4 saniye içinde "uyan Jarvis" deyin.** Tüm cihazlar aynı anda açılır: çekirdek parlar, halkalar sırayla çizilir, gerçek sistem kontrolleri (RouteLLM gecikmesi, haber kaynakları, bağlı cihazlar) görünür, paneller içeri kayar. Karşılama ("Günaydın / İyi günler / İyi akşamlar efendim") yalnızca *karşılayan cihazdan* çalar; diğer cihazlar altyazıyı gösterir.

Komut gelmezse sessizce uykuya döner. Tek alkış, konuşma, müzik, kapı sesi ve Jarvis'in kendi sesi tetiklemez.

- **Modlar:** alkış + "uyan Jarvis" (varsayılan) · yalnızca alkış · yalnızca "uyan Jarvis".
- **Kalibrasyon** (*Ayarlar → Uyanış*, dinleyici cihazda): canlı seviye çubuğu, eşik kaydırıcısı, test noktası. Bir kez alkışlayınca nokta yanmalı, konuşunca yanmamalı. Odanız gürültülüyse eşiği yükseltin.
- **Gizli ritim:** "Ritmini kaydet" ile kendi alkış ritminizi 3 kez çalın. Açıkken çift alkış yerine bu ritim aranır (her aralıkta ±%20 tolerans).
- **Çekim kısayolları:** **W** = test uyanışı (alkışsız), **S** = tüm cihazları uykuya al. Uyku ekranına çift dokunmak da uyandırır.
- **Ekranın kapanmaması:** Uygulama açıkken ekran kilidi (Screen Wake Lock) istenir. Bu desteklenmezse ya da sistem yine de kapatırsa:
  - **Mac:** Terminalde `caffeinate -d` komutunu çalıştırın. Ekran açık kalır, Ctrl+C ile bırakılır.
  - **iPhone/iPad:** *Ayarlar → Ekran ve Parlaklık → Otomatik Kilit: Asla* yapın ya da çekimde *Rehberli Erişim* kullanın.
- **iPhone ses kilidi:** iOS sesi ancak bir dokunuştan sonra çalar. Uykuya ekrana dokunarak (ya da Ayarlar'daki düğmeyle) girerseniz ses hazır olur. Ses kilitliyse açılış sekansı sessiz oynar, "Sesi açmak için ekrana dokunun" yazar ve ilk dokunuşta karşılama çalar.

### Ses

`TTS_MODEL` boşsa tarayıcının Türkçe sesi kullanılır. RouteLLM ses modeliyle daha doğal bir ses için `npm run models` çıktısındaki bir ses modelini `TTS_MODEL` olarak yaz (ör. `gpt-audio-mini`) ve `TTS_VOICE` ile sesi seç.

### Fotoğraflar

*Ayarlar → Fotoğraf modu*
- **Haber fotoğrafı:** Haberin kendi fotoğrafı (köşede kaynak etiketiyle). Kişisel kullanım içindir; bu fotoğrafların telifi haber sitelerine aittir.
- **Video (stok):** `PEXELS_API_KEY` veya `UNSPLASH_ACCESS_KEY` ile ticari kullanıma açık stok fotoğraflar. Videoda yayınlayacaksan bunu kullan.

## Nasıl çalışıyor

```
Telefon / Tablet / Bilgisayar (React PWA)
          │  HTTPS + SSE (anlık senkron)
          ▼
   Node sunucusu ──► RouteLLM API (route-llm)
          │              ▲  tool call: get_news
          ▼              │
     RSS kaynakları ─────┘
```

1. Jarvis `get_news` aracını çağırır, sunucu RSS'ten haberleri toplar ve aynı olayı anlatanları birleştirir.
2. Model cevabı **sahneler** hâlinde verir: her sahne = 1-2 cümle ses + bir görsel (sayı, grafik, harita, karşılaştırma…).
3. Sunucu her görseldeki sayının ve şehrin haber metninde **birebir geçtiğini doğrular**; geçmiyorsa görseli başlık kartına düşürür. Jarvis grafik uyduramaz.
4. Arayüz sahneleri sırayla seslendirir, her sahnenin görselini o anda canlandırır.

Sistem prompt'u: `server/src/prompt.ts` (açıklamalı hâli: `docs/jarvis-system-prompt.md`). Haber kaynakları: `server/src/news.ts`. **Önceki oturumun tüm kararları: `docs/DEVIR-NOTU.md`.**
