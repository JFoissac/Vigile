# Audit visuel — Vigile v2

**Périmètre** : captures 1600×900 de `shots/`, relues en plein cadre puis en crops natifs.
**Règle respectée** : aucun fichier du jeu ni de `docs/` modifié ; seul ce rapport est écrit.
**Date** : 22 octobre 2026.

> **État de la passe — à lire avant les constats.**
> L'audit a été interrompu après `01-menu.png` et `03-vague3.png` (plein cadre + crops du HUD).
> `05-boss.png`, `07-aube.png`, `08-perf.png`, `deep-chk-w3.png`, `deep-chk2-w3.png` et `t-radar.png`
> **n'ont pas été analysées** : aucun constat ne les concerne et elles ne doivent pas être
> considérées comme validées. Les constats ci-dessous sont donc partiels, mais vérifiés sur image.

---

## 1. Synthèse priorisée

| ID | Prio | Capture | Zone | Défaut |
|---|---|---|---|---|
| V-01 | **P0** | 03-vague3 | Bas-gauche | Barre de vie quasi invisible sur fond clair |
| V-02 | **P0** | 03-vague3 (t-radar à confirmer) | Haut-gauche | Radar illisible : points minuscules, couleurs sans légende, légende ambiguë |
| V-03 | P1 | 03-vague3 | Haut-gauche | Deux compteurs d'ennemis contradictoires (14 hôtes / 10 debout) |
| V-04 | P1 | 01-menu | Centre | Bande verticale sombre à bord net qui coupe la composition |
| V-05 | P1 | 03-vague3 | Bas-droite | Bloc munitions surchargé, hiérarchie faible |
| V-06 | P1 | 03-vague3 + `ui.js:553-555` | Bas-droite | « 0 CHARGEURS » possible alors que la réserve contient encore des balles |
| V-07 | P1 | 01-menu, 03-vague3 | Multipoints | Textes fonctionnels à 9–10 px et faible opacité |
| V-08 | P2 | 03-vague3 | Bas-centre | Inventaire : libellés hétérogènes, titre vertical, zéros affichés |
| V-09 | P2 | 01-menu | Haut-droite | Icône son minuscule et non identifiable |
| V-10 | P2 | 03-vague3 | Haut-droite | Objectif répétitif, pastille collée au bord |
| V-11 | P2 | 03-vague3 | Haut-centre | Horloge sans progression vers l'aube |
| V-12 | À confirmer | 03-vague3 | Centre | Bandeau de lieu qui masque la nef et contredit l'horloge |
| V-13 | À confirmer | 01-menu | Bas-droite | Citation probablement fautive et peu lisible |

**P0 = information vitale illisible en combat. P1 = lisibilité ou cohérence dégradée. P2 = polish.**
Aucune capture n'est entièrement propre : la liste `screens_ok` est donc vide.

---

## 2. Constats détaillés

### V-01 — P0 — Barre de vie invisible selon le décor
- **Capture** : `03-vague3.png`
- **Zone** : bas-gauche, sous le libellé `VIGILE`, environ x 30–300 / y 845.
- **Constat** : la jauge est un filet clair très fin, sans fond ni bordure. Sur le sol brun clair
  de la scène, le remplissage se confond avec le décor ; à 100 % rien ne distingue « pleine » de
  « vide ». L'état bas repose uniquement sur un changement de couleur, sans forme ni icône.
- **Impact** : le joueur ne peut pas lire ses PV d'un coup d'œil, alors que c'est l'information la
  plus critique d'un FPS de survie.
- **Correctif** : plaque sombre 50–60 % derrière la barre + bordure 1 px ; remplissage os/ambre
  franchement opaque ; croix ou cœur à gauche ; valeur explicite `100 / 100`.

### V-02 — P0 — Radar non décodable
- **Capture** : `03-vague3.png` (`t-radar.png` non analysée, à recouper)
- **Zone** : haut-gauche, cadran circulaire + légende immédiatement dessous.
- **Constat** :
  - points de 5–8 px, regroupés en haut du cadran, certains à peine séparés ;
  - trois familles de couleurs (ambre, violet, cyan) codent le type de mort, **sans aucune légende**
    nulle part à l'écran ;
  - les contacts au-delà de la portée sont collés sur l'anneau à 92 % du rayon : plusieurs ennemis
    lointains se superposent en une seule tache, sans indication de nombre ;
  - légende `10 À PORTÉE  10 DEBOUT` : deux nombres accolés, même graisse, sans séparateur ni
    libellé de type, en 9–10 px très espacés ;
  - `N` d'environ 8 px qui tourne avec le regard, difficile à repérer.
- **Impact** : le radar est l'outil de lecture de la menace ; en l'état il demande un temps
  d'interprétation incompatible avec le combat.
