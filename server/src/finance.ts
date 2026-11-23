/**
 * Canlı Finans, Altın, Kripto & Borsa Modülü
 */

export interface MarketAsset {
  code: string;
  name: string;
  buying: number;
  selling: number;
  changeRate: number;
  type: 'gold' | 'currency' | 'stock' | 'crypto';
}

export async function getFinancialMarkets(category?: 'altin' | 'doviz' | 'borsa' | 'kripto' | 'hepsi'): Promise<{
  updateDate: string;
  items: MarketAsset[];
  summary: string;
}> {
  try {
    const res = await fetch('https://finans.truncgil.com/v4/today.json', { signal: AbortSignal.timeout(6000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: any = await res.json();

    const items: MarketAsset[] = [];

    // Altınlar
    if (!category || category === 'altin' || category === 'hepsi') {
      if (data.GRA) items.push({ code: 'GRAM_ALTIN', name: 'Gram Altın', buying: data.GRA.Buying, selling: data.GRA.Selling, changeRate: data.GRA.Change, type: 'gold' });
      if (data.CEYREKALTIN) items.push({ code: 'CEYREK_ALTIN', name: 'Çeyrek Altın', buying: data.CEYREKALTIN.Buying, selling: data.CEYREKALTIN.Selling, changeRate: data.CEYREKALTIN.Change, type: 'gold' });
      if (data.YARIMALTIN) items.push({ code: 'YARIM_ALTIN', name: 'Yarım Altın', buying: data.YARIMALTIN.Buying, selling: data.YARIMALTIN.Selling, changeRate: data.YARIMALTIN.Change, type: 'gold' });
      if (data.TAMALTIN) items.push({ code: 'TAM_ALTIN', name: 'Tam Altın', buying: data.TAMALTIN.Buying, selling: data.TAMALTIN.Selling, changeRate: data.TAMALTIN.Change, type: 'gold' });
      if (data.CUMHURIYETALTINI) items.push({ code: 'CUMHURIYET_ALTINI', name: 'Cumhuriyet Altını', buying: data.CUMHURIYETALTINI.Buying, selling: data.CUMHURIYETALTINI.Selling, changeRate: data.CUMHURIYETALTINI.Change, type: 'gold' });
      if (data.GUMUS) items.push({ code: 'GUMUS', name: 'Gümüş (Gram)', buying: data.GUMUS.Buying, selling: data.GUMUS.Selling, changeRate: data.GUMUS.Change, type: 'gold' });
    }

    // Borsa
    if (!category || category === 'borsa' || category === 'hepsi') {
      if (data.XU100) items.push({ code: 'BIST_100', name: 'Borsa İstanbul (BIST 100)', buying: data.XU100.Selling, selling: data.XU100.Selling, changeRate: data.XU100.Change, type: 'stock' });
    }

    // Döviz
    if (!category || category === 'doviz' || category === 'hepsi') {
      if (data.USD) items.push({ code: 'USD', name: 'Amerikan Doları', buying: data.USD.Buying, selling: data.USD.Selling, changeRate: data.USD.Change, type: 'currency' });
      if (data.EUR) items.push({ code: 'EUR', name: 'Euro', buying: data.EUR.Buying, selling: data.EUR.Selling, changeRate: data.EUR.Change, type: 'currency' });
      if (data.GBP) items.push({ code: 'GBP', name: 'İngiliz Sterlini', buying: data.GBP.Buying, selling: data.GBP.Selling, changeRate: data.GBP.Change, type: 'currency' });
    }

    const summaryParts = items.map((i) => `${i.name}: ${i.selling} TL (%${i.changeRate > 0 ? '+' : ''}${i.changeRate})`);

    return {
      updateDate: data.Update_Date || new Date().toLocaleTimeString('tr-TR'),
      items,
      summary: summaryParts.join(' | '),
    };
  } catch (e: any) {
    return {
      updateDate: new Date().toLocaleTimeString('tr-TR'),
      items: [],
      summary: `Finans verileri şu an alınamadı: ${e.message}`,
    };
  }
}
