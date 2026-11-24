'use strict';
/*
 * Règles de points d'EcoScan, côté serveur : la poubelle signale ce qu'elle a vu, le serveur décide des points.
 * Ce sont les mêmes règles que la démonstration du site et de l'app, mais ici elles sont appliquées pour de bon,
 * au même endroit pour tous les appareils. Aucune valeur n'est validée sur le terrain : à ajuster après un pilote.
 */
const POINTS_PER_ITEM = 10;      // par objet reconnu (PET, aluminium, papier)
const MAX_ITEMS_PER_DEPOSIT = 5; // au-delà, la station doit refuser le dépôt
const DAILY_CAP = 200;           // plafond par appareil et par jour : limite les abus
const MATERIALS = ['pet', 'can', 'paper', 'uncertain'];

function pointsFor(items) {
  if (!Array.isArray(items) || items.length < 1 || items.length > MAX_ITEMS_PER_DEPOSIT) return { ok: false, error: 'invalid_items' };
  let recognised = 0, uncertain = 0;
  for (const it of items) {
    const m = it && it.material;
    if (!MATERIALS.includes(m)) return { ok: false, error: 'invalid_material' };
    if (m === 'uncertain') uncertain++; else recognised++;
  }
  return { ok: true, points: recognised * POINTS_PER_ITEM, recognised, uncertain };
}
module.exports = { POINTS_PER_ITEM, MAX_ITEMS_PER_DEPOSIT, DAILY_CAP, MATERIALS, pointsFor };
