# EcoScan · architecture opérationnelle

Ce document décrit comment l'app, un serveur et la poubelle (la « station ») fonctionneraient ensemble **si la poubelle était construite**. Aucune station n'existe aujourd'hui : tout ce qui suit est testé avec un simulateur (`tools/station_simulator.js`), pas avec du matériel. Le site et l'app restent en mode démonstration tant qu'aucun serveur n'est configuré.

## Ce qui existe, et ce qui reste à faire

| Élément | État |
|---|---|
| App mobile (installable, hors-ligne, lecture du QR code par la caméra) | Fait, testé (`tests/app.cjs`, `tests/live.cjs`) |
| Serveur de référence (sessions, flux en direct, crédit idempotent, échanges, signatures) | Fait, testé (`tests/server.cjs`) |
| Simulateur de station (joue le contrôleur de la poubelle) | Fait |
| Contrôleur de la vraie station (firmware, capteurs, mécanisme) | **À construire** : voir « Ce que doit faire le contrôleur » |
| Hébergement du serveur | **À choisir** (aucun serveur n'est déployé) |
| Remise des objets échangés, partenaires, conditions d'usage, protection des données | **À organiser** hors logiciel |
| Règles de points validées sur le terrain | **À valider** par un pilote : les valeurs actuelles sont des hypothèses |

## Vue d'ensemble

```
 Téléphone (app / PWA)          Serveur EcoScan                 Station (contrôleur)
 ─────────────────────          ───────────────                 ────────────────────
 scanne le QR  ───────────────▶ POST /v1/sessions
                                 crée la session, la station
                                 ne répond qu'aux requêtes
 flux en direct (SSE) ◀──────── événements de la session
                                                  ◀──── POST /v1/station/heartbeat   (toutes les ~5 s, signé)
                                 réponse : « la session X est ouverte »
                                                  ◀──── POST /v1/station/events      (signé, un par étape)
                                 deposit.detected / analyzed / routed
                                 deposit.confirmed → crédit unique dans le registre
 solde, historique ───────────▶ GET /v1/wallet
 échange ─────────────────────▶ POST /v1/exchanges  (clé d'idempotence)
```

La station **interroge** le serveur : elle n'a pas besoin d'adresse publique ni de port ouvert (elle peut être derrière le Wi-Fi d'un bâtiment). Le serveur ne l'appelle jamais.

## Le QR code collé sur la station

Contenu : `https://kraxni.github.io/EcoScan/app/?s=ECO-001` (adresse de l'app + identifiant de la station). Deux usages :
- avec l'appareil photo du téléphone : l'app s'ouvre et la session démarre toute seule ;
- avec le bouton « Scanner avec la caméra » de l'app : lecture dans l'app (`BarcodeDetector` si le navigateur l'a, sinon `jsQR`, chargé à la demande).

L'identifiant est aussi écrit sous le QR code, pour la saisie manuelle (caméra refusée, QR abîmé). Générer l'étiquette : `python3 tools/make_station_qr.py ECO-001`.

Le QR est **public** : il n'identifie que la station. Ce qui protège le crédit des points, c'est la signature de la station, pas le secret du QR (voir « Sécurité »).

## Cycle d'une session

1. **Ouverture.** L'app envoie `POST /v1/sessions {stationId}`. Refus : `404 unknown_station`, `503 station_offline` (aucun battement de cœur depuis 30 s), `409 station_busy` (une autre personne utilise la station). Réponse : identifiant de session, jeton du flux, état des compartiments. Une session déjà ouverte par le même appareil est reprise.
2. **Annonce à la station.** Au prochain battement de cœur, la réponse contient `session: {id, expiresAt}`. La station peut alors accepter un dépôt (LED, écran, ouverture de la trappe).
3. **Dépôt.** La station envoie ses événements dans l'ordre : `deposit.detected`, `deposit.analyzed {items, confidence}`, `deposit.routed {routes}`, puis `deposit.confirmed {items}` ou `deposit.rejected {reason}`. L'app les affiche en direct.
4. **Crédit.** Sur `deposit.confirmed`, le serveur calcule les points selon `server/policy.js` (la station dit ce qu'elle a vu, le serveur décide des points), les inscrit **une seule fois** dans le registre et pousse le nouveau solde à l'app.
5. **Fin.** `POST /v1/sessions/:id/close`, ou expiration après 5 minutes sans activité. La station est alors libre.

## API

Appareil (en-tête `Authorization: Bearer <jeton d'appareil>`, sauf mention) :

| Méthode et chemin | Rôle |
|---|---|
| `GET /v1/health` (public) | État du serveur et des stations (en ligne, remplissage) |
| `POST /v1/devices` (public) | Crée une identité d'appareil anonyme : `{deviceId, deviceToken}` |
| `POST /v1/sessions` | Ouvre (ou reprend) une session `{stationId}` |
| `GET /v1/sessions/:id/events?stream=<jeton>` | Flux SSE ; `Last-Event-ID` rejoue ce qui a été manqué après une coupure |
| `POST /v1/sessions/:id/close` | Ferme la session |
| `GET /v1/wallet` | Solde, gains du jour, plafond, 50 dernières lignes du registre |
| `GET /v1/offers`, `POST /v1/exchanges` | Catalogue et échange `{offerId, idempotencyKey}` (`402 insufficient_points` si le solde manque) |

Station (signées, voir ci-dessous) :

| Méthode et chemin | Corps |
|---|---|
| `POST /v1/station/heartbeat` | `{stationId, fill:{pet,can,paper}, fw}` ; réponse : `{serverTime, session|null}` |
| `POST /v1/station/events` | `{eventId, stationId, sessionId, type, ts, payload}` ; `409 no_active_session` si la session n'existe plus ou est fermée |

Matières reconnues : `pet`, `can`, `paper`, `uncertain` (le doute n'est jamais crédité). Au plus 5 objets par dépôt.

## Sécurité

- **Station → serveur.** Chaque requête porte `X-Eco-Signature: t=<secondes>,v1=<HMAC-SHA256(secret, "t.corps")>`. Le serveur refuse une signature fausse, un corps modifié, ou un horodatage à plus de 60 s (rejeu). Chaque station a son propre secret (généré à la fabrication, jamais dans le dépôt). Compromettre une station ne permet pas d'agir au nom des autres.
- **Crédit unique.** L'identifiant d'événement (`eventId`) est mémorisé : un événement renvoyé après une coupure réseau ne crédite pas deux fois. Un événement refusé (`422`) n'est pas mémorisé et peut être renvoyé corrigé.
- **Plafond.** 200 points par appareil et par jour (`DAILY_CAP`) : limite l'effet d'un abus. Au-delà, le dépôt est confirmé mais ne crédite rien, et l'app le dit.
- **Appareil.** Jeton aléatoire de 256 bits, stocké en empreinte (SHA-256) côté serveur. Pas de compte, pas d'e-mail, pas de nom.
- **App → serveur.** HTTPS obligatoire (sauf `localhost` pour les essais). L'adresse du serveur ne peut pas être changée par un QR code : seulement à la main dans l'app, pour éviter qu'une étiquette malveillante redirige les gens.
- **Limite de débit** par adresse, corps limité à 64 Ko, CORS configurable (`ECO_ORIGINS`).
- **Ce que le serveur ne fait pas encore** : authentification forte de l'opérateur, rotation des secrets, journal d'audit signé, détection d'anomalies. À ajouter avant un usage public.

## Protection des données

Données conservées : un identifiant d'appareil anonyme, un registre de lignes `(date, points, station)`, des échanges. Aucune image : la caméra du téléphone sert seulement à lire le QR code, localement ; rien n'est enregistré ni envoyé. Avant un pilote public, il faudra tout de même définir la durée de conservation, informer les participants et vérifier le droit applicable (en Suisse, la loi sur la protection des données).

## Pannes prévues

| Situation | Comportement |
|---|---|
| Caméra refusée ou absente | Message clair, saisie de l'identifiant toujours possible |
| QR qui n'est pas celui d'une station | « Ce QR code n'est pas celui d'une station EcoScan » |
| Station éteinte ou sans réseau | `station_offline` : « Cette station ne répond pas » |
| Station occupée | `station_busy` : « Quelqu'un utilise déjà cette station » |
| Téléphone qui perd la connexion pendant un dépôt | Le flux se reconnecte seul et rejoue les événements manqués ; le crédit a lieu côté serveur, donc ne dépend pas du téléphone |
| Station qui perd la connexion pendant un dépôt | Elle doit renvoyer le même `eventId` jusqu'à recevoir `200` : le serveur déduplique |
| Compartiment plein | La station refuse (`deposit.rejected`, `bin_full`) avant tout crédit ; l'app l'affiche |
| Objet douteux | Contrôle isolé, aucun point (« mieux vaut un doute qu'une contamination ») |
| Session abandonnée | Expire après 5 minutes ; la station est libérée |
| Serveur redémarré | Soldes et échanges conservés si `ECO_DB` est défini ; les sessions en cours sont perdues |

## Ce que doit faire le contrôleur de la station

Le contrôleur (par exemple un petit ordinateur ou un microcontrôleur avec Wi-Fi) doit :
1. envoyer un battement de cœur signé toutes les 5 à 10 s avec le remplissage de ses trois compartiments ;
2. n'accepter un dépôt que si la réponse au battement contient une session ouverte ;
3. pour chaque dépôt, envoyer dans l'ordre `deposit.detected`, `deposit.analyzed`, `deposit.routed`, puis `deposit.confirmed` **après** avoir vérifié mécaniquement le passage de l'objet ; un `eventId` unique par événement (au moins 8 caractères) ;
4. refuser le dépôt et envoyer `deposit.rejected` si un compartiment visé est plein ou si le mécanisme est bloqué ;
5. renvoyer l'événement tant que la réponse n'est pas `200` (la déduplication évite le double crédit) ;
6. rester sûr en cas de coupure : sans réseau, ne rien créditer, ne pas bloquer le mécanisme.

`tools/station_simulator.js` est l'implémentation de référence de ce comportement (une centaine de lignes).

## Lancer et tester

```sh
ECO_DEV=1 node server/server.js                      # serveur + station de test ECO-001
node tools/station_simulator.js --control 8788       # station simulée, pilotable au curl
curl -X POST localhost:8788/deposit -d '{"materials":["pet","can"]}'

node tests/server.cjs     # serveur : signatures, rejeu, idempotence, plafond, expiration, persistance
node tests/live.cjs       # app + serveur + simulateur + vraie lecture de QR par la caméra
```

Variables du serveur : `PORT` (8787), `ECO_STATIONS` (JSON `{"ECO-001":{"label":"…","secret":"…"}}`), `ECO_ORIGINS` (liste d'origines autorisées, séparées par des virgules), `ECO_DB` (fichier d'instantané), `ECO_DEV=1` (station de test avec un secret public : jamais en production).

Dans l'app : onglet Station, « Connexion à une station… », saisir l'adresse du serveur (par exemple `http://127.0.0.1:8787` pour un essai sur le même ordinateur).

## Héberger le serveur

Le serveur est du Node sans dépendance : il tourne sur n'importe quel hébergement Node, ou sur un petit ordinateur laissé allumé, derrière un tunnel HTTPS. Les conditions des offres gratuites changent : les vérifier au moment du choix. Pour la production, remplacer le stockage JSON par une vraie base (le registre est une simple liste de lignes) et garder au moins un serveur toujours en ligne, puisque le flux en direct (SSE) demande une connexion ouverte.
