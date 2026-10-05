# Jarvis — Devir Notu

> Yeni bir Claude oturumu bu projeyi devralıyorsa ÖNCE bu dosyayı oku. Önceki oturumdaki tüm kararlar burada.

## Güncel kararlar (5 Ekim 2026) — aşağıdaki eski notlarla çelişirse bunlar geçerli
- **Kurulum:** Node v24.21.0, `~/.local/node` altında (Homebrew yok). `~/.zshrc`'ye PATH satırı Claude tarafından yazılamadı; Halil eklemediyse komutlar `export PATH="$HOME/.local/node/bin:$PATH"` ile çalıştırılır. `.claude/launch.json` bu yüzden zsh sarmalayıcı kullanıyor ve `unset PORT` içeriyor (önizleme aracı `PORT` enjekte edip sunucuyu Vite'ın portuna çarpıyordu).
- **Abacus anahtarı** `server/.env` içinde (Halil verdi). Gerçek RouteLLM ile tool calling doğrulandı (3/3).
- **Hitap:** Jarvis Halil'e her zaman "efendim" der, "siz" diye konuşur; adını kullanmaz. Kişilik: sakin, kendinden emin, karizmatik yapay zeka uşağı, kuru espri.
- **Siyasi tarafsızlık kaldırıldı** (Halil'in kararı): Jarvis siyasette de fikrini söyler, taraf tutabilir; olgu ile yorumu ayırır, fikrini gerekçelendirir.
- **Brifing tetikleyicisi:** Gündem YALNIZCA "Jarvis, aydınlat beni" ile açılır (kodda, `server/src/brief.ts`). Komut yoksa `get_news` modele hiç sunulmaz; haber sorulursa Jarvis esprili şekilde komutu hatırlatır.
- **Sabit açılış:** Brifing her zaman "Merhaba efendim, kahvenizi aldıysanız başlıyorum." ile başlar; backend zorlar, sesi diske önbelleklenir (`server/data/tts/`).
- **Brifing tonu:** Reels için; şaşırtıcılık sırasına göre, bülten dili yasak, her haberde kısa keskin yorum, esprili kapanış. "Vay be" etkisi çerçeveden gelir, uydurmadan değil.
- **Ses:** `TTS_MODEL=gemini-2.5-pro-preview-tts`, `TTS_VOICE=onyx` (Gemini'de Fenrir). `gpt-audio-*` ELENDİ: sohbet modeli, kısa cümlelere okumak yerine cevap veriyor ("Hazırım, metni gönderin") ve karakter tarifi verilince sahne yönergelerini sesli okuyor. Gemini doğru kalıpla (tek kullanıcı mesajı: "<İngilizce üslup>: <metin>") testte 5/5 birebir okudu. Gemini ham PCM döndürür, sunucu WAV'a sarar. Desteklenen ses adları: alloy, echo, fable, onyx, nova, shimmer.
- **Arayüz:** Sahne geçişlerinde Web Audio ile üretilen ses efekti var (dosya yok, telif yok). Başlık kartındaki boşluk hatası düzeltildi.
- **Hız (ölçülmüş):** Darboğazlar model turu ve Gemini Pro TTS'in hızı (≈3 sn sabit gecikme + kelime başına ≈0,3 sn). Flash TTS denendi: daha yavaş ve uzun boşluklarla okuyor, elendi. Sesi akışla (stream) almak denendi: ilk ses parçası ancak ~8 sn'de geliyor, kazancı az.
  - Uygulananlar (Halil seçti): **anında açılış** (komut gelince sunucu `opening` olayı yollar, tarayıcı diskteki açılışı ~0,1 sn'de çalar, brifing gelince 2. sahneden devam eder) ve **sahne başına en fazla 18 kelime**.
  - Önerilip seçilmeyenler (tekrar açma): haber aracını sunucunun doğrudan çağırması, detay panelini ayrı/arka planda yazdırmak.
  - Son ölçüm: açılış 0,1 sn; açılıştan sonra brifinge kadar ~33 sn "düşünüyor" ekranı; sahne geçişleri 0,2 sn.
- **Telefon/tablet erişimi: Tailscale** (Halil seçti; Cloudflare hızlı tüneli önerildi, seçilmedi). Sabit adres: `https://halil-macbook-pro.tail542a47.ts.net` (yalnızca tailnet; internete açık değil, `ACCESS_TOKEN` bu yüzden boş). Cihazlar: halil-macbook-pro, iphone172, lenovo-idea-tab-pro. `tailscale serve --bg 8787` ayarlı (kalıcı); CLI: `/Applications/Tailscale.app/Contents/MacOS/Tailscale`. Sertifika Let's Encrypt, Tailscale yeniliyor.
  - Cihazlar `8787`'nin sunduğu **derlenmiş** arayüzü (`web/dist`) görür. Arayüz değişikliğinden sonra `npm --prefix web run build` şart; `5173` (Vite) yalnızca Mac'te geliştirme içindir.
  - Düz `http://<yerel-ip>:5173` ile mikrofon çalışmaz (HTTPS gerekir) ve IP ağ değişince değişir; o yol terk edildi.
- **Sabah panosu (bekleme ekranı):** `server/src/dashboard.ts` + `GET /api/dashboard`; 5 dk'da bir SSE `dashboard` olayı.
  - Kaynaklar: Open-Meteo (`WEATHER_CITY/LAT/LON`), TCMB `today.xml` + arşiv (7 iş günü, hafta sonu 404'ü kalıcı önbellekte), `news.ts` önbelleği, RouteLLM `/models` gecikmesi. Hepsi anahtarsız. Uydurma veri yok: kaynak çökerse alan `null`, panel "veri alınamadı".
  - TCMB kurları 15:30'da çıkar; öncesinde `today.xml` son iş gününü verir, panel bülten tarihini gösterir. Altın yok (anahtarsız güvenilir kaynak bulunamadı).
  - Araçlar: `get_markets`, `get_weather` her sohbette açık; `get_news` yalnızca "aydınlat beni"de. Döviz grafiği `history` ile kuruluyor ve `verifyVisual`'dan geçiyor (testte 7/7 değer TCMB ile birebir).
  - Arayüz: `web/src/components/dashboard/`. Konuşurken sağdaki GÜNDEM paneli "Bugünün akışı"na dönüşür, PİYASALAR kalır; anlatılan cümlede dolar/euro/sterlin/hava geçerse ilgili panel 1,5 sn parlar. Dikey ekranda yalnızca üst özet şeridi + alt haber şeridi.
  - Konuşurken panelleri soldurmak için `filter: opacity()` kullanılıyor: framer-motion opacity'yi satır içi stile yazıyor, CSS `opacity` işe yaramaz.
  - "Soluk düğme" hatası: sekme gizliyken Chrome animasyon zaman çizelgesini durduruyor, opaklık animasyonları ~%60'ta donuyordu. Sayfa görünür olunca sonlu animasyonlar `finish()` ile tamamlanıyor.
- **Ses (5 Ekim, ikinci tur) — yukarıdaki "Ses: Gemini" satırı ARTIK GEÇERSİZ:**
  - Gemini TTS aynı ses kimliği + aynı metinle her istekte farklı perde üretiyor (onyx 125–197 Hz; temperature 0 ve seed etkisiz). "Ses sürekli değişiyor" şikâyetinin kök nedeni buydu. Hiçbir Gemini sesi kararlılık testini geçmedi.
  - gpt-audio'yu önceden yanlış sebeple elemiştik: talimat SİSTEM mesajındayken cevap veriyordu. Talimat + metin aynı KULLANICI mesajında ve İNGİLİZCE olunca birebir okuyor (Türkçe talimatta "Tabii, işte okuyorum" diye başlıyor). Varsayılan: `gpt-audio-1.5` + `onyx`.
  - `npm run voices`: her sesi gerçek istekle sınar (sadakat + 6 örnekte perde ±25 Hz + en az 70 kelime/dk); sonuçlar turlar arasında birikir, bir kez sapan/kararsız ses listeye girmez. Katalog: `server/data/voices.json`.
  - Seçim Ayarlar → Ses'ten (sunucu `state.voice`, tüm cihazlarda ortak), her cevaba sabitlenir (`reply.voice`). Bir sahnenin sesi iki denemede gelmezse o cevabın KALANI tarayıcı sesine geçer. `/audio/speech` RouteLLM'de yok (404); yine de bir kez denenip hafızaya alınır.
- **Akış (stream):** `routellmStream` + `SceneStream`: sahneler JSON tamamlanmadan ayıklanır, SSE `scene` olayıyla gider, TTS hemen başlar (aynı anda en fazla 3). Oynatıcıda zorunlu minimum sahne süresi kaldırıldı (yalnız görselli sahnede 1,2 sn), sahne arası 80 ms. Ölçüm: brifingde ilk haber sesi 36,6 → 13,1 sn; basit sohbet 10,2 → 6,5 sn.
- **Görseller:** yeni tipler `ikon`, `kart`, `adimlar`, `alinti`, `kisi_yer` (lucide-react ikonları). Her cevapta en az bir görsel. `wiki_lookup` aracı (tr → en Wikipedia; lisanslı fotoğraf + koordinat). Fotoğraf zinciri: haber → Wikimedia → stok → temsili yapay zeka görseli (`IMAGE_MODEL=flux2`, yalnız kart/adım/liste; gerçek kişi/olay asla) → ikon.
  - `verifyVisual` artık sayıyı sınırlarına duyarlı arıyor ve Türkçe biçimleri tanıyor (5.910.320 · 8.848,86); yuvarlanmış sayı ("8848", "5.900.000") ve alt dizi eşleşmesi ("2.07" ⊂ "12.07") reddediliyor.
- **Diğer:** STT RouteLLM'den (`/api/stt`, `STT_MODEL=gemini-2.5-flash`; `/audio/transcriptions` yok), Web Speech yalnızca yedek. Kamera/fotoğraf düğmesi (`/api/chat` + `image`). Prompt önbelleği için değişen bağlam en sonda (iki istekte ortak önek %99). BEYİN rozeti `router → alt model`. Jarvis router'ı README'de.
- **İki alkışla uyanma (5 Ekim):** uyku → çift alkış → "uyan Jarvis" → tüm cihazlarda senkron açılış sekansı → tek cihazdan karşılama.
  - Sunucu: `server/src/wake.ts` (ayarlar `state.wake`, `GET /api/health` gerçek kontroller) + `index.ts`'te `/api/time`, `/api/attention`, `/api/wake` (SSE `wake`, `at` = sunucu + 350 ms), `/api/sleep`. Karşılamalar seçili sesle önceden üretilip diske yazılıyor (açılışta, ses ya da metin değişince).
  - Alkış: `web/src/lib/clap.ts` `ClapDetector`. Tepe > ortam × eşik; yükselme < 10 ms; ilk 45 ms'te 2–8 kHz oranı ≥ %35; 150 ms'te sönme. Desen: 200–700 ms aralık, 400 ms içinde 3. alkış yok, ardından 3 sn bekleme.
    - fftSize 2048: 1024'te rAF kare kaybında alkışın başlangıcı pencereler arasına düşüyordu. Şartnameden bilinçli sapma.
    - Sentetik testte 14/14 doğru. Jarvis ve Yelda'nın 62 sn'lik gerçek konuşmasında ve 21 sn ritmik müzikte sıfır yanlış uyanış. Test düzeneği oturumun scratchpad'indeydi, repoda yok.
    - Gerçek oda testi Halil'e kaldı; kalibrasyon ekranı bunun için var.
  - Komut: `web/src/lib/wake.ts` `listenForCommand`. RouteLLM STT (asıl yol, alkış dinleyicisinin mikrofon akışını kullanır) ile Web Speech (ara sonuçlarla hızlandırıcı) yarışır; hangisinin yakaladığı sunucu loguna `[zaman] istemci · uyanış komutu` olarak düşer.
    - Alkıştan sonra yalnızca "uyan" yeterli (isim yanlış duyulsa da kaçmasın). Yalnızca-ses modunda "uyan" ve "jarvis" varyantı ikisi birden gerekir.
  - Senkron: Cristian algoritması, 5 denemenin en kısa gidiş-dönüşü. Bağlanınca, dakikada bir ve sekme görünür olunca ölçülüyor. Node testinde (5 sahte cihaz; saat kayması +90 sn'ye kadar, 25 ms asimetrik gecikme) sapma 0–12 ms.
  - Sekans zamanlayıcıları Web Worker'da (`preciseTimeout`): arka plandaki sekmede Chrome ana iş parçacığı zamanlayıcılarını 1 sn'ye hizalıyor, Chrome testinde sapma 371 ms → 0,5–12,5 ms oldu.
  - Tını ve karşılama yalnızca karşılayan cihazda çalar (yankı olmasın). Kontrol satırları ✓/⚠/✗; kısmi kaynak ⚠.
  - Uyumayan cihazlar kısa bir parlama yapar ve altyazıyı gösterir.
  - Sekans zamanları `App.tsx` içindeki `SEQ`; çekirdekte halkaları sırayla çizen `introAt`.
- **Henüz yapılmayan:** Düşen RSS kaynakları (AA ECONNRESET, NTV spor 301, T24 sertifika, Cumhuriyet ara sıra zaman aşımı).

## Proje ne
- Halil'in (herkodolog, Instagram Reels + YouTube Shorts içerik üreticisi, yazılımcı) Abacus AI sponsorluğundaki video serisi için geliştirdiği kişisel asistan.
- Bilgisayar, tablet ve telefonda çalışan TEK bir asistan; konuşma tüm cihazlarda ortak.
- Uygulamanın beyni: **Abacus AI RouteLLM API** (`https://routellm.abacus.ai/v1`, OpenAI uyumlu, model `route-llm` otomatik yönlendirir).
- Kodu Claude ile birlikte geliştiriyoruz; **videoda Claude gösterilmeyecek.** (Yanlış iddia da yok: "kodu RouteLLM ile yazdım" denmeyecek, ama "Jarvis'in beyni RouteLLM" doğru ve videonun merkezinde.)

## Hesap / kredi
- Abacus ChatLLM hesabında 20.000 kredi var (0 kullanılmış, Ekim 2026). Abacus gerekirse fazlasını sağlıyor; Halil için API ücretsiz.
- API anahtarı: apps.abacus.ai → LLM APIs. Anahtar `server/.env` içine Halil tarafından yazılır (Claude anahtar girmez).
- Sponsor (global şirket) içerik konusunda esnek; sponsor kaygılarını hesaba katmaya gerek yok.

## Seri planı (taslak)
Her bölüm tek başına güçlü + bir sonrakine köprü. Şu an Abacus onayı yalnızca Bölüm 1 için.

1. **Tek beyin, üç beden** — Sabah Mac'te "günaydın jarvis, gündemi özetle" → detaylı + samimi gündem özeti, sahne sahne görsellerle. Evden çıkarken telefonda "devam et" → kaldığı yerden sürüyor (cihaz devri animasyonu). RouteLLM = "birden fazla beyin", ekranda model rozeti. ManyChat: JARVIS. Köprü: "her yerde beni duyuyor ama sadece konuşabiliyor; sonraki bölümde ona eller vereceğim".
   - Hook adayları (karar Halil'in): "türkiye'nin gündemini takip etmek başlı başına bir iş. ben bu işi jarvis'e devrettim" · "bir yıl önce bilgisayarıma jarvis yaptım. kodlarını kaybettim. bu sefer onu öyle bir yere koyacağım ki kaybolmasın" · "iron man'deki jarvis'ten daha zeki yapay zekalarımız var. ama hiçbiri jarvis değil"
2. **Jarvis bilgisayarımı kullanıyor** — telefondan komut, Mac'te Chrome kendi kendine çalışıyor (Playwright MCP, yerel ajan, geri alınamaz işlemlerde onay). Masaüstü kabuğu için Tauri/Electron.
3. **Beni benden iyi tanıyan Jarvis** — hafıza, rutinler, gündem özetini kişiselleştirme, video sonrası yorum özeti.
4. **Cevap vermeyen Jarvis** — Tembel Beyin Bölüm 2 ortak; soru sorarak düşündüren mod.
5. **Jarvis, kahve yap** — Evimi Akıllandırıyorum ortak; ManyChat KAHVE.

Not: Halil'in eski Electron Jarvis'inin kodu yok; sıfırdan yapıldı.

## Tasarım kararları
- Arayüz filmdeki Jarvis'in kopyası DEĞİL; özgün bilim kurgu HUD (telif). Renkler: koyu zemin, camgöbeği `#4de1ff` + amber `#ffb547`. Fontlar: Rubik + JetBrains Mono.
- Cevaplar **sahne** formatında: her sahne = 1-2 cümle ses + 1 görsel (yok/baslik/sayi/grafik/harita/karsilastirma/zaman/liste). Arayüz sesi ve animasyonu sahne sahne senkronlar.
- Gündemde: önce `get_news` (RSS), sadece dönen haberler; her madde kaynaklı; siyasette tarafsız; kaynaklar farklı anlatıyorsa karşılaştırma görseli.
- Görsel doğruluk: sayı/grafik/harita verisi araç çıktısında birebir geçmezse sunucu görseli başlığa düşürür.
- Fotoğraflar: **Haber modu** (haberin kendi fotoğrafı, kişisel kullanım) / **Video modu** (Pexels/Unsplash stok; videoda telif riski olmasın). Model URL yazmaz; `haber_id` + `foto_arama` verir.
- Telefon arayüzü dikey video güvenli alanına göre; ekran kaydı doğrudan videoya girebilmeli.

## Teknik durum (v0.1)
- `web/`: React + Vite PWA, framer-motion, canvas çekirdek, SSE ile senkron, Web Speech API ile bas-konuş (masaüstünde boşluk tuşu).
- `server/`: Express; `/api/chat` tool-calling döngüsü; RouteLLM'in tool call'u düz metin döndürme sorununa fallback; JSON şema doğrulama; demo modu (anahtar yoksa).
- Test edilenler: demo modunda masaüstü + telefon uçtan uca, cihaz devri, sahte RouteLLM sunucusuyla tool calling (yapılandırılmış + düz metin).
- **Henüz test edilmeyenler:** gerçek RouteLLM, RSS akışlarının erişilebilirliği (`npm run test`), RouteLLM ses modeli adı (`npm run models` → `TTS_MODEL`).
- Telefon/tablet: `npm start` + `cloudflared tunnel --url http://localhost:8787` + `ACCESS_TOKEN`.

## Sıradaki adımlar
1. Halil'in MacBook'unda (kullanıcı `herkodolog`) Node.js kur (yoksa), projeyi `~/Projects/jarvis` içine aç, `npm run setup && npm run test && npm run dev`.
2. `npm run test` sonucuna göre çalışmayan RSS kaynaklarını düzelt; tool calling'i doğrula.
3. Türkçe TTS sesini seç ve dene.
4. Bölüm 1 çekim metni.

Halil'in çalışma tercihleri: Türkçe yaz; kendi cümlelerini silip yerine yazma, önerileri ayrı sun; reddettiği öneriyi tekrar açma; çekim metinleri küçük harfli seslendirme dilinde, paragraf blokları hâlinde.
