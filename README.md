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
- Konuşmanın devamı: ses tanımaya son 4 mesaj bağlam olarak verilir (belirsiz kelime konuşmaya göre yazılır: kitaptan konuşurken "ağır gelmesi", "yağmur gelmesi" değil). Cümle başında yanlış duyulmuş hitap ("Cervis", "Jarus") "Jarvis" olur. Jarvis kısa devam sorularını ("normal mi", "peki neden") son konuya bağlar; yanlış duyulmuş kelimeyi bağlamdan anlar. Test: `npm run test:sohbet`.
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

**Çekim tuşları:** **U** uzay modu · **B** arka plan (uzay modunda) · **L** arayüzü gizler (temiz kayıt) · **E** efektler · **F** yüz kilidi · **K** kitaplık ayarı · **D** el iskeletini gösterir · **M** efekt seslerini kapatır · **C** kamerayı değiştirir (iPhone'u Süreklilik Kamerası olarak kullanabilirsiniz).

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

**Kapaklar:** Sunucu Open Library'de ad ve yazarla arar, bulursa `server/data/kapaklar/` altına kaydeder (çoğu zaman İngilizce baskının kapağı gelir). Türkçe baskının kapağını isterseniz **Kitaplığım**'da kitabın kapağına dokunup telefonla fotoğrafını yükleyin. Kapak hiç yoksa kırpılan sırt görüntüsü ve adla sade bir kapak üretilir.

**Jarvis'in kitap defteri:** Adı bilinen bir kitap ilk açıldığında (ya da sesle eklendiğinde) Jarvis RouteLLM ile sayfalarını doldurur: 3 cümlelik özet, 4-6 ana fikir, yazar hakkında, temalar, neden okumalı, kime uygun ve **sizin kitaplığınızdan** en fazla 4 benzer kitap. Bir kez yazılır, saklanır. Kurallar: model kitabı tanımıyorsa sayfa uydurmaz ("Jarvis bu kitabı tanımıyor"); kitaptan birebir alıntı üretmez (alıntılar yalnızca sizin eklediklerinizdir). **Kitaplığım**'daki kitap sayfasında "Jarvis doldursun / yeniden yaz" düğmesi de var. Sesle: *"Davranış'ın sayfalarını doldur"*.

**"Bu kitabın adı …":** Adı okunamamış bir kitabı El Kontrolü'nde açıp *"Jarvis, bu kitabın adı Davranış"* deyin: Jarvis "Tamamdır efendim, ekliyorum" der, kitap adlandırılır, kapağı aranır ve sayfaları birkaç saniyede dolar. Kitap açık değilken *"kitaplığıma Davranış'ı ekle"* derseniz eklenir ve sayfaları arka planda dolar.

**Kitapları kalıcı olarak tanıtmak:** Kamera uzaktaki sırtların çoğunu okuyamaz; Jarvis'in kitaplarınızı bilmesi için kamerayı beklemeyin:
- **Kitaplığım → Bölümler:** her bölümü telefonla yakından çekip yükleyin (aşağıda). Okunan kitaplar kalıcı olarak kaydedilir, zaten olanlar tekrar eklenmez.
- **Elle:** aynı yerde ad ve yazar yazıp **Ekle**. Sesle: *"Jarvis, kitaplığıma Davranış'ı ekle"*.
- **Telefonla:** Kitaplığım → 📷 Kitaplık kamerası adı net okunan yeni kitapları ekler (aşağıda).
- Bir sonraki **taramada** kayıtlı kitapların listesi görüntü modeline aday olarak verilir: uzaktan yarım okunan bir sırt (harfler, kelime uzunluğu, yazar) listedeki bir adla açıkça uyuşuyorsa kitap o sırta kendiliğinden yerleşir. Listedeki bir ad yalnızca bir sırta verilir ve daha yüksek güven ister (`LISTE_EMIN` = 0.6); uyuşma zayıfsa sırt belirsiz kalır.
- **Tahmini yerleştirme:** taramadan (ve bölüm tamamlamasından) sonra hâlâ adsız kalan sırtlar okuma sırasıyla (raf raf, soldan sağa) numaralanıp rafın kırpıntısına çizilir; rafta yeri olmayan kayıtlı kitaplar bu sırtlara **tahminen** yerleşir. Önce görüntü modeli her sırta en olası kitabı seçer (harfler, renk, kalınlık, seri); kalan kitaplar boş sırtlara eklenme sırasıyla dağıtılır (telefonla raf raf eklendiği için sıra rafa yakındır). Rafta mor "≈" ile yazılır; Kitaplığım'da "rafta yeri tahmini" görünür. Sonraki taramada o sırtın gerçek adı okunursa tahmin bırakılır; okunmazsa yer korunur. Öneriden okuma listesine eklenen kitaplar (rafta değil) yerleşmez. Demo: `?el=demo&kitaplik=1&tahmin=1`.
- Yerleşmeyen kitapların rafta yeri yoktur; El Kontrolü'nde **K** ile adsız (amber) bir kutuya tıklayıp adını yazmaya başlayın, kayıtlı kitaplar öneri olarak çıkar; seçince kitap o kutuya yerleşir (notları ve özeti korunur). **Kaydet**'e basın.

**Notlar ve hafıza:** **Kitaplığım**'da her kitabın durumu (okunacak / okunuyor / okundu), sayfası, bölümü, notları, alıntıları, özeti ve kapağı düzenlenir. Sesle de olur (**boşluk** tuşuyla konuşun, El Kontrolü açıkken de çalışır): *"Jarvis, Mülksüzler'e not ekle: …"* (kitap kayıtlı değilse eklenir), *"Tahıla Karşı'yı bitirdim"*, *"Oblomov'da 120. sayfadayım"*. Kitap açıkken adını söylemeden konuşabilirsiniz (aşağıda, "Açık kitapta sesli komutlar"). Kaydedilen kitaplar Jarvis'in talimatına kendiliğinden girer: *"kitaplığımda ne var"*, *"raftan bir kitap öner"* sorularını yalnızca kendi kitaplarınızdan cevaplar.

**Kitaplığım 📚:** Bütün kayıtlarınız tek ekranda. Açmak için:
- alt şeritteki kitap düğmesi (Mark 2'de **Kitaplık**),
- **K** tuşu,
- *"Jarvis, kitaplığımı aç"*.

İçinde:
- kapak ızgarası, arama, okunacak / okunuyor / okundu ve bölüm filtreleri;
- sayılar: kitap, okunuyor, okundu, bu yıl okunan, not ve alıntı;
- kitap ekleme;
- **Bölümler** sekmesi;
- **📷 Kitaplık kamerası**.

Bir kitaba dokununca sayfası açılır:
- kapak (dokunup fotoğraf yükleyin), ad ve yazar;
- durum, sayfa, bölüm;
- Jarvis'in özeti ve ana fikirleri;
- notlar ve alıntılar;
- **kayıtlar**: ne zaman not aldığınız, ne zaman okuduğunuz.

Telefonda tam ekran çalışır. Ayarlar'da yalnızca buraya giden bir bağlantı vardır.

**Bölümler (6) ve taramayı tamamlama:** Uzaktaki sabit kamera ince sırtların çoğunu okuyamaz. Kitaplığınızın 6 bölümünü telefonla yakından çekin:
1. **Kitaplığım → Bölümler**'de her bölümün kartından fotoğraf ekleyin. Bir bölüm tek karede okunmuyorsa 2-3 fotoğraf eklenebilir; aynı kitap iki kez yazılmaz.
2. Altı fotoğrafı birden yüklemek için **⇪ Toplu yükle**. Dosya adındaki rakama göre ("bolum3.jpg" → Bölüm 3), rakam yoksa sıraya göre dağılır. Yüklemeden önce atamayı değiştirebilirsiniz.
3. Jarvis her fotoğraftan kitapları raf raf, soldan sağa sırayla okur. Okuyamadığı sırt da sırası korunsun diye listede "okunamadı" olarak kalır. Bölümlere ad verebilirsiniz ("Roman", "Bilim" …).
4. El Kontrolü'nde **K** ayar modunda **B1-B6** düğmeleriyle her bölümün kameradaki alanını bir kez çizip **Kaydet**'e basın.
5. Bundan sonra her kamera taramasında, okunamayan sırtlar bölümün kamera kırpıntısına numaralanarak çizilir ve o bölümün listesiyle görüntü modeline sorulur:
   - Model yalnızca listedeki adlardan birini seçebilir; emin değilse boş bırakır.
   - Kod, adın listede olduğunu ve kitabın başka bir sırta yerleşmediğini denetler.
   - Kitabın kaydı zaten varsa (notları, özeti) o sırta taşınır.
6. Ekranda tamamlanan sırtlar yeşil parlar ve adları yazılır; üstlerinde bölüm numarası çıkar. Sonunda "65 KİTAP TANINDI · 24 BÖLÜM LİSTESİNDEN · 3 BELİRSİZ" gibi bir özet görünür.

Fotoğraflar `server/data/kitaplik-bolumler/` altında durur (repoya girmez).

**Açık kitapta sesli komutlar ve kalem:** Kitap El Kontrolü'nde ya da Kitaplığım'da açıkken adını söylemeden konuşun. Bu komutlar modele gitmez. El Kontrolü'nde kitap açıkken sağda **SESLİ KOMUTLAR** paneli bunları ve mikrofonun nasıl açılacağını (✌️ 0,6 sn basılı ya da boşluk) gösterir; sesle verilen son komutun satırı kısa süre yeşil parlar. Panel temiz çekimde (L/T) gizlenir, dar ekranda görünmez:

| Komut | Ne olur |
|---|---|
| *"Bu kitaba şu alıntıyı ekle: …"*, *"alıntı ekle: …"* | Kitap notlar sayfasına gider, holografik bir dolma kalem alıntıyı harf harf yazar (mürekkep parıltısı, kalem sesi) |
| *"Bu kitaba şu notu ekle: …"*, *"not al: …"*, *"şunu not al …"* | Aynı şekilde not |
| *"Okundu listesine ekle"*, *"bitirdim"*, *"okudum"* | Kalem künyedeki duruma onay işareti çizer, **OKUNDU ✓** damgası basılır |
| *"Okuyorum"*, *"okumaya başladım"* · *"okunacaklara ekle"* | Durum değişir |
| *"120. sayfadayım"*, *"toplam 724 sayfa"* | Sayfa ve ilerleme |
| *"Bu kitabın adı …"* · *"bunu özetle"* | Adlandırır · özeti seçili sesle okur |

Jarvis kısa bir onay söyler. Kitaplığım'da yeni kayıt satırı harf harf yazılır. Kalem yazarken sayfa çevirme ve kapatma jestleri bekler.

**Telefonda kitaplık kamerası:** **Kitaplığım → 📷 Kitaplık kamerası**. Telefonun arka kamerasıyla rafa bakın:
- Telefon kısa süre sabit durunca kare taranır.
- Karede görünen **kayıtlı** kitaplarınız holografik çerçeveyle işaretlenir. Renk duruma göredir: okunuyor amber, okundu yeşil.
- Kitaplıkta **olmayan** ama adı net okunan kitaplar kitaplığa eklenir (rafta yeri olmadan) ve mor çerçeveyle "＋ kitaplığa eklendi" diye işaretlenir. Aynı kitap ikinci kez eklenmez; adı bulanık okunan kitap eklenmez.
- Kitaba dokununca sayfası açılır; durum, not ve alıntı sesle de eklenir.
- Telefon oynayınca çerçeveler soluklaşır ve yeniden taranır. **⟳ Tara** elle tarar.

Tanıma görüntü modeliyle yapılır, gerçek zamanlı değildir: bir tarama birkaç saniye sürer (rafın bir bölümünde 16 kitap ≈8 sn). Kamera telefonda yalnızca HTTPS adresinde açılır. Kare diske yazılmaz.

**Kitap önerisi ve tarz analizi:**

| Komut | Ne olur |
|---|---|
| *"Jarvis, bugün yorgunum, bana bir kitap öner"* (ruh halinizi nasıl isterseniz söyleyin) | Jarvis **rafınızdaki okunmamış** kitaplardan ruh halinize uyanı seçer ve nedenini tek cümleyle söyler. Model yalnızca kitaplığınızdaki listeden seçebilir. El Kontrolü açıksa önerilen kitabın sırtı altın ışıkla "JARVIS ÖNERİYOR" diye parlar, sonra raftan kendiliğinden çıkıp açılır. Rafta yeri olmayan kitap ekranın altından gelir |
| *"Jarvis, tarzımı analiz et ve bana 5 güzel kitap öner"* | Okuma profiliniz çıkarılır: türler, temalar, yazarlar, en çok not aldığınız kitaplar. Jarvis tarzınızı 2-3 cümleyle anlatır ve kitaplığınızda **olmayan** 5 kitap önerir; her birinde rafınızdaki hangi kitaplara benzediği yazar. Uydurma kitap çıkmasın diye her öneri Open Library'de ad ve yazarla aranır, bulunamayan atılır. ≈10-30 sn sürer |

Sonuçlar **Kitaplığım → ✨ Öneriler**'de kapaklarıyla durur. Oradan ruh halinizi yazarak öneri isteyebilir, tarz analizini yenileyebilir, önerilen kitabı **+ Okunacaklara ekle** ile kitaplığa ekleyebilirsiniz.

**Kitap sohbeti:** Okuduğunuz kitap hakkında Jarvis'le samimi bir sohbet. Başlatmak için:
- *"Tutunamayanlar hakkında sohbet edelim"*,
- *"okuduğum kitap hakkında konuşalım"* (açık kitap, yoksa en son üzerinde çalıştığınız "okunuyor" kitap),
- *"kitap sohbetini başlat"*.

Üstte "📖 KİTAP SOHBETİ · kitabın adı" şeridi görünür. Jarvis her mesajda şunları bilir:
- kitabın künyesi,
- kaldığınız sayfa,
- notlarınız ve alıntılarınız.

Konuşma kuralları:
- İki kitapsever arkadaş gibi konuşur: kısa cevaplar, her seferinde en fazla bir soru.
- **Spoiler yok:** kaldığınız yerden sonrasını anlatmaz; yeriniz bilinmiyorsa önce "nerelerdesin?" diye sorar. Kitap bittiyse sonu konuşulabilir.
- Kitabı iyi tanımıyorsa uydurmaz; notlarınıza dayanır.
- İlginç bir düşünce söylerseniz "bunu notlarına ekleyeyim mi?" diye sorar.

Bitirmek için *"sohbeti bitir"* deyin ya da şeritteki ✕'e basın; 20 dakika sessizlikte kendiliğinden biter.

**Kamera kıpırdarsa:** Kurulumda rafın küçük gri bir resmi saklanır. El Kontrolü açıkken 3 saniyede bir karşılaştırılır; kamera kaymış, dönmüş ya da yakınlaşmışsa üstte "KAMERA KIPIRDAMIŞ · KİTAPLIĞI YENİDEN TARA" uyarısı çıkar (efekt çalışmaya devam eder). Önden geçen biri, ışık değişimi ya da görüntü gürültüsü uyarı tetiklemez.

**İpuçları:**
- Taramayı çekimdeki ışıkta yapın; sırtlar ne kadar net görünürse o kadar çok kitap okunur.
- Çekimde gösterecekleriniz birkaç kitapsa, belirsiz kalanlarla uğraşmayın: yalnızca o kitapların adını ayar modunda yazmanız yeterli.
- Nişangâhı izleyin: seçim parmak ucunun gördüğü yere göre yapılır, elinizin geri kalanına göre değil. **D** el iskeletini gösterir.
- Kitaba uzanırken ateş araya giriyorsa **⚙ efektler**'den "Raf bölgesinde ateş/iz yok"u açık tutun ya da ateşi tamamen kapatın.

**Kamerasız deneme:** `?el=demo&kitaplik=1` arka plana raflarınızdaki kitaplardan oluşan prosedürel bir kitaplık çizer (sahte kamera akışı olarak, yani kırpma ve tarama gerçek yoldan geçer). Demo döngüsü (43 sn): tarama → okunamayan sırtlar (amber) → bölüm listeleriyle tamamlama (yeşil) → seç → tut → çek → kapak → aç → sayfa çevir → sesle not (kalem yazar) → "okundu listesine ekle" (kalem işaretler, damga) → 👍 özet → ✊ rafa koy. Demo rafı 6 bölüme ayrılmıştır (üç sütun, üst ve alt yarı). Kitaplığım: `?kitapligim=1`. Öneri çağırma: `?el=demo&kitaplik=1&oneri=` (taramadan sonra hedef kitap "JARVIS ÖNERİYOR" diye raftan çıkar; `&oneri=Körlük` gibi bir ad da verilebilir). Sentetik elsiz kitaplık demosu: `&eller=yok`. Demoda **J** kamerayı "kıpırdatır" (uyarıyı denemek için). Demo değişiklikleri sunucuya kaydedilmez.

**Test:** `npm run test:kitap`. İnternet ve model gerekmez, gerçek kitaplığa dokunmaz. İki parça çalışır:
- 46 sesli komut yazımı (açık kitap komutları ve kitap sohbeti);
- `test:kitaplik` (23 test), sahte model cevaplarıyla: tarama (geçersiz JSON, taşan kutu, boş sonuç, parçaların birleştirilmesi, notlar, kayıtlı adların aday verilmesi ve tek sırta yerleşmesi, tahmini yerleştirme), bölüm fotoğrafı (raf ve sıra, okunamayanın sırası, aynı kitap iki kez girmez), tamamlama (yalnızca listedeki adlar, emin olunmayan atlanır, başka sırttaki kitap taşınmaz, kayıt notlarıyla taşınır), telefon kamerası (kayıtlılar tanınır, net okunan yeniler bir kez eklenir, bulanık ad eklenmez), kayıt geçmişi, ruh hali önerisi (yalnızca okunmamış kitaplardan, "Ad · Yazar" biçimi de eşleşir), tarz analizi (kitaplıkta olan ve Open Library'de bulunamayan öneri atılır) ve kitap sohbeti notu (kaldığı yer, notlar, spoiler kuralı).

#### Uzay Modu 🪐

Büyü efektlerinden ayrı bir mod: arkanızda uzay varmış gibi görünür, gerçek gezegenleri elinizle ve sesinizle yönetirsiniz. Bu modda ateş, mühür, şimşek, iz ve kitaplık çalışmaz; büyü modu da uzay efektlerini tetiklemez.

**Açmak:** El Kontrolü'nde **U** tuşu ya da üst şeritteki **🪐 uzay** düğmesi, sesle *"Jarvis, uzay modunu aç / kapat"* (El Kontrolü kapalıysa uzay modunda açılır), adresle `?el=1&mod=uzay`. Geçişte oda kararır, yıldızlar ışık hızıyla belirir.

Uzay modunun iki sahnesi var: **Uzay Laboratuvarı** (varsayılan, gerçek veri ve gerçek fizik, aşağıda) ve **gösteri** (serbest gezegenler, çarpışma, kara delik). Geçiş: **G** tuşu, üst şeritteki **🎆 gösteri / 🔬 laboratuvar** düğmesi ya da *"Jarvis, gösteri modunu aç"* / *"uzay laboratuvarını aç"*. Adresle: `?el=1&mod=lab` ya da `?el=1&mod=gosteri`. Gösteri komutları (kara delik, Theia, kayan yıldız, gerçek boyutlar) laboratuvardayken söylenirse sahne kendiliğinden gösteriye geçer; laboratuvar komutları için tersi.

**Arka plan (B tuşu ya da *"Jarvis, arka planı uzaya çevir / odayı geri getir"*):**
- **Oda** (varsayılan): odanız olduğu gibi görünür. Üstüne yalnızca süzülen ince yıldızlar biner; bunlar "screen" karışımıyla aydınlık yerlerde kaybolur, karanlık köşelerde belirir. Kenarlarda hafif sinematik bir karartma olur. Kişi ayırma çalışmaz, FPS yüksek kalır. Tarama ve yakınlaşma ekranları odayı kapatmaz; yalnızca paneller koyu durur.
- **Tam uzay**: sizi odadan ayırır (MediaPipe Selfie Segmenter), arka plan tamamen uzay olur, siz önde kalırsınız. Kamera görüntüsü kopyalanmaz; yıldız katmanında sizin olduğunuz yere yumuşak kenarlı bir delik açılır.

Yıldız alanı tamamen prosedüreldir: 3 derinlik katmanı (yavaş sürüklenme, parallax), göz kırpan sıcak/soğuk yıldızlar, Samanyolu bandı, soluk nebulalar, 15-30 sn'de bir kayan yıldız.

**Gezegenler:** Merkür, Venüs, Dünya, Mars, Jüpiter, Satürn, Uranüs, Neptün, Ay ve Güneş. Her biri 3.600 noktadan oluşur; noktaların rengi gerçek yüzey haritasından (aşağıdaki dokular) ya da dokusu olmayanlarda gerçek görünüşe benzeyen desenden gelir. Gece/gündüz gölgesi vardır, halka yalnızca Satürn'de (belirgin) ve Uranüs'te (ince, neredeyse dik). Gezegen değişince yanında küçük bir bilgi kartı çıkar.

**Gösteri jestleri:**

| Jest | Ne olur |
|---|---|
| 🤏 Çimdik | Seçili gezegeni oluşturur ya da yakındakini tutar (varsayılan Dünya). Aynı anda en fazla 3 gezegen, her el kendi gezegenini tutar |
| 🤏 + diğer elle 1-5 parmak | Tuttuğunuz gezegen dönüşür: 1 Dünya · 2 Mars · 3 Jüpiter · 4 Satürn · 5 Güneş (noktalar dağılıp yeniden toplanır) |
| Bileği çevirmek | Tutulan gezegen döner; bırakınca ivmeyle dönmeye devam edip yavaşlar |
| 🤏🤏 Tek gezegene iki çimdik | Büyüt / küçült |
| İki gezegeni hızla çarpıştırmak | Çarpışma: parlama ve sarsıntı, büyük gezegen lav rengine döner, küçüğün enkazı etrafında bir diske dağılır, disk 3,5 sn'de toplanıp Ay olur ve yörüngeye oturur. Dünya'ysa Jarvis Theia cümlesini söyler |
| ✋✋ Elde gezegen yokken iki açık el | Aralarında Güneş sistemi; eller açıldıkça büyür. Bir gezegene çimdik: sistemden çekip alırsınız |
| ✊ Gezegenin yanında 1,5 sn | Kara delik: gezegen spiral çizerek parçalanır (spagettileşme), yığılma diski, foton halkası, arkadaki yıldızlar bükülür. ✋ açınca söner |
| ✊ → ✋ hızlı | Yakındaki gezegen kendi renklerinde patlar |
| ✌️ 0,6 sn basılı | Mikrofon (eller meşgulken sesli komut); dinlerken elin çevresinde dalga halkası. Boşluk tuşu da olur |

**Gösteri sesli komutları** (sunucuya gitmez, anında; Türkçe eklere ve yazım farklarına dayanıklı: *dünyayı, Mars'ı, jüpiteri, satürnü…*):
- *"Jarvis, Satürn getir / çağır / göster"*: elinizdeki gezegen dönüşür, elde yoksa ortada oluşur
- *"güneş sistemini göster"*, *"gerçek boyutlarda göster"* (yanına diğerleri gerçek oranlarla gelir, 4 sn), *"kara delik oluştur"*
- *"Theia'yı fırlat"* ya da *"gezegenleri çarpıştır"*: elinizdeki Dünya'ya ekranın kenarından Mars büyüklüğünde bir gök cismi fırlar; çarpışma → Ay akışı tek komutla, elle denk getirmeye gerek yok
- *"kayan yıldız"*, *"bana Jüpiter hakkında bir şey söyle"*, *"temizle"*

Her komutta Jarvis seçili sesle kısa bir onay söyler ("Satürn, efendim."). Uzay modu açılınca bütün hazır cümleler önceden yüklenir; ses beklemeden çalar. Uzay modunda mikrofon, komutu cümle biterken yakalamak için Chrome'un konuşma tanımasını kullanır (bu ses Google'ın sunucusuna gider); komut değilse cümle her zamanki Jarvis'e gider. Cümleler ve gezegen bilgileri `web/src/hands/space/facts.ts` dosyasındadır.

**Kamerasız deneme:** `?el=demo&mod=gosteri` sentetik ellerle oynatır: Dünya oluşur → bilek çevirme → 2 parmak: Mars → diğer elde Dünya → çarpışma → enkaz → Ay → Güneş sistemi → Satürn → kara delik. Demoda segmentasyon yoktur.

**Test:** `npm run test:uzay` sesli komut eşleştiricisini 197 yazımla ve zincirlerle (ekli, eksiz, STT hatalı ve komut olmayanlar), ardından laboratuvarın fizik testlerini çalıştırır.

**Performans:** Kişi ayırma 256 piksele küçültülmüş kareyle 2 karede bir çalışır (M1 Pro'da ~6 ms); gezegenler küçük bir tampona derinlik sınamasıyla basılır. Modeller `npm run el-modeli` ile yerele indirilebilir.

**Dokular** (`web/public/space/`, 1024×512'ye küçültüldü):

| Doku | Kaynak | Lisans |
|---|---|---|
| Dünya | NASA Earth Observatory, *Blue Marble: Next Generation* (topoğrafya + batimetri, Aralık), Reto Stöckli | NASA görseli, telif yok (kaynak belirtilmesi istenir) |
| Ay | NASA Scientific Visualization Studio, [CGI Moon Kit](https://svs.gsfc.nasa.gov/4720), `lroc_color_poles_1k.jpg` (LRO WAC) | NASA görseli; kaynak: "NASA's Scientific Visualization Studio" |
| Mars | USGS Astrogeology, [Mars Viking Global Color Mosaic 925m](https://astrogeology.usgs.gov/search/map/mars_viking_global_color_mosaic_925m) | USGS: "public domain" |
| Jüpiter | NASA/JPL/Space Science Institute, Cassini, [PIA07782](https://photojournal.jpl.nasa.gov/catalog/PIA07782) | NASA/JPL görseli, telif yok |
| Merkür | NASA/Johns Hopkins University APL/Carnegie Institution of Washington, MESSENGER, PIA16298 | NASA görseli, telif yok |

Satürn, Venüs, Uranüs, Neptün ve Güneş için gerçek renkli, lisansı açık küresel harita olmadığından desenleri prosedüreldir (Satürn'ün bantları, Venüs'ün bulut örtüsü, Uranüs ve Neptün'ün renkleri, Güneş'in kaynayan yüzeyi). Kişi ayırma modeli: MediaPipe Selfie Segmenter (yatay), Google; el modeli gibi çalışırken Google'ın sunucusundan iner, repoda yoktur.

#### Uzay Laboratuvarı 🔬

Gösteri modunun rastgele oyunları yerine bilimsel bir laboratuvar: Güneş ve 8 gezegen **bugünkü gerçek yerlerinde** açılır, siz gezegenleri elinizle taşırken, fırlatırken ya da çarpıştırırken sonuç **gerçek bir hesaptan** gelir. Ekrandaki ve Jarvis'in söylediği her sayı aşağıdaki verilerden ve fizikten çıkar; Jarvis bu cümleleri modele sormadan, anında kurar.

**Ekranda her zaman:** *"mesafeler ölçekli · boyutlar büyütülmüş · basitleştirilmiş model"*.

**Açılış:** Laboratuvar açılınca (ya da zaten açıkken *"uzay laboratuvarını aç"* denince) yaklaşık 3 sn'lik bir açılış oynar:
- merkezden halka patlaması, köşe kıskaçları ve tarama çizgisi;
- harf harf çözülen "UZAY LABORATUVARI" başlığı;
- Güneş'in tutuşması ve yörüngelerin içten dışa sırayla çizilmesi;
- gezegenlerin ekranın kenarlarından sarmal çizerek yerlerine uçması.

Ardından görünüm iç gezegenlere yakınlaşır.

**Oda modunda okunurluk:** Gezegenlerin arkasında hafif koyu bir disk ve ince parlak bir kenar vardır, gece yarıları daha aydınlıktır. Yörüngeler koyu bir alt çizgiyle çizilir, yazılar gölgelidir. Böylece aydınlık bir odada da seçilirler. Demoda denemek için: `?el=demo&kitaplik=1&mod=lab&tara=bos&oda=1`; arka planda kitaplık demosunun raf görüntüsü olur. Basitleştirilmiş değerlerin yanında ≈ durur.

**Nasıl çalışır:**
- **Konumlar:** [astronomy-engine](https://github.com/cosinekitty/astronomy) 2.1.19 (MIT, VSOP87 tabanlı, ≈1 yay dakikası doğruluk) açılıştaki tarihte gezegenlerin konum ve hızlarını verir. Sonrası tarayıcıda N-cisim simülasyonu: Güneş ve 8 gezegen birbirini çeker.
- **Fizik:** birimler AU, yıl ve Güneş kütlesi (G = 4π²). Entegratör leapfrog (velocity Verlet), çeyrek gün adım; bir cisim Güneş'e çok yaklaşınca adım kendiliğinden kısalır. Zamanda simetriktir: 100 yılda enerji kayması ≈ %0,00001, zaman geri sarılınca gezegenler aynı yoldan döner. Güneş'e düşen cismin kütlesi ve momentumu Güneş'e eklenir.
- **Ölçek:** yalnızca çizim ölçeklenir, fizik değil. Ekrandaki uzaklık ∝ √AU (Merkür ile Neptün aynı ekrana sığsın diye), yön korunur; bakış kuzeyden 25° eğik. Bütün dönüşümler tek dosyada: `web/src/hands/space/scale.ts`.
- **Sıcaklık:** denge sıcaklığı T = T☉ · √(R☉ / 2r) · (1 − A)^¼ (Dünya için ≈ 254 K) + gezegenin bugünkü sera farkı (Dünya +34 K → 15 °C). Basitleştirme: gezegen nereye taşınırsa taşınsın atmosferi aynı kabul edilir. Dünya'nın yüzeyi sıcaklığa göre değişir: 0 °C altı okyanuslar donar, 100 °C üstü kaynar, ≈450 °C üstü kızgın kaya. Okyanusu olmayan kayalık gezegenlerde yalnızca buzlanma ve kızgın kaya; gaz devlerinde değişmez.
- **Yaşanabilir bölge:** Kopparapu ve ark. 2013 (ApJ 765:131), Güneş için tutucu sınırlar 0,99–1,70 AU.
- **Veriler** (`web/src/hands/space/data.ts`, her değerin kaynağı yanında): NASA NSSDCA Planetary Fact Sheet (kütle, yarıçap, çekim, kaçış hızı, gün, yıl, uzaklık, ortalama sıcaklık, Bond albedosu, yoğunluk, basınç, atmosfer bileşimi), NSSDCA Sun Fact Sheet, iç katmanlar için NASA gezegen sayfaları ve InSight (Mars çekirdeği). Gaz devlerinin iç katman sınırları modellere göre değişir, "≈" ile gösterilir.

**Jestler** (her hareketin tek bir işi var):

| Jest | Ne olur |
|---|---|
| 🤏🤏 Boşlukta iki elle çimdik, elleri aç / kapat | Güneş sistemini kademesiz büyüt / küçült (harita gibi; ×0,6 – ×12) |
| 🤏 Gezegene kısa dokunuş | O gezegene yakınlaş: gezegen büyür, uyduları gerçek yerlerinde görünür, NASA kartı açılır. İçeride: 🤏 sürükle = döndür · 🤏🤏 elleri aç = kesit (iç katmanlar, atmosfer) · 🤏🤏 elleri başlangıçtan çok kapat = geri çık · uyduya dokun = seç |
| 🤏 Gezegeni sürükle | Yörüngesinden kopar; yanında canlı uzaklık, sıcaklık, yüzey hâli; noktalı çizgi gideceği yolu gösterir |
| Başka bir gezegenin üstüne bırak | **Yer değiştirirler** (hedef halkası: "BIRAK: DÜNYA ⇄ MARS") |
| Hızla başka gezegene vur | **Çarpışma**: kütleler çok farklıysa enkaz diski ve uydu, yakınsa erimiş tek gezegen; kütle ve momentum korunur |
| Boşluğa yavaş bırak | O uzaklıkta dairesel yörünge; Jarvis sonucu söyler |
| Boşluğa hızla bırak | Fırlat (el hızı → Δv): Güneş'e düşer, kaçar ya da yeni yörünge |
| 🤏 + 🤏 iki gezegeni tut | Işık ipi (uzaklık, ışık süresi, Hohmann); yavaşça yaklaştır: karşılaştır |
| ✊ 1 sn | Zamanı durdur / başlat |
| ✌️ 0,6 sn | Mikrofon |

Dokunuşun gezegeni yerinden koparmaması için kopma eşiği elin büyüklüğüne göredir. Kısa titremeler bırakma sayılmaz. İki elli çimdik başladığı moda kilitlidir: yakınlaştırma ile kesit/geri birbirine karışmaz. Zaman hızı sesle ya da ✊ ile değiştirilir.

**Jest demosu:** `?el=demo&mod=lab&tara=jest` sentetik ellerle hepsini sırayla gösterir: büyüt/küçült → Mars'a dokun → döndür → kesit → geri → Dünya'yı Mars'ın üstüne bırak → çarpıştır.

**Sesli komutlar** (sunucuya gitmez, anında; her biri en az 3 yazımla test edilir):
- *"uzay laboratuvarını aç / kapat"*, *"gösteri modunu aç"*, *"sıfırla"* (bugünkü gökyüzüne döner)
- *"Dünya'yı Güneş'e yaklaştır / uzaklaştır"* (uzaklığın %80'i / %125'i, dairesel yörünge)
- *"Dünya'yı Venüs'ün yerine koy"* (yer değiştirirler), *"Jüpiter'i Dünya'nın yanına koy"* (aynı yörüngede; Dünya'nın yörüngesi bozulunca Jarvis basıklığın nasıl değiştiğini söyler)
- *"Mars'a mesaj gönder"*, *"Dünya ile Mars'ı karşılaştır"*, *"Dünya'nın içini aç"*
- *"zamanı hızlandır / yavaşlat / durdur / geri sar"*, *"1 Ocak 2030'a git"*, *"10 yıl sonrasına git"* (gezegenler o tarihteki gerçek yerlerine akar)
- *"yaşanabilir bölgeyi göster / gizle"*, *"yakınlaştır"* (iç gezegenler), *"tüm sistemi göster"*, *"kilom 80"*

**Jarvis'e soru sormak:** laboratuvar açıkken sorulan sorulara ekrandaki durum da eklenir (tarih, zaman hızı, gezegenlerin uzaklığı, sıcaklığı, yüzeyi, yörüngesi, son olaylar). *"Neden dondu?"*, *"Bu yörüngede bir yıl kaç gün sürer?"* gibi soruları Jarvis bu verilere dayanarak cevaplar.

**Tuşlar:** G gösteri · Z yakınlaş / uzaklaş · Y yaşanabilir bölge · Boşluk durdur · **T temiz çekim** (menüler ve paneller gizlenir; sonuç bantları, ip, karşılaştırma, kesit ve dürüstlük etiketi kalır) · L bütün arayüzü gizle · B arka plan · U büyü modu.

**Çekim için yerleşim:** paneller Reels/Shorts güvenli alanında durur (üstte %10, altta %20, sağda %8 boş). Açılışta 3 sn bütün sistem görünür, sonra iç gezegenlere yakınlaşır.

**Kamerasız deneme:** `?el=demo&mod=lab` (56 sn döngü): Dünya'yı Güneş'e yaklaştır → Venüs'ün uzaklığında bırak → sıfırla → Mars'ı fırlat (kaçış) → ışık ipi ve mesaj → karşılaştır → çarpışma → kesit → zamanı hızlandır → 2030'a git → sıfırla. `&elt=36` gibi bir saniyeden başlatılabilir.

##### Uydular ve yaşam izi taraması 🧬

**Uydular:** *"Jüpiter'e yakınlaş"*, *"Satürn'e odaklan"* ya da *"Europa'yı göster"* deyince gezegen ortada büyür, yaşam adayı uyduları görünür: Europa ve Ganymede (Jüpiter), Enceladus ve Titan (Satürn), Ay (Dünya). Europa ve Ganymede gerçek yerlerindedir (astronomy-engine). Enceladus ve Titan için astronomy-engine konum vermez; onlar gerçek dönem ve uzaklıkla dairesel yörüngede döner, başlangıç açıları temsilidir ("≈"). Uydu uzaklıkları sıkıştırılmıştır. Bu görünümde çimdik yalnızca seçer. Veriler: NASA JPL SSD uydu parametreleri. İç katmanlar modeldir ("≈"); Titan'ınki tartışmalıdır. *"uzaklaştır"* ya da *"tüm sistemi göster"* geri döner. *"Ay'ı kaldır"*: Ay kaybolur, Jarvis gelgitlerin yaklaşık üçte birine ineceğini söyler; tarama bunu "iklim kararlılığı" maddesiyle hesaba katar.

**Tarama:** *"Europa'da yaşam izi tara"*, *"yaşam izi tara"* (seçili cisim), *"bu bölgede yaşam izi tara"* (yakınlaşılan gezegen ve uyduları ya da iç gezegenler ve Ay, sonunda karşılaştırma), *"hızlı tara"*. Tarama yaklaşık 15 sn, hızlısı yaklaşık 7 sn sürer. Sekiz adım vardır ve her adımda Jarvis bir cümle söyler (cümlelerin sesi önceden hazırlanır):

1. **Odak:** cisim sahnedeki yerinden ekranın soluna büyür.
2. **Yüzey:** tarama ışını. Buzlu uydularda çatlaklar, Enceladus'ta güney kutbu püskürmeleri görünür.
3. **Spektrum:** temsili spektrum, gerçek atmosfer bileşiminin soğurma bantlarıyla. Atmosfer yoksa "atmosfer yok / çok ince".
4. **Yer altı:** kesit açılır, okyanus katmanı parlar. Okyanus verisi yoksa bu adım atlanır.
5. **Kontrol listesi:** maddeler sırayla ✓ / ✗ / ? olur. Her madde **HESAPLANDI** ya da **BİLİNEN VERİ** etiketlidir:
   - Yüzeyde sıvı su (hesaplanır): simülasyondaki sıcaklık, basınçtaki kaynama noktası (Clausius-Clapeyron), suyun üçlü noktası (0,006 bar) ve Dünya için Kopparapu iç sınırı (kaçak sera) kullanılır.
   - Güneş ışığı (hesaplanır): 1.361 W/m² ÷ r².
   - Yer altı suyu, gelgit ve iç ısı, koruyucu atmosfer ve manyetik alan, organik moleküller: bilinen veri.
6. **Dünya Benzerlik Endeksi:** gösterge 0'dan değere dolar. Formül Schulze-Makuch ve ark. 2011 (Astrobiology 11:1041): ESI = Π (1 − |(x − x₀)/(x + x₀)|)^(w/4). Ağırlıklar: yarıçap 0,57, yoğunluk 1,07, kaçış hızı 0,70, yüzey sıcaklığı 5,58. Sıcaklık simülasyondan gelir; cisim taşınınca ESI değişir. ESI yalnızca yüzeyi ölçer, buzlu uyduların okyanusunu kapsamaz.
7. **Bugüne kadar bulunanlar:** kartlar KANITLANDI / GÜÇLÜ İŞARET / TARTIŞMALI / BULUNMADI rozetiyle gelir; her kartta tek cümle, yıl ve görev adı vardır.
8. **Sonuç:** en umut verici bölge, nedeni ve sıradaki görev.

**Görünüm:** Tarama ekranı Jarvis tarzı mekanik bir HUD'dur:
- Köşe kıskaçları ekranın kenarlarından gelip cisme kilitlenir; çevresinde dişli halkalar ve radar süpürmesi döner, canlı telemetri (AZ, EL, SNR) akar.
- Cisimden ölçüm etiketlerine lider çizgileri uzanır.
- Her adımın paneli kendini çizip kepenk gibi açılır; yazılar harf harf çözülür; sonuçlar damga gibi iner.
- Arkada altıgen ızgara, kenarlarda kayan veri sütunları vardır.
- Servo, kilit, yazı ve damga sesleri eşlik eder.

**Jarvis'in hafızası:** Jarvis oturumda yapılanları hatırlar ve cümlelerini buna göre kurar. Örnekler:
- *"Dünya'yı az önce Mars'ın yörüngesine taşımıştık. Bakalım bu ona ne yaptı."*
- *"Europa'da 0,26 görmüştük; arada büyük fark var."*
- *"Umut yine buzun altında; Europa'da gördüğümüz tabloya benzedi, değil mi?"*
- Önceki oturumda neye bakıldığını da bilir: *"Geçen sefer Europa'ya bakmıştık."* Son taramalar bu cihazda saklanır.
- Aynı cümleyi her seferinde tekrarlamaz. Laboratuvarda sorulan sorularda bu hafıza Jarvis'in sohbet bağlamına da gider.

Ekranda kalıcı not: *"Yaşam bulunduğunu değil, yaşam için koşulların uygunluğunu gösterir."* Jarvis hiçbir zaman yaşam olasılığı ya da yüzdesi vermez. Bunu bir test denetler.

**Senaryolar:** komutlar "sonra / ardından" ile zincirlenebilir. Her adım anlatımı bitince sıradaki başlar:
- *"Dünya'yı Mars'ın yerine koy, sonra yaşam izi tara"*: Dünya yaklaşık −38 °C'de donar, sıvı su ✗, ESI 1,00'dan 0,86'ya iner.
- *"Dünya'yı Venüs'ün yerine koy, sonra yaşam izi tara"*: kaçak sera etkisi, sıvı su ✗.
- *"Ay'ı kaldır, ardından Dünya'da yaşam izi tara"*: tarama Ay'ın yokluğunu hesaba katar.

Laboratuvar açıkken serbest sorularda (*"Europa'da hayat olabilir mi, tara bakalım"*) Jarvis `yasam_izi_tara` aracını kullanır. Araç sonucu laboratuvarın hesabından alır ve ekrandaki animasyonu başlatır. Animasyonun adımları Jarvis'in cevabındaki 8 sahneyle birlikte ilerler.

**Keşif listesi ve kaynakları** `web/src/hands/space/facts.ts` dosyasındadır (Ekim 2026 itibarıyla doğrulandı):

| Cisim | Bulgu | Durum |
|---|---|---|
| Mars | Jezero göl deltası (Perseverance 2021) | GÜÇLÜ İŞARET |
| Mars | Dönemsel metan: Curiosity ölçtü, TGO bulamadı (2018-2019) | TARTIŞMALI |
| Mars | Sapphire Canyon olası biyo-imza (2025) | TARTIŞMALI |
| Venüs | Fosfin iddiası (2020) | TARTIŞMALI |
| Europa | Tuzlu okyanus (Galileo, 1998-2000) | GÜÇLÜ İŞARET |
| Enceladus | Su püskürmeleri (2005), organikler (2018), fosfat (2023) | KANITLANDI |
| Enceladus | Hidrotermal işaretler (2015-2017) | GÜÇLÜ İŞARET |
| Titan | Metan/etan gölleri (2006-2008) | KANITLANDI |
| Titan | Yer altı okyanusu (2012'de işaret, 2025'te itiraz) | TARTIŞMALI |
| Ganymede | Yer altı okyanusu (Hubble, 2015) | GÜÇLÜ İŞARET |

Sıradaki görevler: Rosalind Franklin (2028), DAVINCI (Aralık 2030 hedefi) ve EnVision (2031), Europa Clipper (Nisan 2030), JUICE (2031, Ganymede yörüngesi Aralık 2034), Dragonfly (Temmuz 2028 fırlatma) ve ESA L4 (Enceladus; çalışma aşamasında).

**Kamerasız deneme:**
- `?el=demo&mod=lab&tara=europa`: Europa taraması.
- `?el=demo&mod=lab&tara=dunya-mars-yorungesi`: Dünya'yı Mars'ın yerine koyup tarar.
- `?el=demo&mod=lab&tara=bos`: el ve komut olmadan boş laboratuvar.

**Test:** `npm run test:lab` fizik testleri: 100 Dünya yılında enerji kayması < %1, zaman geri sarılınca aynı konum, Hohmann Dünya → Mars ≈ 259 gün, Dünya'nın denge sıcaklığı ≈ 255 K ve sera farkıyla 15 °C, kaçış / bağlı / Güneş'e düşüş ayrımı, Dünya-Mars ışık süresinin astronomy-engine ile aynı çıkması, ölçeğin tersinirliği. Ardından yaşam taraması testleri:
- ESI: Dünya 1,00; Mars yayınlanan girdilerle 0,70; Merkür 0,60, Venüs 0,44, Titan 0,24.
- Taşınan Dünya: Mars yörüngesinde donar, Venüs yörüngesinde kaçak sera.
- 130 taramada hiçbir çıktıda "%" ya da yaşam olasılığı ifadesi olmaması.

#### Uzay modu · ekstra ✨

Laboratuvar ve gösterinin yanında üçüncü sahne. Açmak için:
- üst şeritteki **✨ ekstra** düğmesi,
- **G** tuşu (laboratuvar → gösteri → ekstra),
- *"Jarvis, ekstra modunu aç"*,
- adresle `?el=1&mod=ekstra`.

Beş numara vardır; **1-5** tuşları, üstteki düğmeler ya da ses ile seçilir:

| | Numara | Nasıl | Arkasındaki hesap ve kaynak |
|---|---|---|---|
| 1 | 🌙 **Kafanızın etrafında Ay** | *"Ay'ı kafamın etrafında döndür"*. Ay başınızın çevresinde eğik bir yörüngede döner. Arkadan geçerken başınız onu kapatır: kişi ayırma maskesi ve yüz algılama kullanılır. Evreleri değişir. 🤏 sağa/sola sürükleme hızlandırır ya da yavaşlatır; *"halka ekle"* deyince başınızın çevresinde Satürn gibi bir halka belirir | Gerçek değerler etikette: 384.400 km, 27,3 gün |
| 2 | ☄️ **Dünya'ya asteroit** | 🤏 boşlukta çimdikleyin, asteroit elinizde belirir; Dünya'ya savurun. Sesle: *"asteroit fırlat"*, *"20 kilometrelik asteroit gönder"*. Çarpmada parlama, ateş topu, şok dalgası ve enkaz oluşur; toz bulutu gezegeni karartır. Analiz panelinde çap, hız, megaton ve Hiroşima katı yazar | E = ½ m v², ρ = 3.000 kg/m³. El hızı 11,2–72 km/s çarpma hızına çevrilir. Chicxulub (≈10 km, ≈20 km/s) ile karşılaştırılır |
| 3 | ☀️ **Güneş'in son günleri** | *"Güneş'in sonunu göster"* ya da *"5 milyar yıl ileri git"*. ≈30 sn'lik zaman tüneli: okyanuslar buharlaşır, Güneş kızıl deve dönüşür ve Merkür, Venüs, Dünya'yı yutar. Ardından helyum parlaması, gezegenimsi bulutsu ve beyaz cüce gelir. ✊ ya da *"durdur / devam et"* | Schröder ve Smith 2008: kızıl dev kolunun ucunda 256 R☉, 2.730 L☉, 0,668 M☉. Sackmann 1993. Gesicki 2018. Yörüngeler kütle kaybıyla genişler (a ∝ 1/M) |
| 4 | 🕳 **Gezgin kara delik** | *"Kara deliği Güneş sisteminden geçir"*, *"yakından / uzaktan geçir"*. 10 M☉'lik bir kara delik 50 km/s ile sistemin içinden geçer, yıldızlar bükülür. Kamera Güneş'i izler, gezegenlerin izleri görünür. Sonuç tablosu her gezegen için şunlardan birini yazar: yörüngede (basıklık nasıl değişti), fırlatıldı, kara deliğe yakalandı ya da yutuldu. Güneş yakalanırsa "GÜNEŞ YAKALANDI" | Gerçek N-cisim hesabı (laboratuvarın fiziği), bugünkü gerçek konumlardan başlar. Adım, yakın karşılaşmalarda kısalır |
| 5 | ⚫ **Ay yerine kara delik** | *"Ay'ın yerine kara delik koy"* ya da *"Ay kara delik olsaydı ne olurdu?"*. Ay sıkışıp aynı kütlede bir kara deliğe dönüşür (olay ufkunun çapı 0,22 mm) ve aynı yörüngede döner. Yörünge ve gelgit kütleye bağlı olduğu için neredeyse hiçbir şey değişmez; yalnızca Ay ışığı ve tutulmalar biter. **Büyütmek:** *"kara deliği büyüt / küçült"* basamak basamak ilerler (Ay → Dünya → Jüpiter → Güneş → Sgr A\*). *"Jüpiter kütlesine büyüt"*, *"kara deliği 10 kat büyüt"* de olur. 🤏 çimdikleyip yukarı / aşağı sürüklemek kütleyi sürekli değiştirir. Soldaki kütle merdiveninde iki eşik işaretlidir. Güneş kütlesinde Dünya, Roche sınırını aşınca uzayıp parçalanır ve enkazı diske dönüşür. Sgr A\* kütlesinde olay ufku Ay'ın yörüngesini yutar. Panelde ufuk çapı, gelgit, bir ayın süresi, ortak kütle merkezi, Hawking sıcaklığı ve Einstein halkası yazar | r_s = 2GM/c². Denge gelgiti 1,5·(M/M⊕)(R⊕/d)³R⊕ (Ay ≈ 0,54 m). Katı cisim Roche sınırı R⊕(2M/M⊕)^⅓: Dünya ≈ 0,33 M☉'de parçalanır. Ufuk yörüngeyi ≈ 130.000 M☉'de aşar. Hawking T = ħc³/(8πGMk): Ay kütlesinde 1,67 K, 2,7 K'lik kozmik arka plandan soğuk olduğu için buharlaşmaz. Sgr A\* 4,297×10⁶ M☉ (GRAVITY 2022) |

**Kamerasız deneme:** `?el=demo&mod=ekstra&numara=ay|asteroit|kizildev|karadelik|aykaradelik`. Ay numarasında demo sahte bir kafa silüeti kullanır. Asteroit numarası 14 sn'de bir kendiliğinden fırlar. Ay yerine kara delik numarasında kara delik 13 sn'de bir bir basamak büyür ve Sgr A\*'dan sonra baştan başlar. `npm run test:lab` bu numaranın hesaplarını da sınar: Güneş'in r_s'si 2,95 km, Ay'ın gelgiti ≈ 0,54 m, parçalanma ve ufuk eşikleri, Hawking sıcaklıkları (25 test).

#### Haber Modu 📰

Haber merkezi El Kontrolü'nde ayrı bir moddur. Günün haberlerini derler, aynı olayı farklı kaynakların nasıl anlattığını yan yana koyar, olgusal iddiaları resmî verilerle karşılaştırır ve haberlerde cevapsız kalan soruları bulur. Görünümü bir haber kanalını andırır: kanal logosu ve "● CANLI" işareti, saat, kategori şeridi, alt bant, "SON DAKİKA" bandı ve kayan yazı. Açılışta "HABER MERKEZİ" başlığının altında motto daktiloyla yazılır ve Jarvis onu okur. Seslendirme ⚙ efektler menüsünden ("📰 Haber açılışında motto") kapatılabilir.

**Açmak:**
- **N** tuşu,
- üst şeritteki **📰 haber** düğmesi,
- *"Jarvis, haber modunu aç"* (kapatmak için *"kapat"*),
- adresle `?el=1&mod=haber`.

Bu modda büyü ve uzay efektleri çalışmaz.

**Kart karuseli:** Gündemdeki olaylar önünüzde yarım daire şeklinde holografik kartlar olarak durur. Aynı olayı veren haberler tek kartta birleşir. Kartta kategori, başlık (en fazla 2 satır), "11 kaynak", saat, ilk veren kaynak ve alan adı yazar. Kamerayla kişi ayırma maskesi kullanılır: arkada kalan kartlar başınızın arkasına geçer, siz öndekilerle arkadakilerin arasında durursunuz.

**El kilidi:** Kamera bir eli görür görmez iş yapmaz. Avucunuzu kameraya açık ve sabit **0,6 sn** tutun: elin çevresinde halka dolar, "KONTROL" kilitlenir (kilit sesi). Yalnızca kilitli el iş yapar; kadraja giren, sallanan ya da yarı kapalı gelen el hiçbir şey tetiklemez. Kilitli elin çevresinde soluk bir halka durur. El 0,4 sn'den uzun kaybolursa ya da kol kadrajın altına inerse kilit açılır (kısa takip kopmaları kilidi bozmaz). İki elle hareketlerde iki el de kilitli olmalı. Kilitsiz el görünürken üstte "✋ avucunu göster: kontrol" ipucu çıkar. Kamerasız demoda kilit adımı yoktur.

**El hareketleri** (kilitli elle):

| Jest | Ne yapar |
|---|---|
| 🤏 tut ve sağa / sola sürükle | Karusel elinizi birebir izler; bırakınca elin hızıyla kayar ve en yakın karta oturur. Detayda bir haber, iddia kontrolünde bir iddia ilerler |
| 🤏 tut ve yukarı / aşağı sürükle | Karuselde kategori değiştirir. Detayda ve diğer panellerde elin altındaki sütunu kaydırır (kesilen sayılar, "kim ne zaman verdi" listesi) |
| 🤏 tut ve kendine çek | Haber detayı: özet, önemli sayılar, harita (yalnızca metinde geçen iller), kim ne zaman verdi, arşivde "daha önce" |
| ✊→🖐 kısa yumruk ve aç (0,2–0,8 sn) | Kartı açar (işaret ettiğiniz ya da öndeki). Detayda kaynak karşılaştırmasına, karşılaştırmada dünya basınına iner |
| 🤏🤏 iki elle tut, elleri aç | Yakınlaş: öndeki kart elleriniz açıldıkça büyür, eşikte (×1,45) detaya iner; detayda kaynak karşılaştırmasına. Bir tutuşta bir seviye: daha derine inmek için bırakıp yeniden tutun |
| 🤏🤏 iki elle tut, elleri yaklaştır | Uzaklaş: bir seviye geri (×0,7) |
| 🤏🤏 iki elle tut, elleri ters yönde yukarı-aşağı oynat (terazi) | İddia kontrolü |
| ☝️ işaret | Üstüne geldiğiniz kart öne doğru büyür. Karşılaştırmada bir kaynağa 0,4 sn tutarsanız o kaynağın metninde ilgili alıntılar renkleriyle vurgulanır. Detaydaki "? sorulmamış sorular" düğmesine 0,7 sn tutmak soruları açar |
| 👍 1 sn | Jarvis haberi özetler |
| ✊ yumruğu 0,8 sn tut | Bir seviye geri (dünya basını → karşılaştırma → detay → karusel), Jarvis'in sesini keser; süren yayını, manşet sayımını ya da dünya turunu durdurur. Halka 0,3 sn'den sonra dolar. Yumruk yapmak tek başına bir şey tetiklemez: karar el açılınca (aç) ya da halka dolunca (geri) verilir |
| ✌️ | Mikrofon |

**Klavye:**
- **←/→** haber, **↑/↓** kategori,
- **Enter** detay, **K** karşılaştır, **W** dünya basını, **/** ara (anahtar kelime), **I** iddia, **S** sorular, **O** sabah özeti,
- **Y** canlı yayın, **H** son dakika, **R** manşetler, **A** dünyada bugün, **P** basın özeti, **X** takibe al, **V** haber duvarı, **1-9** duvardaki numara,
- **⌫** geri, **T** temiz çekim.

**Sesli komutlar** (yerelde eşleşir, modele gitmez):

| Komut | |
|---|---|
| *"haber modunu aç / kapat"*, *"haber ajansını aç / kapat"* | Her yerden |
| *"günümü özetle"* | Her yerden. Sabah özeti açılır |
| *"ekonomi haberlerini göster"* | gündem, ekonomi, dünya, spor, teknoloji, bilim |
| *"Gazze hakkında haber getir"*, *"bana İran haberlerini bul"*, *"internette deprem haberlerini tara"* | Her yerden (haber modu kapalıysa açılır). İnternet taraması, sonuçlar karusele gelir |
| *"deprem hakkında ne var?"* | Haber modundayken aynı arama |
| *"dünya basını bunu nasıl verdi?"*, *"yabancı basın ne diyor?"*, *"dış basında ne yazıyor?"* | Her yerden. Açık olayın (yoksa gündemin öndeki olayının) dünya basını karşılaştırması |
| *"canlı yayına geç"*, *"ana haber bülteni"* · *"yayını bitir"* | Her yerden. Ana haber bülteni: CANLI rozeti, jenerik; Jarvis spiker gibi ilk 5 olayı sunar (her olayda detay açılır, analiz özetinden; analiz yoksa başlık ve kaynak sayısı). Sonda bültende taranan kaynakların kapanış jeneriği |
| *"son dakika!"* | Her yerden. Kırmızı SON DAKİKA ekranı; ilk haberi en yeni olan, en az 3 kaynaklı olay. 45 dakikadan eskiyse "son 45 dakikada yeni gelişme yok, en son gelişme …" der |
| *"manşetleri ver"*, *"günün manşetleri"* | Her yerden. İlk 10 olay, onuncudan birinciye geri sayım (dev numara, fotoğraf, kaynak sayısı) |
| *"dünyada bugün ne oldu?"* | Her yerden. Küre: dünya kategorisindeki çok kaynaklı olaylar başlıkta geçen yerlerinde (yeri bulunamayan konmaz); küre sırayla her birine döner, Jarvis anlatır; sonunda dünya kategorisi açılır |
| *"basın özeti"*, *"gazeteler ne yazıyor?"* | Her yerden. Kaynakların şu anki baş haberi (ilk beslemesinin ilk haberi); aynı olayı öne çıkaranlar aynı renkte; çok kaynağın verdiği ama hiçbirinin baş habere koymadığı olay "MANŞETLERDE YOK" |
| *"bunu takibe al"* · *"takibi bırak"* | Açık olay takipte: yeni bir kaynak o olayı verince ya da olayın yeni bir gelişmesi (benzer kökleri olan yeni küme) çıkınca, haber modu kapalıyken bile üstte "★ SON GELİŞME" bandı çıkar ve Jarvis söyler. Takip 7 gün sürer; `server/data/haber-takip.json` |
| *"ekranı böl"*, *"haber duvarı"* · *"3 numarayı aç"*, *"üçüncüyü aç"* | 3×3 haber duvarı (arama sonucu varsa onlar): ☝️ seç, 🤏 tut ya da numarasını söyle: açılır |
| *"sonraki"* / *"önceki"* | |
| *"bu haberi özetle"* / *"detayını aç"* | |
| *"bu haberi karşılaştır"* / *"bu haberi kimler nasıl verdi?"* | Kaynak karşılaştırması |
| *"bunu kontrol et"* / *"bu doğru mu?"* | İddia kontrolü |
| *"burada ne sorulmamış?"* | Kimsenin sormadığı sorular |
| *"geri dön"* / *"kartı kapat"* | |

**Kaynak karşılaştırması:** Her kaynağın kartı yelpaze gibi açılıp duvara dizilir. Kartta kaynak adı, başlık, ilk cümle ve yayın saati vardır. Altta renk kodlu, tarafsız bir şerit bulunur:
- 🟩 **ortak bilgi:** kaynakların çoğunda alıntıyla geçenler;
- 🟧 **farklı vurgu:** aynı olgunun farklı ifadeleri;
- 🟦 **sadece bazı kaynaklarda:** hangi kaynakta geçtiği ve geçmediği kodla bulunur;
- 🟥 **farklı sayılar:** çelişen rakamlar, her biri alıntıyla.

Jarvis bunu 2-3 cümleyle, yorum katmadan anlatır. Kart açılınca haber sayfalarının tam metni çekilir: önce sayfadaki yapılandırılmış veri (JSON-LD), olmazsa paragraflar. Çekilemezse RSS özeti kullanılır. Ekranda yalnızca kısa alıntılar görünür.

**Dünya basını:** Kaynak karşılaştırmasından bir kat daha yakınlaşınca (🤏🤏 elleri aç ya da ✊→🖐), **W** ya da *"dünya basını nasıl verdi?"* ile açılır. Solda Türk basınının özeti, sağda olayı veren dünya yayınlarının kartları durur. Her kartta özgün başlık, Türkçe çevirisi, yayının öne çıkardığı olgu ve birebir alıntı (çevirisiyle) bulunur. Altta renkli şerit: **iki tarafta da** · **farklı çerçeve** · **yalnızca dünya basınında** · **yalnızca Türk basınında**.
- Sabit beslemeler (anahtarsız RSS, İngilizce servisler): BBC, The Guardian (İngiltere) · The New York Times, NPR (ABD) · DW, Der Spiegel (Almanya) · France 24, Le Monde (Fransa) · Euronews (AB) · Al Jazeera (Katar). Diğer yayınlar (Reuters, AP …) Bing News aramasından gelir.
- Adaylar: önce olay için İngilizce bir arama sorgusu hazırlanır. Sorguyla **Bing News**'te aranır (anahtarsız; gerçek makale adresleri: Reuters, AP, CNN, CBS, NYT, WSJ … yüzlerce yayın) ve 10 yayının son 4 günlük başlıklarıyla birleştirilir. Model aynı olayı anlatanları seçer (numaralar kodla denetlenir). Metni okunabilen yayınlar öne alınır (en çok 6); MSN'de yayımlanan haberlerin (WSJ, USA Today …) metni MSN'in içerik servisinden okunur. Ödeme duvarı ya da bot engeli olan yayınlarda (NYT, Reuters'ın bir kısmı) yalnızca özet kullanılır ve kartta "yalnızca özet okundu" yazar. Google News İngilizce'de bulunan diğer yayınlar başlık düzeyinde listelenir.
- Örnek (canlı): Brezilya seçimi 6 yayın (CNN, CNBC, CBS, AP, NYT …; 4 tam metin), Mekke İttifakı'nın Tahran ziyareti 6 yayın (Reuters, Iran International, IRNA …; 5 tam metin), Türkiye gündeminden bir istifa haberi 2 yayın.
- Tarafsızlık: her alıntı kendi metninde, kendi dilinde **birebir** geçmeli (kodla denetlenir; geçmeyen madde atılır). Çeviriler **ÇEVİRİ** diye işaretlenir. Değerlendirici dil ("propaganda", "taraflı" …) atılır. Olay dünya basınında yoksa "bulunamadı" denir ve taranan yayın, başlık sayısı gösterilir; model yoksa karşılaştırma yapılmaz.
- Kodu: `server/src/worldNews.ts`, ekran: `web/src/hands/news/world.ts`. Sonuç 3 saat bellekte tutulur.

**Haber arama (internet taraması):** *"Jarvis, Gazze hakkında haber getir"*. Ekranda önce tarama animasyonu oynar, ardından sonuçlar karusele gelir; alt bantta "ARAMA · Gazze" yazar. "Geri" ya da kategori seçimi gündeme döndürür. Tarama sırası:
1. Türk basını: 25 kaynağın son haberleri (Türkçe ekler: "deprem" → "depremde").
2. Dünya basını: 10 yayın; sorgu modelle İngilizceye çevrilir.
3. Arşiv: son 90 günün olayları.
4. Google News Türkçe ve İngilizce: yalnızca başlık ve yayın adı; bulunanlar metni okunmadan, başlık düzeyinde.
Bulunanlar olaylara kümelenir (Türkçe, dünya, arşiv sırayla karışık; en çok 40). Bir sonuç kartı açılınca detay, karşılaştırma ve dünya basını aynı şekilde çalışır.
- **Animasyon** (`web/src/hands/news/search.ts`) yalnızca sunucudan gelen gerçek olaylarla ilerler (`/api/haber/ara`, satır satır akış):
  - Ortada dönen küre: bir yayına ulaşılınca Türkiye'den o şehre ışık yayı çıkar; bulduğu haber sayısı kadar büyür. Google News yayınlarının yeri bilinmediği için küreye konmaz, yalnızca yayın listesinde görünür.
  - Yanlarda bulunan başlıklar akar: haber foto modunda gerçek fotoğraflar, video modunda başlık kartları (telif). Türkçe camgöbeği, İngilizce turuncu.
  - Üstte sorgu harf harf yazılır, İngilizcesi yanında belirir; altta adımlar ✓ alır ve sayaçlar (yayın · haber · olay · arşiv · saniye) canlı ilerler.
  - Sunucu önbellekten anında cevap verse de olaylar tempolu oynatılır; hiçbir olay uydurulmaz ya da atlanmaz.
- Örnek ("İran", canlı): 12 saniyede 71 yayın, 138 haber, 40 olay; Reuters, AP, BBC, CNN, WSJ, Financial Times başlık düzeyinde.

**Söylenen ve gerçek (iddia kontrolü):** Solda iddia kartı (kaynak + alıntı), sağda veri kartı (resmî veri + grafik), ortada ikisini birleştiren ışık çizgisi vardır. Sonuç etiketi damga gibi yerine oturur. Etiketi model değil, `server/src/factcheck.ts` içindeki açık kurallar verir:

| Etiket | Ne zaman |
|---|---|
| **VERİYLE UYUMLU** | Değer resmî veriyle tutuyor. Kur farkı ≤ %1, deprem büyüklüğü farkı ≤ 0,1, sıcaklık farkı ≤ 2 °C, Resmî Gazete fihristinde özgül başlık geçiyor |
| **VERİYLE ÇELİŞİYOR** | Yalnızca doğrudan resmî veriyle. Kur farkı > %3, AFAD büyüklüğü farkı > 0,3 |
| **EKSİK BAĞLAM** | Veri var ama dönem, birim ya da yöntem farklı: piyasa ↔ TCMB gösterge kuru, farklı büyüklük ölçeği, yıllık ortalama ↔ yıl sonu, model verisi ↔ istasyon |
| **DOĞRULANAMADI** | Uygun veri yok, ya da iddia genel bir ifade. Asla tahmin yürütülmez |

Her etiketin yanında veri kaynağının bağlantısı ve verinin tarihi görünür. Etiket iddiaya verilir; kaynağa ya da kişiye verilmez.

**Doğrulama kaynakları** (hepsi anahtarsız ve ücretsiz):
- TCMB gösterge kurları (günlük XML arşivi),
- AFAD deprem kataloğu,
- Dünya Bankası göstergeleri (yalnızca yıllık),
- Open-Meteo (model verisi),
- Resmî Gazete günlük fihristi,
- bağımsız doğrulama kuruluşlarının RSS'i (Teyit, Malumatfuruş; yalnızca ilgili analiz bağlantısı olarak),
- Jarvis'in haber arşivi.

TÜİK'in açık API'si olmadığı için aylık TÜİK rakamları (aylık enflasyon gibi) "doğrulanamadı" olur.

**Kimsenin sormadığı sorular:** Her olay için en fazla 3 soru üretilir. Sorular kodla bulunan somut boşluklardan çıkar:
- olayın tarihi, yeri ya da nedeni hiçbir kaynakta yok;
- proje haberinde maliyet yok;
- bir sayının kaynağı hiçbir haberde belirtilmiyor;
- kaynaklar farklı sayılar veriyor;
- arşivde daha önce verilen bir söz bugünkü haberlerde hiç geçmiyor.

Her sorunun yanında hangi boşluktan çıktığı yazar ("hiçbir kaynakta maliyet bilgisi yok"). Model yalnızca soruyu cümleye döker. İma, komplo ve yönlendirme içeren sorular atılır.

**Sabah özeti:** *"Jarvis, günümü özetle"* ya da günün ilk, öğleden önceki uyanışında açılır (Ayarlar → İki alkışla uyanma → "Sabah ilk uyanışta sabah özeti"). Dikey kartlar 🤏 tutup yukarı sürükleyerek kaydırılır, Jarvis her kartı tek cümleyle okur. Kartlar:
- **hava:** bugün ve saatlik;
- **döviz:** TCMB, panodaki veri;
- **trafik:** İBB Trafik İndeksi. İstanbul geneli, Anadolu ve Avrupa yakası, son 2 saat. Anahtarsız, İBB Açık Veri Lisansı; güzergâh süresi vermez;
- **gündemin ilk 5 olayı.**

Ajanda kartı, Jarvis'e bir takvim bağlanınca görünür. Altın verisi panoda olmadığı için gösterilmez.

**Tarafsızlık kuralları (kodda zorunlu):**
- Jarvis yorum yapmaz, taraf tutmaz. Hiçbir kaynağı "doğru / yanlış", "propaganda" ya da "taraflı" diye etiketlemez. Bu ifadeler Jarvis'in hiçbir cümlesinde geçemez; geçen madde atılır.
- Kişiler hakkında suçlama ve niyet okuması yoktur. Kişilerle ilgili her şey kaynaktan alıntıdır.
- Modelin her alıntısı kaynak metinde birebir aranır; bulunamayan madde atılır. Jarvis'in cümlelerindeki her sayı ve şehir kaynak metinlerde geçmek zorundadır.
- Veri yoksa tahmin yoktur.
- Haber fotoğrafları foto modu kuralına uyar. "video (stok)" modunda kartlarda haber fotoğrafı gösterilmez.

**Kaynak listesi:** `server/src/newsSources.ts`. Tek dosyadır, elle düzenlenir: satır ekleyin ya da silin, `npm run test` her beslemeyi dener. Liste farklı yayın çizgilerinden dengeli seçildi:
- **kamu ve ajans:** AA, TRT Haber;
- **hükümete yakın:** Sabah, A Haber, Yeni Şafak;
- **ana akım:** Hürriyet, Milliyet, CNN Türk, NTV, Habertürk;
- **muhalif:** Sözcü, Cumhuriyet, BirGün, Evrensel, Karar;
- **bağımsız:** Medyascope, bianet, Diken;
- **uluslararası Türkçe:** BBC, DW, Euronews, Independent Türkçe, Sputnik;
- **bilim ve teknoloji:** Evrim Ağacı, Webtekno.

Gruplar yalnızca dengeyi görmek içindir; ekranda gösterilmez. Listede olmayanlar ve nedeni:
- **T24:** RSS cevap vermiyor.
- **Halk TV:** bot isteklerini başka siteye yönlendiriyor.
- **Amerika'nın Sesi:** çalışan RSS bulunamadı.
- **Gazete Oksijen, Doğruluk Payı:** RSS yok.

"Aydınlat beni" brifingi de aynı listeyi kullanır.

**Arşiv:** Birden çok kaynağın verdiği olaylar her gün `server/data/haber-arsivi/YYYY-AA-GG.json` dosyasına yazılır. Bu klasör GitHub'a gitmez. Bir kez yapılan analiz (tam metinler, karşılaştırma, sorular) burada saklanır; kart yeniden açılınca model çağrılmaz. Arşiv şunlar için kullanılır:
- "daha önce nasıl anlatılmıştı?";
- takibi yapılmamış sözler.

90 günden eskisi silinir. Haber modu açıkken karuselin ilk 5 kartı arka planda önceden analiz edilir.

**Kamerasız deneme:**
- `?el=demo&mod=haber`: sentetik ellerle motto → 🤏 karuseli sürükle → ☝️ → ✊→🖐 aç → detay (🤏 kaydır) → 🤏🤏 karşılaştırma → terazi → sorular → ✊ tut: geri → sabah özeti → 🤏🤏 yakınlaş / uzaklaş. Veriler sunucudan gelen gerçek haberlerdir. Analiz gelmeden demo bir sonraki adıma geçmez. Demoda el kilidi adımı yoktur.
- `?el=demo&mod=haber&haber=elle` ile klavye: **Y** canlı yayın, **H** son dakika, **R** manşetler, **A** dünyada bugün, **P** basın özeti, **V** haber duvarı (çekim için).
- `?el=demo&mod=haber&haber=elle`: sentetik el yok, klavyeyle gezilir.
- `?el=demo&mod=haber&ara=Gazze`: açılıştan sonra arama (tarama animasyonu, gerçek sonuçlar); `&dunya=1` ardından öndeki olayın dünya basını. Çekim için.

**Testler:**
- `npm run test:haber`:
  - 92 sesli komut yazımı (arama, dünya basını ve haber merkezi komutları; "son haberleri getir" gibi genel cümlelerin arama sayılmaması dahil);
  - 15 el hareketi senaryosu (sahte el kareleriyle): el kilidi (kilitsiz el hiçbir şey tetiklemez, hareket eden avuç kilitlenmez, kısa kopma kilidi bozmaz, kol inince kilit açılır, iki elle hareket için iki el de kilitli), sürükleme ve bırakış hızı, titremenin sürükleme sayılmaması, çekme, iki elle yakınlaş / uzaklaş (bir tutuşta bir seviye), terazi, kısa yumruk ve aç, yumruğu tutunca geri (yumruk yapmak tek başına bir şey yapmaz);
  - sunucu testleri (56): Bing News (gerçek adres, "on MSN" eki; metni okunan yayının öne alınması), takip (yeni kaynak ve yeni gelişme bir kez bildirilir, alakasız olay bildirilmez, diskte kalıcı), yer bulma (Türkçe ek, kişi adından ülke, ilk geçen yer, bulunamazsa yok), dünya basını (Google News başlık ayrıştırma, kapalı yayının atlanması, geçersiz eşleşme numaraları, birebir olmayan alıntının ve değerlendirici dilin atılması, model yoksa "model-yok", önbellek), arama eşleştirici (Türkçe ekler, kısa kelime); karşılaştırmadaki her "farklı vurgu" ve "farklı sayı" alıntısının kaynak metinde birebir bulunması, her etiketin bağlantı ve tarih taşıması, veri yoksa "doğrulanamadı", her sorunun gerçek bir boşluğa dayanması, değerlendirici dil filtresi, kümeleme, tam metin çıkarma.
- İnternet ve model gerekmez.

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
