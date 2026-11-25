# EcoScan — direction visuelle

**Innovation, version nature.** Une page produit à la manière d'Apple ou de SpaceX — grands titres centrés, un visuel produit plein cadre, beaucoup d'air — posée sur **un seul fond vert clair** et un feuillage en filigrane. Le site doit donner l'impression d'un projet pour améliorer la vie, pas d'un laboratoire.

## Tokens (voir la fin de `premium.css`)

| Rôle | Valeur |
| --- | --- |
| Fond de page (partout) | `#e6f0df` + feuillage `assets/leaves-light.svg` fixe en filigrane |
| Encre | `#0f2a1c` |
| Texte secondaire | `#456252` |
| Tuiles | `#ffffff`, rayon 20 px, sans bordure |
| Vert d'action | `#1a7f4b` (hover `#136a3d`) |
| Vert clair (sur panneaux sombres) | `#6fe0a0` |
| Panneaux sombres | `#0b2a1b` : uniquement la scène du trajet, le téléphone de démonstration et le lecteur vidéo |

## Typographie

Pile système : **SF Pro** sur Apple, **Inter** (hébergée dans `assets/fonts/`) ailleurs. Titres en graisse 650–700, interlettrage serré (−0,035 à −0,05 em), corps à 18 px.

- **Aucun texte HTML sous 12 px (`.75rem`)**, étiquettes et légendes comprises. Les étiquettes qui disent « concept », « fictif » ou « non mesuré » sont celles qu'il faut lire le plus facilement.
  <!-- 2026-11-25: revue du site, acceptée par « fait tout » ; avant, 80 déclarations allaient de 8,8 à 11,5 px -->
- **Typographie française : espace insécable avant `;` `:` `!` `?` (U+202F avant `; ! ?`, U+00A0 avant `:`) et à l'intérieur des guillemets « ».** Sinon une ligne peut commencer par « ; » sur mobile.
  <!-- 2026-11-25: idem -->
- **Tout texte dans une autre langue que le français porte `lang`** (ex. `<h2 lang="en">`), pour que les lecteurs d'écran le prononcent correctement.
  <!-- 2026-11-25: idem -->
- **Un chiffre qui n'est pas mesuré porte son statut avant le chiffre** (`.stat-flag` : « Objectif · non mesuré »). La phrase d'explication seule, en petit sous un gros chiffre, ne suffit pas.
  <!-- 2026-11-25: idem ; prolonge la règle 5 -->
- **Cibles tactiles de 44 px**, liens de l'en-tête compris sur écran tactile (`@media(pointer:coarse)`).
  <!-- 2026-11-25: idem -->

## Règles

1. Un seul fond. Pas d'alternance clair/sombre entre sections.
2. Titres et chapôs centrés ; une idée par écran.
3. Un bouton primaire vert, un lien secondaire avec chevron.
4. Le mouvement donne au site un air d'innovation et explique avant de décorer (trajet d'un objet, défilement fluide), mais il reste fluide : compositeur seul et sous le plancher de performance (voir « Mouvement au défilement »).
   <!-- 2026-11-25: « maybe a little more animations and scrolling effects so it looks more innovative » ; remplace « le mouvement explique, il ne décore pas », qui contredisait cette demande -->
5. Aucun résultat, partenariat ou équipement présenté comme réel : projet académique, concept.

## Surfaces

- **Les rendus de la station et les photos produit s'affichent entiers, sur le fond de page, dans leur rapport naturel. Jamais de `object-fit: cover` qui les recadre en tuile.**
  Pourquoi : tu n'aimes pas les images recadrées (préférence, sans autre raison donnée).
  Contrôle : `node tests/taste.cjs` (rapport affiché ≠ rapport natif de plus de 2 %, sur `main img` à 1440 et 390 px).
  <!-- 2026-11-25: « i am not a big fan of the cropped pictures like this maybe change that and there is some awkward empty spaces » -->
