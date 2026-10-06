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

---

## Kolay Kurulum

*Yazılımcı değilsen bu bölüm senin için.*

Bu rehber, daha önce hiç kod çalıştırmamış biri için hazırlandı. Adımları sırayla izlersen yaklaşık **15-20 dakikada** Jarvis bilgisayarında çalışır.

> **Kısaca ne yapacağız?**
> 1. Bilgisayara Node.js kuracağız (Jarvis'i çalıştıran program).
> 2. Jarvis'i GitHub'dan indireceğiz.
> 3. Abacus AI'dan bir API anahtarı alacağız (Jarvis'in beyni).
> 4. Tek bir komutla Jarvis'i başlatacağız.

---

### Başlamadan önce

**Gerekenler:**
- Mac ya da Windows bilgisayar
- İnternet bağlantısı
- **Abacus AI ChatLLM aboneliği** (ücretli; güncel fiyatı abacus.ai sitesinde görebilirsin). Jarvis'in beyni olan RouteLLM API bu aboneliğin içinde geliyor.

**Abonelik olmadan da deneyebilirsin:** API anahtarı eklemezsen Jarvis **demo modunda** açılır. Arayüzü, animasyonları ve örnek (kurgusal) bir haber özetini görebilirsin. Gerçek haberleri anlatması için anahtar gerekiyor.

---

### Adım 1: Node.js'i kur

Node.js, Jarvis'i bilgisayarında çalıştıran ücretsiz bir programdır.

1. **https://nodejs.org** adresine git.
2. **LTS** yazan sürümü indir (yeşil düğme).
3. İndirilen dosyayı aç ve kurulumu "İleri / Continue" diyerek tamamla. Hiçbir ayarı değiştirmene gerek yok.

**Kurulduğunu kontrol et:**
- **Mac:** Spotlight'ı aç (⌘ + Boşluk), **Terminal** yaz ve aç.
- **Windows:** Başlat menüsüne **PowerShell** yaz ve aç.

Açılan pencereye şunu yaz ve Enter'a bas:

```
node -v
```

`v22.x.x` gibi bir sürüm numarası görüyorsan tamamdır. "Komut bulunamadı" gibi bir hata alırsan pencereyi kapatıp yeniden aç ve tekrar dene.

---

### Adım 2: Jarvis'i indir

1. **https://github.com/halilozat/jarvis** adresine git.
2. Yeşil **Code** düğmesine tıkla → **Download ZIP**.
3. İndirilen ZIP dosyasına çift tıklayıp aç.
4. Çıkan klasörün adını **jarvis** yap ve kolay bulacağın bir yere taşı. Örneğin **Masaüstü**.

---

### Adım 3: Jarvis'i kur

Terminal'de (Mac) ya da PowerShell'de (Windows) Jarvis klasörüne gitmemiz gerekiyor.

**Mac:**
```
cd ~/Desktop/jarvis
```

**Windows:**
```
cd $HOME\Desktop\jarvis
```

> Klasörü Masaüstü dışında bir yere koyduysan: `cd ` yazıp bir boşluk bırak, sonra klasörü sürükleyip pencerenin içine bırak ve Enter'a bas.

Şimdi kurulumu başlat:

```
npm run setup
```

Bu birkaç dakika sürebilir, ekranda çok sayıda yazı akacak. Normaldir. Bittiğinde yeniden komut yazabileceğin satır gelir.

---

### Adım 4: Abacus AI API anahtarını al

1. **https://apps.abacus.ai** adresine git ve ChatLLM hesabınla giriş yap.
2. Sol menüden **LLM APIs** sayfasını aç.
3. **Create API key** düğmesine tıkla.
4. Çıkan anahtarı **hemen kopyala**. Anahtar bir daha gösterilmez; kaybedersen yenisini oluşturman gerekir.

> ⚠️ API anahtarı bir şifre gibidir. Kimseyle paylaşma, ekran görüntüsünde gösterme. Anahtarın başkasının eline geçerse senin kredini harcayabilir.

---

### Adım 5: Anahtarı Jarvis'e ver

Jarvis'in ayar dosyasını aç:

**Mac:**
```
open -e server/.env
```

**Windows:**
```
notepad server\.env
```

Açılan dosyada şu satırı bul:

```
ABACUS_API_KEY=
```

Eşittir işaretinin hemen arkasına, **boşluk bırakmadan** kopyaladığın anahtarı yapıştır:

```
ABACUS_API_KEY=s2_xxxxxxxxxxxxxxxxxxxxxxxx
```

Dosyayı kaydet (**⌘ + S** ya da **Ctrl + S**) ve kapat.

> İstersen aynı dosyadaki `USER_NAME=Halil` satırını kendi adınla değiştir. Jarvis sana adınla hitap eder.

---

### Adım 6: Jarvis'i başlat 🚀

Aynı pencereye yaz:

```
npm run dev
```

Birkaç saniye sonra tarayıcında (tercihen **Google Chrome**) şu adresi aç:

```
http://localhost:5173
```

Jarvis karşında! Mikrofon izni isterse **İzin ver** de.

Dene:
- 🎙️ Mikrofon düğmesine bas (bilgisayarda **boşluk tuşu**) ve **"Jarvis, interneti tara ve bana gündemi özetle"** de.
- Ya da alttaki kutuya yazarak sor.

**Kapatmak için:** Terminal/PowerShell penceresinde **Ctrl + C**.
**Bir dahaki sefere açmak için:** Adım 3'teki `cd` komutuyla klasöre git, sonra `npm run dev`.

---

### Sık karşılaşılan sorunlar

**"npm: command not found" / "npm tanınmıyor"**
Node.js kurulduktan sonra Terminal/PowerShell penceresini kapatıp yeniden aç. Olmadıysa bilgisayarı yeniden başlat.

**"No such file or directory" / "Yol bulunamadı"**
Doğru klasörde değilsin. Adım 3'teki "klasörü sürükleyip bırak" yöntemini kullan.

**Jarvis açılıyor ama üstte DEMO yazıyor**
API anahtarı okunamamış. `server/.env` dosyasında anahtarın `ABACUS_API_KEY=` satırına boşluksuz yapıştırıldığından ve dosyanın kaydedildiğinden emin ol. Sonra Terminal'de **Ctrl + C** ile durdurup `npm run dev` ile yeniden başlat.

**Mikrofon çalışmıyor**
Chrome'da adres çubuğunun solundaki kilit simgesine tıkla → Mikrofon → İzin ver. Safari yerine Chrome kullan.

**Ses robotik geliyor**
Bu, tarayıcının kendi sesi. Daha doğal bir ses için Jarvis'te ☰ → Ayarlar → Ses bölümünden bir seslendirici seç. Ayrıntılar yukarıdaki "Seslendiren" bölümünde.

**"Port 5173 is in use"**
Jarvis zaten açık. Diğer Terminal penceresini kapat ya da tarayıcıda adresi yenile.

---

### Telefonda ve tablette kullanmak

Bu biraz daha teknik bir adım: Jarvis'in bilgisayarında çalışması ve telefonunun ona güvenli (HTTPS) bir bağlantıyla ulaşması gerekiyor. Önce bilgisayarda çalıştığından emin ol, sonra yukarıdaki **"Telefon ve tablette kullanmak"** bölümünü izle.

---

Takıldığın bir yer olursa videonun altına **hangi adımda takıldığını ve ekranda ne yazdığını** yorum olarak yaz. Sık sorulanları bu rehbere ekliyorum. 🙌
