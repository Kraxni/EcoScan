# EcoScan — parti pris visuel

**Planche de laboratoire imprimée.** Un site qui ressemble à un cahier d'essais bien composé : papier d'os, encre presque noire, filets d'un pixel, numérotation, un seul accent vif. Pas de lumière décorative, pas de verre dépoli, pas d'ombres molles. La profondeur vient du contraste franc entre surfaces (papier / nuit) et de l'échelle typographique.

## Tokens (voir `:root` dans `premium.css`)

| Rôle | Valeur | Usage |
| --- | --- | --- |
| Nuit | `#08150f` | Surfaces sombres, texte sur papier |
| Papier | `#efeadc` / `#e5dfcc` | Fond principal, fond alterné |
| Signal | `#c9f24b` | Le scan, l'action, le chiffre à retenir. Un seul accent. |
| Ambre | `#e8923a` | Le doute, la voie de contrôle. Jamais décoratif. |
| Filet | `1px solid` encre à 16 % | Séparer, structurer. Remplace cartes et ombres. |

Rayons : 3 à 4 px partout (angles nets). Pas de pilules, sauf le sélecteur d'objet du trajet où la forme de bouton compte.

## Typographie

- **Fraunces** (serif éditoriale à axe optique) pour les titres : très grands (jusqu'à ~9 rem) face à un corps de 17 px.
- **Instrument Sans** pour le texte courant.
- **JetBrains Mono** pour les repères techniques, étiquettes et numéros.

## Règles

1. Aucun dégradé décoratif, aucun texte en dégradé, aucun halo lumineux, aucun `backdrop-filter`.
2. Pas de sur-titre au-dessus de chaque H2 : les sur-titres restent dans le HTML (lecteurs d'écran) mais sont masqués visuellement, hors hero.
3. Pas de rangée de trois cartes identiques : les colonnes sont asymétriques et décalées en escalier.
4. Pas de faux dashboard dans le hero : l'image est l'étude réelle du concept.
5. Titres courts, concrets, factuels. Bannis : « révolutionner », « tout-en-un », « propulsé par », « sans effort ».
6. Mouvement au service du sens (le trajet d'un objet, le scan), jamais en fond d'écran.
7. Chaque changement d'interface est inspecté en capture avant validation : on cherche et on retire les réflexes génériques.