- **Les visuels de la station sont les rendus Blender/Cycles du modèle d'origine (`assets/econova-compact-*.webp`, `assets/ecoscan-*-studio.webp`, film v3 ; sources : `tools/render_compact_model.py`, `tools/build_station_stills.py`, `tools/film_v3/`). Ne jamais les redessiner en SVG/CSS ni les remplacer par un modèle simplifié ; un nouveau rendu garde l'allure de l'ancien.**
  Pourquoi : *inféré, à confirmer* : le rendu d'avant paraissait plus réaliste et plus premium. Tu as seulement dit « plus beau ».
  <!-- 2026-11-25: « le modele d'avant estait plus beau je veux qu'il resemble au photo 3d … celle en 3d de avan » -->

## Copy

- **Une refonte visuelle ne réécrit ni les explications, ni les sous-titres, ni la voix du film.**
  Pourquoi : *inféré, à confirmer* : le texte et la voix étaient déjà validés ; la plainte était visuelle.
  <!-- 2026-11-25: « okay les expliction et la voie il ne faut pas la chaneger » -->


## Mouvement au défilement

Piloté par le navigateur (CSS `animation-timeline: view()`), donc sans écouteur de défilement ni JavaScript : seulement `transform`, `translate`, `scale` et `opacity`, exécutés hors du fil principal.

