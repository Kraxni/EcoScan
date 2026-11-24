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

## Règles

1. Un seul fond. Pas d'alternance clair/sombre entre sections.
2. Titres et chapôs centrés ; une idée par écran.
3. Un bouton primaire vert, un lien secondaire avec chevron.
4. Le mouvement explique (trajet d'un objet, défilement fluide), il ne décore pas.
5. Aucun résultat, partenariat ou équipement présenté comme réel : projet académique, concept.

## Mouvement au défilement

Piloté par le navigateur (CSS `animation-timeline: view()`), donc sans écouteur de défilement ni JavaScript : seulement `transform`, `translate`, `scale` et `opacity`, exécutés hors du fil principal.

- La station (rendu 3D détouré) monte et grandit en entrant, puis dérive lentement ; une très légère flottaison l'anime au repos.
- Les cartes, lignes et étapes montent une à une (décalage par rangée) ; chaque entrée de la liste de la promesse trace sa ligne de gauche à droite.
- L'entrée de page s'estompe quand on la quitte ; les mots des titres montent à l'arrivée du titre (GSAP, découpage fait juste avant l'affichage).
- Sans prise en charge de `animation-timeline`, avec « réduire les animations » ou à l'impression, tout reste statique et lisible.
- Un élément à `overflow: hidden` devient un conteneur de défilement et casse la chronologie : utiliser `overflow: clip` sur les ancêtres d'éléments animés.
