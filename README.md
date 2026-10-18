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

### Akıllı ev

Alt şeritteki **Ev** düğmesi panelini açar. Panelde dört cihaz var:
- Salon ışığı ve çalışma odası ışığı: aç/kapat, parlaklık, sıcak/nötr/soğuk ton.
- Türk kahve makinesi: köpük, şeker, "Pişir".
- Filtre kahve makinesi: 1–4 fincan, "Demle", demleme bitince sıcak tutma.

Sesle de çalışır: "Jarvis, salonun ışığını aç", "çalışma odasını yüzde otuz yap, soğuk beyaz", "filtre kahveyi iki fincan demle", "kahvem hazır mı?", "tüm ışıkları kapat". "Bana bol köpüklü bir Türk kahvesi yap" Türk kahve makinesini de çalıştırır. Mark 2'nin sağ sütunundaki **EV** kutusu anlık durumu gösterir. Jarvis bir cihazı değiştirince bütün ekranlarda kısa bir bildirim çıkar.

- **Simülasyon (varsayılan):** Cihazlar sunucuda canlandırılır; kahve makineleri gerçekçi sürede ilerler (Türk kahvesi ~75 sn, filtre fincan başına ~40 sn). Panelde "simülasyon" etiketi görünür. Jarvis bunu her cevapta söylemez, sorulursa dürüstçe söyler.
- **Gerçek cihazlar (Home Assistant):** `.env`'ye `HOME_ASSISTANT_URL`, `HOME_ASSISTANT_TOKEN` ve `HA_ENTITIES` eşlemesini yazın. Işıklar `light.turn_on/off` (parlaklık, renk sıcaklığı) ile, kahve makineleri akıllı priz (`switch`) ile açılıp kapanır. Bu köprü henüz gerçek bir Home Assistant ile denenmedi.

### El Kontrolü ✋

Jarvis'i ellerinizle yönetin. Mac'in kamerası açılır, eller tarayıcıda takip edilir (MediaPipe Hand Landmarker), görüntünün üstünde efektler canlanır. Kamera görüntüsü hiçbir yere gönderilmez.