- La station (rendu 3D détouré) monte et grandit en entrant, puis dérive lentement ; une très légère flottaison l'anime au repos.
- Les cartes et les étapes montent une à une à leur entrée (`editorial-entrance`, 0,65 s, fill `backwards` pour que le survol reprenne la main après l'entrée, décalage par rangée), déclenchées une seule fois par un `IntersectionObserver` : ce n'est pas une chronologie de défilement. Chaque entrée de la liste de la promesse trace sa ligne de gauche à droite.
- L'entrée de page s'estompe quand on la quitte ; les mots des titres montent sur une chronologie CSS `view()` (voir la règle ci-dessous ; JavaScript ne fait que découper les mots et poser `--k`).
- Sans prise en charge de `animation-timeline`, avec « réduire les animations » ou à l'impression, tout reste statique et lisible.
- Un élément à `overflow: hidden` devient un conteneur de défilement et casse la chronologie : utiliser `overflow: clip` sur les ancêtres d'éléments animés.

### Règles issues de tes corrections

- **Les mots des titres se révèlent de `cover 8%` à `cover 27%` sur la chronologie `view()`, avec +1,3 % par mot (`.split-css .wi`). Ne règle que dans cette fenêtre.**
  Pourquoi : trop tard, le titre est déjà au milieu de l'écran quand il s'écrit et l'effet n'est pas fluide ; trop tôt, on ne le voit plus arriver. Cette fenêtre est l'endroit où tu as atterri après deux ajustements. Elle ne vaut que pour les titres : le manifeste (14 % → 44 %) est un réglage de l'agent.
  Contrôle : `node tests/taste.cjs` (`animation-range` calculé des mots 0 et 3).
  <!-- 2026-11-25: « les textes … apparaissent trop tard avec le scroll, je suis déjà au milieu bas de la page » puis « c vrm juste un tout petit peu trop tôt » -->
- **Tout effet de défilement reste sur le compositeur (`transform`, `translate`, `scale`, `opacity`). Un ajout de mouvement ne fait jamais passer le score Lighthouse mobile sous 95.**
  Pourquoi : un site qui saute n'est pas premium ; tu veux plus d'animations seulement si elles restent fluides.
  Poids : le chargement transfère au plus 256 Ko (233 Ko mesurés le 2026-11-25, + 10 %). Tu as dit « pas trop lourd » sans chiffre : ce budget est la proposition de l'agent.
  Plancher : 95 est la recommandation de l'agent, à confirmer. Mesure de référence du 2026-11-25 : 97 à 98 (LCP 2,4 s, TBT 43 à 80 ms, CLS 0).
  Contrôle : `node tools/perf_floor.cjs` (Lighthouse mobile, serveur local). Le serveur `tools/serve_local.py` compresse le texte en gzip comme GitHub Pages ; sans cela le même site tombe à 88.
  <!-- 2026-11-25: « il lag un peut et que animation de scroll sont muavaises », « cet a dire sauter », « pk le score de performance baisse », « fait pas non plus un site trop lourd prsq la il est vrm pas fluide » -->

### Règles issues de la revue d'animations

- **Fréquence.** Une action qui se répète ne s'anime pas : le rideau entre parcours ne joue qu'après un clic ou un toucher, jamais quand la vue change au clavier. Il dure 0,5 s en tout (`power3.out`).
- **Durées.** Survol : 200 à 250 ms (0,22 s). Rien au-dessus de 300 ms sur un élément d'interface, sauf feuilles, rideau et révélations au défilement.
- **Survol.** Tout mouvement au survol est dans `@media (hover:hover)` : sur tactile, un appui ne laisse pas un survol « collé ».
- **Pointeur.** Les boutons suivent le pointeur de 5 px au plus, sans rebond (`power3.out`) : la cible ne fuit pas sous le doigt. L'inclinaison du produit et ce suivi relisent « réduire les animations » à chaque mouvement.
- **Manifeste.** Les mots s'éclairent par une chronologie CSS `view()` (comme les titres) : pas de JavaScript pendant le défilement. L'écriture de l'opacité en JavaScript ne reste que comme repli sans `animation-timeline`.
- **Boucles décoratives.** La flottaison de la station s'arrête hors de l'écran (classe `is-offscreen`) ; la dérive au défilement ne s'arrête jamais (la mettre en pause la ferait sauter au retour).

## Mise en page horizontale (écrans de 1100 px et plus)

- **Dès 1100 px, texte et visuel se placent côte à côte ; aucune bande vide. Au-dessous, tout s'empile. Utiliser mieux la place sans surcharger : une idée par écran.**
  Pourquoi : « weird spaces with nothing » ; le site était trop vertical.
  <!-- 2026-11-25: « it is a bit to vertical … make the webiste more horizontal and less vertival », « use the place better without overwhelming the userts » -->

Moins de pile verticale : texte et image côte à côte, en alternant les côtés (promesse, concept, architecture, fonctionnement, technologies, exploitation), film et vue en coupe installés à côté de leurs réglages, cartes en rangée (le panneau sombre de l'architecture et ses deux cartes), l'image de la station reste en vue pendant la lecture des étapes (sticky). En dessous de 1100 px, tout s'empile comme avant.

## Application mobile

Même système visuel que le site (fond vert, panneaux sombres pour le solde, vert d'action, Inter), pensé pour le pouce : barre d'onglets en bas, cibles de 44 px, un écran par idée, zones sûres de l'iPhone respectées. Chaque écran dit ce qui est simulé ; aucun point n'est réel. Le mouvement est discret et disparaît avec « réduire les animations ».

Toucher (le flash gris du navigateur est supprimé, donc chaque commande répond à l'appui) :
- Toute commande a un état `:active` en 120 ms : `scale(.97)` pour onglets, puces, tuiles et réponses, opacité pour les liens.
- Le texte des commandes n'est pas sélectionnable à l'appui long (`user-select: none` sur `button`, `.tile`, `.chip`, `.link`) ; le contenu l'est.
- Tout survol est dans `@media (hover:hover) and (pointer:fine)`. `overscroll-behavior: none` sur `html`, `contain` sur la boîte de dialogue et la liste de filtres.
- Champs : 16 px, `enterkeyhint="go"`, `autocorrect="off"`. Pas de `interactive-widget=resizes-content` : la barre d'onglets fixe remonterait au-dessus du clavier. Un seul `theme-color` : l'app n'a pas de mode sombre.

