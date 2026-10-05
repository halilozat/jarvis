// Gündem brifingi komutu ve sabit açılışı. Hem ajan hem ses tarafı kullanır.

// Brifing YALNIZCA bu komutla açılır ("jarvis, aydınlat beni"). Konuşma tanıma "ı"yı "i" yazabiliyor.
export const BRIEF_TRIGGER = /ayd[ıi]nlat\s*beni/i;

export const BRIEF_OPENING = 'Merhaba efendim, kahvenizi aldıysanız başlıyorum.';