**Açmak için:** alt şeritteki **✋** düğmesi (Mark 2'de **El**), klavyede **H** ya da sesle *"Jarvis, el kontrolünü aç"*. Kapatmak için **Esc** ya da *"el kontrolünü kapat"*. Adresin sonuna `?el=1` eklerseniz Jarvis el kontrolüyle açılır.

**Efektler (anında):**

| Jest | Ne olur |
|---|---|
| ✋ Açık el | Avuç ve parmak uçları alev alır, parmaklar arasında kıvılcım atar |
| ✋✋ İki açık el | İki avucun önünde dönen turuncu mühür halkaları açılır. Eli yana çevirince halka da perspektifle daralır |
| 🤏 Çimdik (başparmak + işaret) | Parmak uçlarınızda bir parçacık gezegeni oluşur: Satürn, Dünya, Mars, Jüpiter, Ay ya da Güneş (varsayılan: her çimdikte sıradaki; **⚙ efektler**'den sabitlenebilir). Elinizle taşırsınız, elinizi çevirince Satürn'ün halkası eğilir. Sesle: *"Jarvis, Mars yap"*, *"Jüpiter'e çevir"*: eldeki gezegen dağılıp yeni haliyle toplanır; gezegen yoksa bir sonraki çimdikte o gelir |
| 🤏🤏 İki elle çimdik | Gezegeni iki elinizin arasında tutup açarak büyütürsünüz |
| Çimdiği bırakmak | Gezegen havada süzülür. Hızlı savurarak bırakırsanız fırlar |
| ✊ → ✋ Yumruk yapıp hızla açmak | Gezegen varsa kendi renklerinde patlar, yoksa avuçtan bir enerji dalgası çıkar. Ekran sarsılır |
| ☝️☝️ İki işaret parmağı | İki parmak ucu arasında şimşek çakar |
| ☝️ Tek işaret parmağı | Parmak ucu havada ışık izi bırakır |

**Jarvis kontrolleri (basılı tutun, halka dolunca çalışır):**

| Jest | Süre | Eylem |
|---|---|---|
| 👍 Başparmak | 1 sn | "Jarvis, bana bol köpüklü bir Türk kahvesi yap" komutu gider. Jarvis cevabını seslendirir, altyazı ekranda görünür |
| ✌️ Zafer | 0,9 sn | Salon ışığı açılır/kapanır |
| ✊ Yumruk | 1,8 sn | Jarvis konuşuyorsa susar |

Jest → eylem listesi `web/src/hands/controller.ts` içindeki `KONTROLLER` dizisindedir. Bir satır ekleyerek yeni komut tanımlayabilirsiniz. `{ tip: 'komut', metin: '…' }` Jarvis'e sesli komut gibi gider.

**Yüz HUD kilidi:** Kamera yüzünüzü bulunca etrafında hedef çerçevesi kapanır. Önce amber renkte "KİLİTLENİYOR", ardından kısa bir kilit sesiyle "AD · TANINDI · YETKİ: TAM" yazar; ad `server/.env`'deki `USER_NAME`'den gelir. Altında algılayıcının gerçek güven skoru görünür. **F** tuşu açıp kapatır. Kilit kapanınca Jarvis seçili sesle "Yüz tanındı. Hoş geldiniz efendim, tam yetki verildi." der (ses sunucu açılırken önceden hazırlanır, beklemeden çalar). En fazla dakikada bir söyler ve Jarvis o sırada konuşuyor ya da düşünüyorsa araya girmez.
- Bu yüz **tanıma** değil, yüz **algılama**dır (MediaPipe BlazeFace). Kim olduğunuzu bilmez, biyometrik veri tutmaz, görüntü hiçbir yere gitmez.
- Etiket yalnızca kameraya en yakın (en büyük) yüze verilir. Kadrajdaki diğer yüzler "KİŞİ · TANIMLANMADI" olarak işaretlenir; bir misafir sizin adınızla etiketlenmez.

**Efektleri aç/kapat:** üst şeritteki **⚙ efektler** düğmesi ya da **E** tuşu. Ateş, mühür, gezegen, patlatma, şimşek, ışık izi, Jarvis kontrolleri (👍 ✌️ ✊), yüz kilidi, kitaplık ve efekt sesleri ayrı ayrı kapatılır; kapalı efekt hiç tetiklenmez. Seçim bu cihazda saklanır. "Raf bölgesinde ateş/iz yok" açıkken kitaplığa uzanan elde ateş, ışık izi ve şimşek çıkmaz.

**Çekim tuşları:** **L** arayüzü gizler (temiz kayıt) · **E** efektler · **F** yüz kilidi · **K** kitaplık ayarı · **D** el iskeletini gösterir · **M** efekt seslerini kapatır · **C** kamerayı değiştirir (iPhone'u Süreklilik Kamerası olarak kullanabilirsiniz).

**Kamerasız deneme:** `http://localhost:5173/?el=demo` sentetik ellerle bütün efektleri sırayla oynatır. Demoda komut gönderilmez.

**Notlar:**
- İlk açılışta el takip modeli (~7,5 MB) ve yüz algılama modeli (~0,2 MB) Google'ın sunucusundan iner. Çevrimdışı kullanmak için bir kez `npm run el-modeli` çalıştırın.
- Chrome önerilir. Model GPU'da çalışır, açılmazsa kendiliğinden CPU'ya geçer. Üst şeritte FPS ve el sayısı yazar.
- Işık iyi olsun ve eller kadrajda tam görünsün. Arkadan gelen güçlü ışık takibi bozar.
- Efektler tamamen özgün ve prosedüreldir: görsel ya da video dosyası kullanılmaz, sesler de anında sentezlenir.

#### Kitaplık 📚

Arkanızdaki kitaplığa elinizi uzatın: görüntüde elinizin değdiği kitap seçilir. Çimdikle tutup kendinize çekince kitap raftan kopar, size doğru uçar, kapağını gösterir ve holografik olarak açılır. İçinde Jarvis'in özeti ve sizin notlarınız var. Rafa fiziksel olarak dokunmanız gerekmez; elin görüntüde sırtla çakışması yeterli.

**Kurulum (bir kez):** Kamera sabit olduğu için kitapların yeri çekimden önce bir kez bulunur ve `server/data/kitaplik.json`'a kaydedilir. Sayfa yenilense de harita kalır.
1. El Kontrolü'nü açın, **K** ile kitaplık ayarına girin, **Kitaplığı tara**'ya basın. Sesle de olur: *"Jarvis, kitaplığımı tara"* (El Kontrolü kapalıysa açılır).
2. Kameradan tam çözünürlükte tek kare alınır, örtüşen 6 parçaya bölünüp büyütülür ve görüntü modeline (`VISION_MODEL`, varsayılan `gemini-3.8-flash`) gönderilir. Model yalnızca sırtta gerçekten okuduğu adı yazar; okuyamadığı sırtlar "belirsiz" olur. Tarama 20-30 saniye sürer. Ekranda raf boyunca tarama çizgisi geçer, bulunan sırtlar sırayla parlar, sonunda "51 kitap tanındı · 143 belirsiz" gibi bir özet çıkar.
3. **Bir kez daha tarayın.** İkinci taramadan itibaren parçalar yalnızca rafın bulunduğu bölgeyi kapsar; sırtlar daha büyük göründüğü için çok daha fazlası okunur. (Uzaktan çekilmiş gerçek bir raf fotoğrafında tam kare 20 kutu bulurken raf bölgesine odaklanan tarama 51 doğru ad okudu.)
4. Düzeltme: ayar modunda amber kesikli kutular belirsizdir; tıklayıp adını yazın. Boş yere sürükleyerek kaçırılan kitaba kutu çizin, kutuyu sürükleyip taşıyın, köşesinden boyutlandırın, **Del** ile silin. **Kaydet**'e basın. Elle düzelttiğiniz adlar yeniden taramada ezilmez; notlar ve özetler korunur.

**Jestler:**

| Jest | Ne olur |
|---|---|
| ☝️ İşaret ucunu sırta doğru getirin | Raf bölgesinde parmak ucunda küçük bir nişangâh görünür. Ucun hizasındaki en yakın sırt 0,15 sn sonra seçilir (tam üstünde olmak gerekmez): kenarı amber parlar, üstünde "OTOSTOPÇUNUN GALAKSİ REHBERİ · ADAMS" etiketi çıkar. Komşu kitaba geçmek için parmağın belirgin biçimde ona yaklaşması gerekir, titremez |
| 🤏 Seçiliyken çimdik | Kitap tutulur: titreşen çerçeve, ince bir ses, sırt yerinden hafifçe çıkar |
| 🤏 Tutarken kendinize çekin | Eli raftan uzaklaştırınca ya da kameraya yaklaştırınca kitap kopar. Uçan kitap o anki kareden kırpılan **gerçek sırt görüntüsünü** taşır; rafta yeri karanlık bir boşluk olarak kalır |
| (1 sn bekleyin) ya da ✋✋ iki eli açın | Kapak holografik iki sayfa olarak açılır: künye ve okuma ilerlemesi, Jarvis'in özeti, Jarvis'in kitap defteri (ana fikirler, yazar ve temalar, neden okumalı, rafınızdan benzer kitaplar), sonra sizin notlarınız ve alıntılarınız |
| ✋ Açık avucu sola / sağa savurun | Sonraki / önceki sayfa |
| 👍 Basılı tutun (1 sn) | Jarvis özeti seçili sesle okur. *"Jarvis, bunu özetle"* demek de olur |
| ✊ Basılı tutun (0,9 sn) ya da açık avucu ileri itin | Kitap kapanıp rafına geri uçar, boşluk kapanır, sırt kısa bir an parlar |

Kitaplık bölgesinde çimdik gezegen oluşturmaz, kitap seçer. Kitap dışarıdayken ateş, mühür, gezegen, şimşek ve diğer basılı tutma kontrolleri kapalıdır; kitap rafa dönünce her şey eski hâline gelir.

**Kapaklar:** Sunucu Open Library'de ad ve yazarla arar, bulursa `server/data/kapaklar/` altına kaydeder (çoğu zaman İngilizce baskının kapağı gelir). Türkçe baskının kapağını isterseniz **Ayarlar → Kitaplık**'tan telefonla fotoğrafını yükleyin. Kapak hiç yoksa kırpılan sırt görüntüsü ve adla sade bir kapak üretilir.

**Jarvis'in kitap defteri:** Adı bilinen bir kitap ilk açıldığında (ya da sesle eklendiğinde) Jarvis RouteLLM ile sayfalarını doldurur: 3 cümlelik özet, 4-6 ana fikir, yazar hakkında, temalar, neden okumalı, kime uygun ve **sizin kitaplığınızdan** en fazla 4 benzer kitap. Bir kez yazılır, saklanır. Kurallar: model kitabı tanımıyorsa sayfa uydurmaz ("Jarvis bu kitabı tanımıyor"); kitaptan birebir alıntı üretmez (alıntılar yalnızca sizin eklediklerinizdir). **Ayarlar → Kitaplık**'ta "Jarvis doldursun / yeniden yaz" düğmesi de var. Sesle: *"Davranış'ın sayfalarını doldur"*.

**"Bu kitabın adı …":** Adı okunamamış bir kitabı El Kontrolü'nde açıp *"Jarvis, bu kitabın adı Davranış"* deyin: Jarvis "Tamamdır efendim, ekliyorum" der, kitap adlandırılır, kapağı aranır ve sayfaları birkaç saniyede dolar. Kitap açık değilken *"kitaplığıma Davranış'ı ekle"* derseniz eklenir ve sayfaları arka planda dolar.

**Kitapları kalıcı olarak tanıtmak:** Kamera uzaktaki sırtların çoğunu okuyamaz; Jarvis'in kitaplarınızı bilmesi için kamerayı beklemeyin:
- **Ayarlar → Kitaplık → 📷 Raf fotoğrafından ekle:** telefonla raflara yakından çekin (bir fotoğrafta bir iki raf) ve yükleyin. Okunan kitaplar kalıcı olarak kaydedilir, zaten olanlar tekrar eklenmez. Birden çok fotoğraf aynı anda seçilebilir.
- **Elle:** aynı yerde ad ve yazar yazıp **Ekle**. Sesle: *"Jarvis, kitaplığıma Davranış'ı ekle"*.
- Bu kitapların rafta yeri yoktur; El Kontrolü'nde **K** ile adsız (amber) bir kutuya tıklayıp adını yazmaya başlayın, kayıtlı kitaplar öneri olarak çıkar; seçince kitap o kutuya yerleşir (notları ve özeti korunur). **Kaydet**'e basın.

**Notlar ve hafıza:** **Ayarlar → Kitaplık**'ta her kitabın durumu (okunacak / okunuyor / bitti), sayfası, notları, alıntıları, özeti ve kapağı düzenlenir. Sesle de olur (**boşluk** tuşuyla konuşun, El Kontrolü açıkken de çalışır): *"Jarvis, Mülksüzler'e not ekle: …"* (kitap kayıtlı değilse eklenir), *"Tahıla Karşı'yı bitirdim"*, *"Oblomov'da 120. sayfadayım"*. Kitap El Kontrolü'nde açıkken adını söylemeden *"not al: …"* ya da *"alıntı ekle: …"* deyin; not o kitaba eklenir ve sayfada hemen görünür. Kaydedilen kitaplar Jarvis'in talimatına kendiliğinden girer: *"kitaplığımda ne var"*, *"raftan bir kitap öner"* sorularını yalnızca kendi kitaplarınızdan cevaplar.

**Kamera kıpırdarsa:** Kurulumda rafın küçük gri bir resmi saklanır. El Kontrolü açıkken 3 saniyede bir karşılaştırılır; kamera kaymış, dönmüş ya da yakınlaşmışsa üstte "KAMERA KIPIRDAMIŞ · KİTAPLIĞI YENİDEN TARA" uyarısı çıkar (efekt çalışmaya devam eder). Önden geçen biri, ışık değişimi ya da görüntü gürültüsü uyarı tetiklemez.

**İpuçları:**
- Taramayı çekimdeki ışıkta yapın; sırtlar ne kadar net görünürse o kadar çok kitap okunur.
- Çekimde gösterecekleriniz birkaç kitapsa, belirsiz kalanlarla uğraşmayın: yalnızca o kitapların adını ayar modunda yazmanız yeterli.
- Nişangâhı izleyin: seçim parmak ucunun gördüğü yere göre yapılır, elinizin geri kalanına göre değil. **D** el iskeletini gösterir.
- Kitaba uzanırken ateş araya giriyorsa **⚙ efektler**'den "Raf bölgesinde ateş/iz yok"u açık tutun ya da ateşi tamamen kapatın.

**Kamerasız deneme:** `?el=demo&kitaplik=1` arka plana raflarınızdaki kitaplardan oluşan prosedürel bir kitaplık çizer (sahte kamera akışı olarak, yani kırpma ve tarama gerçek yoldan geçer). Demo döngüsü: tarama → seç → tut → çek → kapak → aç → sayfa çevir → 👍 özet → ✊ rafa koy. Demoda **J** kamerayı "kıpırdatır" (uyarıyı denemek için). Demo değişiklikleri sunucuya kaydedilmez.

**Test:** `npm --prefix server run test:kitaplik` tarama uç noktasını sahte model cevaplarıyla dener (geçersiz JSON, taşan kutu, boş sonuç, parçaların birleştirilmesi, notlar). Gerçek kitaplığa dokunmaz.

### Kamera cihazı (Jarvis'in gözü)

Eski bir iPhone Jarvis'in gözü olur. Görüntüsü bilgisayarda ve tablette canlı izlenir; "Jarvis, mutfakta ne var?" deyince Jarvis anlık bir kareye bakıp yorumlar.

**Önce: erişim anahtarı.** Kamera görüntü taşıdığı için `server/.env` dosyasında `ACCESS_TOKEN` yoksa özelliğin tamamı kapalıdır; bütün kamera uç noktaları 403 döner. Uzun ve rastgele bir değer yazın. Ardından her cihazda Jarvis'i bir kez `https://…/?token=DEĞER` adresiyle açın; token o cihazda saklanır.

**iPhone kurulumu (iPhone 11, Safari):**
1. Safari'de Jarvis'i HTTPS adresinden açın (Tailscale: `https://<bilgisayar-adı>.<tailnet>.ts.net/?token=…`). Kamera düz HTTP'de çalışmaz.
2. Ayarlar → **Bu cihazın rolü → Kamera**. Sayfa kamera ekranına geçer.
3. **Kamerayı başlat**'a dokunun ve izin verin. Sonraki açılışlarda kendiliğinden başlar; Safari izni sorarsa Safari → aA → Web Sitesi Ayarları → Kamera: İzin Ver yapın.
4. Kamera ekranında Ayarlar'dan ad (CAM-01), konum (MUTFAK), ön/arka kamera ve hareket hassasiyetini girin.
5. Ekranın kapanmaması için: iOS 16.4 ve sonrasında Jarvis ekranı kendisi açık tutar. Tutamazsa ekranda uyarı çıkar; o durumda *Ayarlar → Ekran ve Parlaklık → Otomatik Kilit: Asla* yapın ya da *Rehberli Erişim*'i açın (Erişilebilirlik → Rehberli Erişim; Safari açıkken yan tuşa üç kez basın).
6. Telefonu şarjda tutun. Kamera ekranı ısınmayı azaltmak için karanlık ve önizleme küçüktür. Kare hızı düşerse çözünürlük kendiliğinden 480p'ye iner.

**İzleme:** Kamera bağlanınca ekran cihazlarının sol altında `● CAM-01 · MUTFAK` düğmesi belirir. Alt şeritteki **Kamera** düğmesi de paneli açar; **Fotoğraf** düğmesi ise eskisi gibi Jarvis'e fotoğraf gönderir. Tıklayınca küçük pencere açılır, görüntüye tıklayınca tam ekran olur.
- Önce doğrudan WebRTC (**P2P**) denenir; görüntü sunucudan geçmez.
- 7 sn'de kurulamazsa panel saniyede bir kare alan yedek moda (**KARE**) geçer.
- Aynı anda en fazla 3 izleyici. Panel kapalıyken bağlantı açılmaz; izleyici yokken kamera düşük çözünürlükte yalnızca hareket algılar.
- Birden fazla kamera varsa paneldeki sekmelerden geçilir.

**Tailscale ve tüneller:** Tailscale'de cihazlar genellikle doğrudan bağlanır. Cloudflare tüneli gibi yalnızca HTTP taşıyan yollarda WebRTC TURN sunucusu olmadan kurulamayabilir. O durumda panel KARE moduna düşer; ya da `.env`'ye `TURN_URL / TURN_USERNAME / TURN_CREDENTIAL` girin.

**Jarvis'in bakması:** "Jarvis, mutfakta ne var?", "Kahve makinesinin önünde fincan var mı?", "Kapıya bak".
- Jarvis kameradan tek bir anlık kare ister; 5 sn'de gelmezse "kamera yanıt vermedi" der.
- Kareyi RouteLLM görüntü modeli yorumlar: `VISION_MODEL`, boşsa `gemini-3.8-flash`. `npm run models` çıktısında `input_modalities` içinde `image` olan modeller kullanılabilir.
- İzleyici ekranlarında panel öne gelir, tarama oynar ve analiz edilen kare 3 sn donar.
- Jarvis yalnızca karede görüneni söyler; emin değilse "net göremiyorum" der, kişileri adıyla tanımlamaz. Kamera kapalıysa "CAM-01 çevrimdışı" der.

**Kahve falı (eğlence):** Fincanın fotoğrafını **Fotoğraf** düğmesiyle gönderin ya da fincanı kamera cihazına gösterip "Jarvis, falıma bak" deyin. Jarvis telvede gerçekten görünen şekillerden esprili bir fal okur ve bunun bilim olmadığını bir kez söyler.

**Hareket algılama:** Tamamen telefonda çalışır (küçük gri karelerin farkı); RouteLLM'e kare gitmez. Panelde "HAREKET" etiketi yanar. Kamera ekranından kapatılabilir.

**Gizlilik:**
- Hiçbir kare diske, loga ya da repoya yazılmaz.
- Sunucu yalnızca son kareyi bellekte tutar; kamera çevrimdışı olunca siler.
- Jarvis'in baktığı kare görüntü modeline (RouteLLM) gönderilir.
- Kamera ekranında "CANLI · 2 izleyici" göstergesi, birinin izlediğini belli eder.
- Evdeki diğer kişileri kameranın varlığından haberdar edin. Banyo ya da yatak odası gibi özel alanlara kurmayın.

### YouTube: maç özeti ve video

- **"Jarvis, Barça maçının özetini aç":** Takımın en yeni özetini resmi YouTube kanallarında bulur, kısa bir cümle söyler ve videoyu Jarvis'in içinde açar. Varsayılan branş futboldur; basketbol ve voleybol için açıkça söyleyin.
  - Taranan kanallar: S Sport (La Liga, Serie A, Bundesliga Türkçe özetleri), beIN SPORTS Türkiye (Süper Lig, Ligue 1), TRT SPOR (Şampiyonlar Ligi), LALIGA, Serie A, UEFA, Premier League, FC Barcelona, Real Madrid.
  - Aynı maçın özeti birden fazla kanalda varsa önce Türkçe yayıncı seçilir.
  - S Sport ve LaLiga videolarını başka uygulamalarda oynatılmaya kapatıyor. Bu videolarda Jarvis içinde oynatıcı yerine "YouTube'da izle" kartı çıkar; telefonda YouTube uygulamasını açar. Oynatıcı bir kanalda engelle karşılaşırsa bunu öğrenir ve o kanalda bir daha denemez.
  - Kanal eklemek için: `YOUTUBE_CHANNELS="Ad=UC…"`.
- **"Son videomu aç":** Kendi kanalınızın son Shorts videosunu dikey çerçevede açar. Uzun video için "son uzun videoyu aç" deyin. Kanal `YOUTUBE_OWN_CHANNEL` ile tanımlanır; favori kanallar `YOUTUBE_FAVORITES` ile eklenir ("S Sport'un son videosu" da çalışır).
- **"Şunu aç: <YouTube linki>":** Verilen videoyu doğrulayıp açar.
- **"… ile ilgili bir video aç":** Genel arama için ücretsiz bir YouTube Data API anahtarı gerekir (`YOUTUBE_API_KEY`). Anahtar varsa maç özetleri de kanalın tüm geçmişinde aranır. Anahtar yoksa yalnızca son 15 video taranır.
- Video bitince panel kendiliğinden kapanır; ✕ ya da Esc ile de kapanır. Yeni soru sorunca ya da mikrofona basınca kapanır.
- Jarvis yalnızca araçların gerçekten bulduğu videoyu açabilir; video kimliği uyduramaz.
- Reels uyarısı: maç görüntüleri telif korumalıdır, videoda kısa tutun.

### ElevenLabs sesi (isteğe bağlı)

Beyin RouteLLM'de kalır, yalnızca seslendirme ElevenLabs'ten gelir.

1. elevenlabs.io'da hesap açın. Ticari kullanım (Reels) için en az **Starter** planı gerekir.
2. *Profile → API Keys* bölümünden anahtar oluşturun. Gerekli izinler: Text to Speech, Voices, User.
3. `server/.env` dosyasına şunu ekleyin: `ELEVENLABS_API_KEY=...` (isteğe bağlı: `ELEVENLABS_MODEL=eleven_v4_turbo`).
4. `npm --prefix server run eleven` komutu kullanımı, hesaptaki sesleri ve kütüphanedeki Türkçe erkek sesleri listeler. Listeden bir sesi `npm --prefix server run eleven -- ekle <owner> <voice> "Ad"` komutuyla hesaba ekleyin.
5. Ses *Ayarlar → Seslendiren* listesinde görünür. Aylık karakter kullanımı da orada yazar.

Her cümle, önceki ve sonraki cümle bağlam olarak verilerek seslendirilir; böylece tonlama sahneden sahneye kopmaz. Hız ElevenLabs tarafında uygulanır, tarayıcıda hızlandırma yapılmaz. Aynı cümleler diske önbelleklenir, tekrar çalınması kredi harcamaz.

### Ekran: Mark 1 / Mark 2

*Ayarlar → Ekran* bölümünden seçilir ve tüm cihazlarda ortaktır. Ortak ayarı değiştirmeden yalnızca bir sekmede denemek için adresin sonuna `?ui=mark2` (ya da `?ui=mark1`) ekleyin.

- **Mark 1:** sade ekran. Çekirdek, dört pano ve haber şeridi.
- **Mark 2:** yoğun HUD.
  - Üstte ayın günleri cetveli; solda tarih ve saat halkası, sistem durumu, pil ve ağ göstergeleri.
  - Ortada pusula halkalı çekirdek ve etrafındaki veri dilimleri: piyasa, gündem dağılımı, 12 saatlik hava, kaynak durumları.
  - Sağda gün doğumu ve batımı işaretli hava halkası, gündem listesi ve oturum ölçümleri (FPS, bellek).
  - Altta yuvarlak düğmeler.
  - Ekrandaki her sayı gerçektir; tarayıcı bir değeri vermiyorsa (örneğin Safari'de pil) "yok" yazar.
  - Konuşurken çekirdek sola kayar ve sahne görseli sağda çekirdeğe bağlı açılır. Sağ liste "Akış"a döner, fotoğraf sol üstteki çerçevede görünür, harita sahnesinde dünya o şehirlere döner, dolar ya da hava anılınca ilgili dilim parlar.
  - Telefonda sade bir düzene geçer.

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

Sistem prompt'u: `server/src/prompt.ts` (açıklamalı hâli: `docs/jarvis-system-prompt.md`). Haber kaynakları: `server/src/news.ts`.

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