- **Correctif** : légende à trois pastilles + mots (`marcheur / coureur / colosse`) ; blips ≥ 8 px
  avec liseré sombre 1 px ; légende scindée `10 à portée · 10 debout` ; `N` à 10 px ; cadran 160 px
  si la place le permet ; marquer les contacts collés au bord par un point triangulaire.

### V-03 — P1 — Double comptage d'ennemis contradictoire
- **Capture** : `03-vague3.png`
- **Zone** : haut-gauche (`VAGUE III` / `14 HÔTES`) et sous le radar (`10 DEBOUT`).
- **Constat** : deux nombres, deux formulations, aucun lien explicite. Impossible de savoir si
  « 14 hôtes » est le restant total, le total de la vague ou les ennemis en vie.
- **Impact** : le joueur ne sait pas s'il reste 14 ou 10 ennemis ; la jauge de pression perd son sens.
- **Correctif** : une seule source de vérité, formulée une seule fois :
  `VAGUE III — 10 debout · 14 restants` (ou suppression d'un des deux compteurs).

### V-04 — P1 — Bande verticale sombre qui coupe le menu
- **Capture** : `01-menu.png`
- **Zone** : centre, entre la colonne de menu et l'illustration du cimetière (≈ x 520–700).
- **Constat** : un panneau opaque, très sombre, avec un bord droit net, sépare brutalement le texte
  de l'illustration. La moitié gauche du décor est éteinte, la droite est nette : cela se lit comme
  un bug de rendu plutôt que comme un choix.
- **Impact** : casse l'unité de la direction artistique et attire l'œil sur un défaut technique au
  lieu du titre.
- **Correctif** : dégradé de 92 % à 0 % sur 120–160 px, ou illustration plein cadre + vignettage
  gauche ; supprimer le bord dur.

### V-05 — P1 — Bas-droite surchargé, hiérarchie faible
- **Capture** : `03-vague3.png`
- **Zone** : bas-droite, ≈ x 1150–1580 / y 750–890.
- **Constat** : cinq lignes se disputent la même zone — slot `6 HACHETTE`, `07 / 84`, pips,
  `7 CHARGEURS`, `PISTOLET MLE 1935 | 9 MM`, puis `OBJET  AUCUN OBJET  CLIC DROIT`.
  Le nombre vital (`07`) et la réserve (`84`) ont le même poids visuel ; le nom d'arme et l'état
  d'objet sont en 9–10 px ; `AUCUN OBJET` est un état négatif affiché en permanence.
- **Impact** : l'œil ne trouve pas le compte de balles en priorité ; la zone la plus dense du HUD
  est aussi la moins hiérarchisée.
- **Correctif** : trois niveaux — `07` gros / `/ 84` petit, `7 chargeurs` secondaire,
  nom d'arme 12 px ; masquer la ligne objet quand elle est vide ; aligner le bloc sur une seule
  colonne à droite.

### V-06 — P1 — Nombre de chargeurs trompeur avec une réserve partielle
- **Capture** : `03-vague3.png` + code `src/ui/ui.js:553-555`
- **Zone** : bas-droite, ligne `N CHARGEURS`.
- **Constat** : `Math.floor(reserve / magSize)`. Avec un chargeur de 12 et 11 balles en réserve,
  l'affichage donne `0 CHARGEURS` alors qu'un rechargement fournit encore 11 balles. Le libellé ne
  dit pas qu'il compte des chargeurs **pleins**.
- **Impact** : le joueur croit être à sec et peut jeter une arme encore utilisable.
- **Correctif** : `Math.ceil()` pour l'affichage, ou libellé `chargeurs pleins` + mention
  `+11` quand la réserve n'est pas un multiple.

### V-07 — P1 — Textes fonctionnels sous le seuil de lisibilité
- **Captures** : `01-menu.png`, `03-vague3.png`
- **Zones** :
  - menu : `ENTRÉE`, `SUCCÈS 0/18`, ligne technique bas-gauche, citation bas-droite ;
  - HUD : `VÊPRES`, `PISTOLET MLE 1935 | 9 MM`, `10 À PORTÉE / DEBOUT`, `N CHARGEURS`.
- **Constat** : 9–10 px, capitales très espacées (0,18 em), opacité 55–65 % sur fond étoilé ou
  texturé. Lisible à 1600×900 en crop natif, illisible en visionnage 1080p ou stream.
- **Impact** : toutes les informations secondaires mais utiles (phase de nuit, arme, munitions,
  progression) disparaissent en conditions réelles.
- **Correctif** : plancher à 11 px pour le fonctionnel, opacité ≥ 0,8 ; réserver le 9 px aux
  éléments purement décoratifs ; ajouter une ombre portée nette plutôt qu'un flou.

### V-08 — P2 — Inventaire : formats hétérogènes et bruit
- **Capture** : `03-vague3.png`
- **Zone** : bas-centre, ≈ x 520–1100.
- **Constat** : quatre écritures pour quatre calibres — `9 MM`, `CAL. 12`, `5,56`, `.308` ;
  titre `INVENTAIRE` tourné à 90° qui ralentit le balayage ; colonnes à zéro
  (`TROUSSES`, `CLÉS`, `LANTERNES`) affichées en permanence ; traits colorés sans légende.
- **Impact** : bruit visuel au centre bas, à l'endroit où le regard revient le plus souvent.
- **Correctif** : normaliser `9 mm · 12 · 5,56 · .308` ; titre horizontal 9 px ; masquer les
  objets à zéro sauf pendant 2 s après un changement ; une seule ligne de quatre calibres.

### V-09 — P2 — Icône son non identifiable
- **Capture** : `01-menu.png`
- **Zone** : haut-droite, petit carré sombre.
- **Constat** : glyphe d'environ 12 px dans un carré à peine plus grand, sans libellé ni infobulle.
  Le son est muet par défaut : c'est pourtant le seul moyen de l'activer.
- **Impact** : fonction obligatoire (cf. `AGENTS.md`) mais introuvable pour un nouveau joueur.
- **Correctif** : cible 36×36, icône 18 px, libellé `SON COUPÉ` au survol et au premier lancement,
  anneau de focus visible.

### V-10 — P2 — Objectif répétitif et pastille au bord
- **Capture** : `03-vague3.png`
- **Zone** : haut-droite.
- **Constat** : `OBJECTIF / TENIR JUSQU'À L'AUBE` répété en permanence, en petit, avec une pastille
  circulaire collée au bord droit de l'écran. Le libellé `OBJECTIF` n'apporte rien.
- **Impact** : encombre le coin sans aider ; la pastille risque d'être rognée selon le ratio.
- **Correctif** : `TENIR JUSQU'À L'AUBE` seul + icône, 11 px, marge droite ≥ 24 px.

### V-11 — P2 — Horloge sans progression vers l'aube
- **Capture** : `03-vague3.png`
- **Zone** : haut-centre.
- **Constat** : `23:21` très gros, filet, `VÊPRES` en 9 px. Aucune indication du temps restant
  avant 06:00, alors que c'est la condition de victoire.
- **Impact** : le joueur doit calculer mentalement 23:21 → 06:00 pour estimer sa progression.
- **Correctif** : `23:21 → 06:00` discret sous l'heure, ou arc de progression fin autour de
  l'horloge ; `VÊPRES` à 10 px.

### V-12 — À confirmer — Bandeau de lieu au centre de l'écran
- **Capture** : `03-vague3.png`
- **Zone** : centre, au-dessus de la porte de l'église.
- **Constat** : un bandeau de lieu et l'objectif semblent encore affichés en surimpression au centre
  pendant la vague, alors que l'horloge indique 23:21 et que le bandeau semble porter 22:00.
  Lecture faite sur image réduite : **fiabilité faible**, à vérifier en crop natif.
- **Impact si confirmé** : masque la nef et les ennemis dans l'axe de visée, et contredit l'horloge.
- **Correctif** : fondu après 2,5 s, position sous l'horloge, jamais dans le couloir de visée.

### V-13 — À confirmer — Citation du menu
- **Capture** : `01-menu.png`
- **Zone** : bas-droite.
- **Constat** : la citation semble contenir `Ils offert pour la nuit` (auxiliaire manquant).
  Texte très petit et peu contrasté : la lecture n'est pas fiable à cette résolution.
- **Correctif** : vérifier la chaîne dans le source, corriger la conjugaison, remonter le contraste.

---

## 3. Ce qui tient

- Palette os / encre / ambre cohérente entre menu et HUD ; le titre serif porte bien l'ambiance.
- HUD ancré sur trois coins, avec de l'air au centre : la structure générale est saine.
- Chiffres de munitions cohérents dans la capture : `07 / 84` et `7 CHARGEURS` correspondent bien
  à un chargeur de 12 (84 = 7 × 12).
- Radar : le principe d'un cadran orienté regard, avec nord mobile, est le bon modèle pour ce jeu.
- Aucun débordement ou élément coupé observé sur `01-menu` et `03-vague3`, hors pastille d'objectif
  à contrôler.

## 4. Captures non couvertes par cette passe

`05-boss.png` · `07-aube.png` · `08-perf.png` · `deep-chk-w3.png` · `deep-chk2-w3.png` · `t-radar.png`

À reprendre en priorité sur : lisibilité de la barre de boss, contraste du HUD à l'aube (fond clair),
densité du radar en vague 3, et lisibilité des compteurs de performance.

## 5. Ordre d'exécution conseillé

1. **V-01** et **V-02** : les deux seules informations qui font perdre une partie si elles sont mal lues.
2. **V-06** : correction d'une promesse fausse de l'interface (une ligne de code).
3. **V-04** : défaut le plus visible de la première impression.
4. **V-03**, **V-05**, **V-07** : cohérence et hiérarchie du HUD.
5. **V-08** à **V-11**, puis vérification de **V-12** / **V-13**.
