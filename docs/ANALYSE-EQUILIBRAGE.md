# Vigile v2 — Analyse d'équilibrage des parties profondes

**Corpus** : 9 rapports `tools/reports/deep-*.json` produits le 22/10/2026 entre 09:52 et 10:37
(`chk`, `chk2`, `chk3`, `chk4`, `chk5`, `chk6`, `chk7`, `dbg`, `smoke`).
889 s de jeu simulé, 126 morts, 27 enregistrements de vague, 0 coffre ouvert.
**Méthode** : lecture des JSON + calcul des séries (durées, PV, munitions, butin) croisé avec les
courbes réelles du code (`game.js` vagues/difficulté, `zombie.js` PV/vitesse/dégâts, `loot.js`
tables de butin et caches, `weapons.js` paliers et armes).
**Ce que ce rapport n'est pas** : une mesure des vagues V à XII ni du boss — aucune partie ne les
atteint (voir §0 et §1.3). Les chiffres de fin de nuit sont des **projections de modèle**, signalées
comme telles.

---

## 0. Préalable bloquant : la vague IV n'est pas difficile, elle est cassée

Les quatre parties qui atteignent la vague IV (`chk4`, `chk5`, `chk6`, `chk7`) sont **les seules** à
produire des exceptions, et elles en produisent beaucoup :

| partie | vagues atteintes | exceptions `TypeError: … reading 'matrixWorld'` | morts en V4 | dégâts en V4 |
|---|---|---|---|---|
| `chk4` | IV | 644 | 0 / 11 | 120 en 16,6 s |
| `chk5` | IV | 481 | 0 / 11 | 120 en 12,7 s |
| `chk6` | IV | 260 | 0 / 11 | 120 en 11,7 s |
| `chk7` | IV | 5 258 | 0 / 11 | 0 en 80,1 s |
| les 5 autres | I–III | **0** | — | — |

Corrélation parfaite : **la vague IV est la première à contenir des zélateurs**
(`WAVE_PLANS[3] = La procession`, 30 % de zélateurs), et le zélateur est le seul ennemi qui
manipule des `THREE.Sprite` (le halo du brûle-parfum, `zombie.js:447`, et celui de la flamme noire,
`zombie.js:469`).

Chaîne exacte :

1. `zombie.js:447-453` — un `Sprite` (halo) est ajouté au `censer`, lui-même ajouté au `group`.
2. Le `group` est le `hitRoot` que la visée parcourt en récursif (`player.js:705`,
   `rc.intersectObjects(targets, true)`).
3. `player.js:703` crée un `Raycaster` **sans `rc.camera`** ; `Sprite.raycast` de three exige une
   caméra et une `matrixWorld` valide → `THREE.Sprite: "Raycaster.camera" needs to be set` puis
   `TypeError` à chaque frame où un zélateur est visé (jusqu'à **71 exceptions/s** sur `chk7`).
4. L'exception interrompt `fire()` / `debugRay()` : le joueur ne peut plus toucher un zélateur.
   Preuve : `diag.byType.zealot = 0` dans **9 parties sur 9**, alors que **3 zélateurs** sont
   présents à chaque tentative de vague IV.

**Conséquence** : ces 4 parties mesurent un plantage, pas un mur de difficulté. Toute conclusion
« la vague IV est trop dure » serait fausse.

**État au moment de l'analyse** : `rc.camera = camera` a été ajouté à `debugRay()` (`player.js:704`)
à 10 h 41, **après** la production des 9 rapports (09 h 52 – 10 h 37). Le `TypeError` doit donc avoir
disparu de l'arbre de travail ; il reste à neutraliser le `raycast` des halos (qui continuera à
polluer la console d'un avertissement par frame) et surtout à **rejouer une nuit** pour vérifier que
la vague IV redevient mesurable. Correctifs :

```js
// zombie.js:447 et :469
halo.raycast = () => {};      // même traitement que shadow.raycast (zombie.js:336)
// player.js:703
rc.camera = camera;             // debugRay
```

Tant que ce correctif n'est pas appliqué, **les vagues IV+ ne sont pas mesurables** et les parties
`chk4..chk7` doivent être écartées de toute statistique de difficulté. Les dégâts qu'elles
enregistrent restent, eux, valides (les flammes noires touchent, c'est le tir de riposte qui casse).

---

## 1. Corpus et limites de lecture

### 1.1 Les neuf parties

| partie | skill/aimHead | nuit (s) | wall (s) | vague | morts | dégâts | précision | butin | coffres | exceptions | issue |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `chk` | 0.85/0.85 | 120 | 121 | 3 | 12 | 0 | 75 % | 14 | 0 | 0 | victoire |
| `chk2` | 0.85/0.85 | 180 | 182 | 3 | 14 | 240 | 97 % | 12 | 0 | 0 | mort |
| `chk3` | 0.85/0.85 | 300 | 91 | 2 | 10 | 116 | 83 % | 5 | 0 | 0 | mort |
| `chk4` | 0.85/0.85 | 150 | 81 | 4 | 21 | 141 | 80 % | 0 | 0 | 644 | mort |
| `chk5` | 0.85/0.85 | 150 | 81 | 4 | 21 | 237 | 76 % | 15 | 0 | 481 | mort |
| `chk6` | 0.85/0.85 | 95 | 81 | 4 | 21 | 281 | 73 % | 12 | 0 | 260 | mort |
| `chk7` | 0.85/0.85 | 140 | 147 | 4 | 21 | 0 | 85 % | 0 | 0 | 5258 | victoire |
| `dbg` | 0.9/0.95 | 60 | 60 | 2 | 5 | 0 | 73 % | 1 | 0 | 0 | victoire |
| `smoke` | 0.9/0.95 | 45 | 45 | 1 | 1 | 0 | 5 % | 0 | 0 | 0 | victoire |

Lecture immédiate : **trois victoires sur neuf sont des victoires par Minuit** (`chk` 120 s,
`dbg` 60 s, `smoke` 45 s, `chk7` 140 s) — l'aube se lève avant que la partie ait un enjeu.
La seule victoire « propre » à 100 PV est aussi la plus courte.

### 1.2 Paramétrage réel des tests

`deeptest.mjs` accepte `--night=` et le passe en `?night=`, qui écrase `state.nightDur` (`game.js:992`)
alors que la valeur de production est **480 s** (`game.js:1090`). Les 9 parties tournent donc sur des
nuits de **45 à 300 s**, soit 9 % à 62 % d'une vraie nuit. Aucune ne couvre la seconde moitié du
contenu (plans 5 à 12, boss, `PLAN_AFTER`).

### 1.3 Ce que le bot n'a jamais fait

- **Aucun boss** : `bossesKilled = 0` partout, et `n % 5 === 0` place le premier boss en **vague 5**,
  jamais atteinte.
- **Aucun coffre** : `caches = 0` sur 9 parties / 27 vagues, alors que 12 caches sont posés au
  chargement (8 caisses + 4 coffres).
- **Aucune tombe brisée** : `graves = {alive: 53, broken: 0}` partout → la mécanique de « dette de
  tombe » (`state.graveDebt`, qui réduit `pending` à la vague suivante) n'est jamais exercée.
- **Aucun zélateur tué** (§0), et **aucune arme ramassée au sol** : le revolver qui apparaît dans les
  échantillons dès la vague I vient de la **carte de bénédiction** garantie (`game.js:434`), pas d'un
  drop.

---

## 2. Mesures

### 2.1 Durée et cadence des vagues

| partie | V | plan réel | durée (s) | morts | PV perdus | butin | Δmun (net) | vivants fin |
|---|---|---|---|---|---|---|---|---|
| `chk` | 1 | Les errants | 48.1 | 5 | 0 | 5 | 0 | 0 |
| `chk` | 2 | La meute | 45.4 | 7 | 0 | 9 | 0 | 0 |
| `chk` | 3 | L'ossuaire | 21.5 | 0 | 0 | 0 | 0 | 9 *(tronquée)* |
| `chk2` | 1 | Les errants | 90.1 | 5 | 28 | 2 | 0 | 0 |
| `chk2` | 2 | La meute | 41.8 | 7 | 11 | 8 | 0 | 0 |
| `chk2` | 3 | L'ossuaire | 42.8 | 2 | 61 | 2 | 0 | 7 *(tronquée)* |
| `chk3` | 1 | Les errants | 44.9 | 5 | 0 | 2 | 0 | 0 |
| `chk3` | 2 | La meute | 38.4 | 5 | 100 | 3 | 0 | 2 *(tronquée)* |
| `chk4` | 1 | Les errants | 15.3 | 5 | 0 | 0 | 0 | 0 |
| `chk4` | 2 | La meute | 19.4 | 7 | 0 | 0 | 0 | 0 |
| `chk4` | 3 | L'ossuaire | 23.1 | 9 | 0 | 0 | 30 | 0 |
| `chk4` | 4 | La procession | 16.6 | 0 | 120 | 0 | 0 | 11 *(tronquée)* |
| `chk5` | 1 | Les errants | 15.2 | 5 | 0 | 0 | 0 | 0 |
| `chk5` | 2 | La meute | 19.5 | 7 | 0 | 2 | 0 | 0 |
| `chk5` | 3 | L'ossuaire | 24.8 | 9 | 0 | 12 | 0 | 0 |
| `chk5` | 4 | La procession | 12.7 | 0 | 120 | 1 | 0 | 11 *(tronquée)* |
| `chk6` | 1 | Les errants | 15.2 | 5 | 0 | 0 | 0 | 0 |
| `chk6` | 2 | La meute | 22.2 | 7 | 0 | 2 | 0 | 0 |
| `chk6` | 3 | L'ossuaire | 21.7 | 9 | 0 | 10 | 0 | 0 |
| `chk6` | 4 | La procession | 11.7 | 0 | 120 | 0 | 6 | 11 *(tronquée)* |
| `chk7` | 1 | Les errants | 14 | 5 | 0 | 0 | 0 | 0 |
| `chk7` | 2 | La meute | 16.8 | 7 | 0 | 0 | 0 | 0 |
| `chk7` | 3 | L'ossuaire | 24.4 | 9 | 0 | 0 | 39 | 0 |
| `chk7` | 4 | La procession | 80.1 | 0 | 0 | 0 | 0 | 11 *(tronquée)* |
| `dbg` | 1 | Les errants | 48 | 5 | 0 | 1 | 0 | 0 |
| `dbg` | 2 | La meute | 6.4 | 0 | 0 | 0 | 0 | 7 *(tronquée)* |
| `smoke` | 1 | Les errants | 39 | 1 | 0 | 0 | 84 | 4 *(tronquée)* |

Agrégats (27 vagues enregistrées, 18 terminées) :

| indicateur | valeur |
|---|---|
| vague I — durée médiane | **39,0 s** (min 14,0 ; max 90,1 ; n = 9) |
| vague II — durée médiane | 20,9 s (n = 8) |
| vague III — durée médiane | 23,8 s (n = 6) |
| vagues terminées (vivants = 0) — durée médiane | **22,7 s** (moyenne 30,6 ; n = 18) |
| cadence globale | **8,5 morts/min** (126 morts / 889 s) |
| cartouches par mort | **1,95** (médiane ; `smoke` exclu : 84) |
| butin ramassé par mort | 0,0 à 1,3 selon la partie |

Deux régimes coexistent, pour **la même vague I de 5 marcheurs** :

- **14,0 à 15,3 s** (`chk4`, `chk5`, `chk6`, `chk7`) quand le bot avance vers la couronne d'apparition ;
- **39,0 à 90,1 s** (`chk`, `chk2`, `chk3`, `dbg`, `smoke`) quand il attend.

Ce n'est donc pas la létalité qui pilote la durée, c'est **le temps de trajet**. La couronne
d'apparition est à `r = 34 + (i % 3) × 4` m, soit 34 à 42 m (`graveyard.js:403`), et un marcheur va à
**1,95 m/s** (`zombie.js:24`) → **17,4 à 21,5 s** avant le premier contact, à quoi s'ajoute
l'émergence. Mesure directe : le premier mort tombe **4 s** après le début de la vague I quand le bot
va au-devant, **14 à 16 s** en vague II, **36 s** en vague III sur `chk2`.

### 2.2 Temps mort

| partie | plus long palier sans mort (ennemis vivants) | échantillons sans ennemi vivant | PV min | dégâts/s subis |
|---|---|---|---|---|
| `chk` | 26 s (t=10→36) | 14 % | 100 | 0,00 |
| `chk2` | **72 s** (t=10→82) | 9 % | 43 | 1,32 |
| `chk3` | 28 s (t=10→38) | 12 % | 3 | 1,27 |
| `chk4` | 16 s (t=62→78) | 32 % | 1 | 1,74 |
| `chk5` | 12 s (t=64→76) | 33 % | 50 | 2,93 |
| `chk6` | 10 s (t=64→74) | 34 % | 46 | 3,47 |
| `chk7` | **80 s** (t=59→139) | 18 % | 100 | 0,00 |
| `dbg` | 28 s (t=10→38) | 15 % | 100 | 0,00 |
| `smoke` | 34 s (t=10→44) | 0 % | 100 | 0,00 |

Deux causes distinctes, toutes deux structurelles :

1. **L'attente** (vagues I–III, `chk2` 72 s) : les morts marchent 30 à 40 s vers un joueur immobile.
   Aucun mécanisme ne les rapproche, et la vague ne se termine que quand **tous** sont morts.
2. **Le blocage de ligne de tir** (vague IV) : 11 ennemis vivants, 0 coup de feu pendant 11,7 à
   80,1 s (`chk4..chk7`). Ici c'est le bug du §0, doublé d'un fait de design : rien n'oblige un
   zélateur qui garde 11 m (`keep: 11`) à venir au contact.

### 2.3 Courbe de PV et dégâts subis

| partie | PV min | temps sous 50 PV | dégâts totaux | profil |
|---|---|---|---|---|
| `chk` | 100 | 0 s | 0 | intouché |
| `dbg` | 100 | 0 s | 0 | intouché |
| `smoke` | 100 | 0 s | 0 | intouché (mais à sec) |
| `chk7` | 100 | 0 s | 0 | intouché (standoff) |
| `chk3` | 3 | 6 s | 116 | chute brutale en V2 |
| `chk5` | 50 | 0 s | 237 | 2 chutes de 43 et 27 PV en 2 s |
| `chk4` | 1 | 2 s | 141 | 120 → 54 → 1 PV en 4 s |
| `chk2` | 43 | 2 s | 240 | mort en V3 après 05:59 de nuit |
| `chk6` | 46 | 0 s | 281 | 3 vagues propres puis 281 PV en 13 s |

La courbe de PV n'est **jamais une pente** : c'est une série de **marches de 40 à 77 PV en 2 s**.
Autrement dit le jeu ne blesse pas progressivement, il exécute. Sur `chk4` : 120 → 54 → 1 PV en
4 secondes (29,7 DPS, soit l'équivalent de 2,5 marcheurs qui frappent en continu), avec 11 cadavres
vivants autour de lui. Aucune fenêtre d'invulnérabilité n'existe
(`player.js:562-576`, `hurt()` applique les dégâts sans temporisation).

### 2.4 Munitions

Le champ `waves[].ammoSpent` est un **delta net** (`bot.js:392` : `totalAmmo0 - totalAmmo`) : il
inclut les cartouches ramassées, d'où **0 sur 20 vagues** alors que 20 à 45 coups ont été tirés. Il
faut donc lire `diag.stats.shots`.

| partie | tirs | touches | têtes | morts | cartouches/mort | réserve à la fin |
|---|---|---|---|---|---|---|
| `chk` | 20 | 15 | 14 | 12 | 1,67 | **141** (départ 72) |
| `chk2` | 30 | 29 | 8 | 14 | 2,14 | 0 |
| `chk3` | 18 | 15 | 14 | 10 | 1,80 | 133 |
| `chk4` | 41 | 33 | 29 | 21 | 1,95 | 52 |
| `chk5` | 41 | 31 | 29 | 21 | 1,95 | **122** |
| `chk6` | 45 | 33 | 31 | 21 | 2,14 | 103 |
| `chk7` | 40 | 34 | 29 | 21 | 1,90 | 52 |
| `dbg` | 11 | 8 | 7 | 5 | 2,20 | 91 |
| `smoke` | 84 | 4 | 3 | 1 | **84,0** | 0 |

Trois faits :

1. **1,95 cartouche par mort** pour un bot qui vise la tête (92,6 % des morts sont des tirs à la
   tête : 151 têtes / 163 morts, `outcomes`). Un joueur corps-à-corps consomme 4 à 6× plus.
2. **La réserve monte pendant qu'on tue** : 72 → 141 sur `chk` (+5,75/mort), 72 → 122 sur `chk5`.
   Le surplus est donc de l'ordre de **5×** en début de nuit.
3. **Le seul cas d'assèchement est une catastrophe de visée** (`smoke` : 5 % de précision, 84
   cartouches pour un mort, à sec à t = 34 s). L'économie n'est donc pas calibrée pour un joueur
   maladroit : elle est calibrée pour un joueur qui ne rate pas, et elle le noie.

### 2.5 Butin ramassé

| partie | butin | morts | butin/mort |
|---|---|---|---|
| `chk` | 14 | 12 | 1,17 |
| `chk5` | 15 | 21 | 0,71 |
| `chk2` | 12 | 14 | 0,86 |
| `chk6` | 12 | 21 | 0,57 |
| `chk3` | 5 | 10 | 0,50 |
| `dbg` | 1 | 5 | 0,20 |
| `chk4` | **0** | 21 | 0,00 |
| `chk7` | **0** | 21 | 0,00 |

Le taux de chute simulé est de **0,69 boîte de munitions + 0,112 trousse + 0,065 fiole + 0,047 clé
par mort** (§3.5). Sur 21 morts, cela fait ~15 objets au sol : `chk4` et `chk7` n'en ramassent
**aucun**. Ce n'est pas une pénurie de butin, c'est un **ramassage raté** : le bot ne va chercher un
objet que s'il n'a aucune cible et dans un rayon de 16 m (`bot.js:273`, `nearestLoot`), et il ne
revient jamais en arrière. Le compteur `butin` mesure donc la mobilité du joueur, pas la générosité
du jeu.

### 2.6 Coffres

**0 coffre ouvert sur 9 parties.** Trois raisons cumulées :

- 12 caches fixes posées entre **18,6 et 38,9 m** du centre de la nef (`loot.js:594-598`), médiane
  28 m — soit un détour complet pendant une vague ;
- ouverture automatique dans un rayon de **1,85 m** seulement (`AUTO_CACHE`, `loot.js:611`) ;
- le bot ne cible un cache que s'il **possède déjà une clé** (`bot.js:344-352`), donc les 8 caisses
  non verrouillées ne sont jamais approchées non plus.

Les 4 coffres exigent une clé (`locked: true`), et la clé tombe à **4,4 % par mort** : ~1 clé par
23 morts, soit ~1 clé par nuit pour un joueur qui tue 21 ennemis sur les 4 premières vagues. La
boucle « tuer → clé → coffre » existe donc, mais elle est **hors de portée de la boucle de jeu** :
il faut traverser 25 m pour l'utiliser.

---

## 3. Ce que produit le code (modèle)

### 3.1 Tailles, composition et pool de PV (valeurs actuelles, `waveSize`/`difficulty`)

`waveSize(n) = clamp(round(clamp(round(5 + 1,6·(n−1)), 1, 32) × plan.size), 1, 40)`
`difficulty(n) = clamp(1 + 0,085·(n−1), 1, 3,2)` → HP × `diff^1,25`, dégâts × `diff^0,9`,
vitesse × `diff^0,35` (plafond ×1,6).

| V | plan | taille | composition | cadence spawn | diff. | ×HP | pool PV | PV/ennemi moy. | spawn mini (s) |
|---|---|---|---|---|---|---|---|---|---|
| I | Les errants | 5 | 5 marcheurs | 0,55 | 1,000 | 1,00 | **525** | 105 | 2,8 |
| II | La meute | 7 | 4 coureurs, 3 marcheurs | 0,55 | 1,085 | 1,11 | 623 | 89 | 3,9 |
| III | L'ossuaire | 9 | 7 marcheurs, **2 colosses** | 0,55 | 1,170 | 1,22 | **1 722** | 191 | 5,0 |
| IV | La procession | 11 | 8 marcheurs, 3 zélateurs | 0,55 | 1,255 | 1,33 | 1 451 | 132 | 6,1 |
| V | La horde | 15 | 13 marcheurs, 2 coureurs | 0,42 | 1,340 | 1,44 | 2 147 | 143 | 6,3 |
| VI | L'Officiant | 10 | 5 m., 3 c., 3 z. | 0,55 | 1,425 | 1,56 | 1 499 (+ boss 3 420) | 150 | 5,5 |
| VII | La traque | 17 | 9 c., 4 z., 4 m. | 0,40 | 1,510 | 1,67 | 2 199 | 129 | 6,8 |
| VIII | Le siège | 18 | 8 m., 5 z., **4 colosses** | 0,55 | 1,595 | 1,79 | **4 696** | 261 | 9,9 |
| IX | L'office noir | 22 | 8 m., 6 c., 3 col., 6 z. | 0,55 | 1,680 | 1,91 | 5 233 | 238 | 12,1 |
| X | La marée | **29** | 15 m., 15 c. | 0,34 | 1,765 | 2,03 | 5 096 | 176 | 9,9 |
| XI | Le chevalet | 25 | **8 colosses**, 6 z., 12 c. | 0,34 | 1,850 | 2,16 | **8 561** | 342 | 8,5 |
| XII | La dernière veille | **33** | 10 m., 10 c., 7 col., 7 z. | 0,32 | 1,935 | 2,28 | **10 585** | 321 | 10,6 |

Trois défauts de courbe, visibles sans modèle :

1. **Marche de la vague III** : le pool fait **×2,8** entre II et III (623 → 1 722) parce que
   `L'ossuaire` introduit 2 colosses à 340 PV. C'est le premier mur du jeu, et il tombe à 1 min 30.
2. **Non-monotonie** : V3 (1 722) > V4 (1 451) ; V10 (5 096) < V9 (5 233) ; et la taille fait
   **29 → 25** entre X et XI. Le joueur reçoit moins d'ennemis après en avoir reçu plus.
3. **Explosion finale** : ×1,65 entre X et XI puis ×1,24 entre XI et XII, alors que le pool total de
   la nuit est déjà de 44 338 PV. Sur 480 s, cela impose **369 PV d'ennemis à abattre par seconde**
   pour boucler les 12 vagues.

### 3.2 Coups pour tuer (corps / tête, à 16 m) — `damage`, `headMul`, `falloff`

| arme | cible | V1 | V3 | V5 | V8 | V12 |
|---|---|---|---|---|---|---|
| Pistolet (30) | marcheur | 4/2 | 5/2 | 6/2 | 7/3 | **8/4** |
| Pistolet | colosse | 12/5 | 14/6 | 17/7 | 21/8 | 26/10 |
| Revolver (62) | marcheur | 2/1 | 3/1 | 3/2 | 4/2 | 4/2 |
| Revolver | colosse | 6/3 | 7/3 | 8/4 | 10/5 | 13/6 |
| Fusil à pompe (8×11) | marcheur | 5/3 | 6/4 | 7/4 | 8/5 | 10/6 |
| PM (16) | marcheur | 8/4 | 10/5 | 11/5 | 14/7 | 18/8 |
| Fusil d'assaut (24) | marcheur | 5/2 | 6/3 | 7/3 | 8/4 | 10/4 |
| Carabine (105) | marcheur | 1/1 | 2/1 | 2/1 | 2/1 | 3/1 |
| Carabine | colosse | 4/2 | 4/2 | 5/2 | 6/3 | 8/3 |

Lecture : avec les armes de palier 1–2 (disponibles jusqu'à la vague VI, `maxWeaponTier`), un
marcheur passe de **2 tirs à la tête** en V1 à **4** en V12, et un colosse de **5** à **10**. Le
pistolet devient une arme à 8 balles par marcheur. La seule arme qui garde un temps de tuer constant
est la carabine — de palier 4, donc réservée à la vague IX et au-delà.

### 3.3 Dégâts de contact (aucune invulnérabilité)

Le cycle d'attaque n'est pas `ATTACK_TIME` mais **`atkCd`**, qui lui est supérieur et court en
parallèle (`zombie.js:688`, `:852`) : 1,5 s pour le marcheur, 1,9 s pour le coureur, 2,4 s pour le
colosse ; le zélateur, lui, tire une flamme toutes les 2,0 à 3,2 s (`:841`).

| type | dégâts | cycle réel | DPS V1 | DPS V5 | DPS V12 | mort du joueur, V1 100 PV : 1 / 2 / 3 / 5 contacts | V12, 120 PV : 3 / 5 / 6 contacts |
|---|---|---|---|---|---|---|---|
| marcheur | 18 | 1,5 s | 12,0 | 15,6 | 21,7 | 8,3 / 4,2 / **2,8** / 1,7 s | 1,8 / 1,1 / 0,9 s |
| coureur | 10 | 1,9 s | 5,3 | 6,9 | 9,5 | 19,0 / 9,5 / 6,3 / 3,8 s | 4,2 / 2,5 / 2,1 s |
| zélateur (flamme) | 12 | 2,0–3,2 s | 4,6 | 6,0 | 8,4 | 21,7 / 10,8 / 7,2 / 4,3 s | 4,8 / 2,9 / 2,4 s |
| colosse | 34 | 2,4 s | 14,2 | 18,5 | 25,7 | 7,0 / 3,5 / 2,3 / 1,4 s | 1,6 / 0,9 / 0,8 s |

Le mur n'est donc pas l'unité, c'est **la foule** : un marcheur seul laisse 8,3 s de sursis, mais
**trois** en tuent 2,8 s et **cinq** en 1,7 s dès la vague I ; à la vague XII, cinq marcheurs tuent en
1,1 s. Or les vagues VIII à XII en alignent 17 à 33, avec `maxAlive` à 24–28 (`game.js:348`) : les
six derniers assauts sont des mêlées, et il n'existe **aucune fenêtre d'invulnérabilité**
(`player.js:562-576`). Le soin, lui, est confortable (8 PV par vague + 45 PV par trousse, soit
**189 PV de soin sur la vague XII**, 1,9 barre de vie) — il ne sert à rien contre des rafales de
40 à 77 PV en 2 s. Le problème est la **simultanéité des coups**, pas le soin.

### 3.4 Économie des munitions : offre contre demande

Fourniture simulée par type de mort (10 000 tirages sur les tables réelles de `rollDrops`) :
**9,2 unités** par marcheur, 8,8 par coureur, 9,4 par zélateur, **22,0** par colosse (1,45 boîte,
dont la moitié en 5,56). Demande calculée pour un pistolet/revolver à 70 % de tirs à la tête et 85 %
de précision.

| V | hôtes | munitions fournies | besoin (pistolet) | **ratio** | besoin (revolver) | ratio |
|---|---|---|---|---|---|---|
| I | 5 | 46 | 15 | **3,14** | 7 | 6,18 |
| III | 9 | 108 | 48 | 2,26 | 24 | 4,44 |
| V | 15 | 137 | 60 | 2,29 | 30 | 4,51 |
| VIII | 18 | 209 | 131 | 1,59 | 67 | 3,13 |
| XI | 25 | 338 | 239 | **1,41** | 121 | 2,78 |
| XII | 33 | 400 | 295 | **1,35** | 150 | 2,66 |

Le rapport **s'inverse** au fil de la nuit : 3,1 en V1, 1,35 en V12. Le jeu noie le joueur quand il
n'a pas besoin de munitions et le serre quand il en a besoin — l'inverse d'une courbe lisible. Les
mesures du §2.4 confirment le haut de la courbe (réserve qui monte de 70 cartouches en 12 morts) ; le
bas de la courbe est une projection, non mesurée faute de parties au-delà de la vague IV.

### 3.5 Butin par mort (tables actuelles, 40 000 tirages)

| mort | munitions | boîtes | trousses | fioles | clés | cadavre vide |
|---|---|---|---|---|---|---|
| marcheur | 9,2 u | 0,71 | 0,112 | 0,065 | 0,047 | 11 % |
| coureur | 8,8 u | 0,69 | 0,116 | 0,067 | 0,052 | 11 % |
| zélateur | 9,4 u | 0,70 | 0,118 | 0,071 | 0,046 | 11 % |
| colosse | 22,0 u | 1,45 | 0,220 | 0,180 | 0,000 | 0 % |

Détail de composition d'un marcheur, en V1 : 0,402 boîte de 9 mm, **0,186 boîte de 5,56**,
0,097 de calibre 12, **0,008 de .308**, 0,124 trousse, 0,061 fiole, 0,046 clé, 0,027 lanterne.

Or en V1 le palier d'arme maximal est 1 (`maxWeaponTier`), donc les armes 5,56 et .308 sont
**inaccessibles** : **19,4 % des objets lâchés en début de nuit sont inutilisables** (5,56 + .308),
et le restent jusqu'à la vague VII. C'est du butin qui ne sert qu'à encombrer le sol.

### 3.6 Coffres : variété réelle (20 000 tirages sur `rollCache`)

| cachet | poids | arme | pièces moy. | contenu type |
|---|---|---|---|---|
| Armurerie | 24 | 55 % | 2,9 + arme | munitions 12 / 5,56 / 9 / .308 |
| Réserve de soins | 20 | 5 % | 4,4 | trousse, fiole, lanterne |
| Sacristie | 19 | 12 % | 4,4 | **clé** (34 %), lanterne, fiole |
| Reliquaire | 17 | 38 % | 4,4 | .308, fiole, clé |
| Butin de pillage | 20 | 9 % | 4,4 | 9 mm, 12, 5,56, trousse |

Chiffres qui démentent l'intention du commentaire de `loot.js:97-102` :

- **4,38 pièces par coffre** en moyenne (min 3, max 7) ;
- **81,6 % des coffres contiennent au moins un doublon** du même objet ;
- **53 % des pièces sont des consommables** (trousse 0,71, fiole 0,66, lanterne 0,45, clé 0,50) ;
- seulement **0,24 arme par coffre** (5,5 % des pièces) ;
- et 8 types d'objets au total, dont 4 consommables : les cinq « cachets » ne changent que des
  probabilités sur le même petit sac.

Les caisses (8 sur 12 caches) sont plus modestes : 1,87 pièce, 10 % d'arme, 0,49 boîte de 9 mm.

---

## 4. Diagnostic — sept constats chiffrés

1. **La vague IV n'est pas jouable** : bug de raycast sur les `Sprite` des zélateurs, 260 à 5 258
   exceptions par partie, **0 zélateur tué sur 9 parties**. Ce n'est pas de l'équilibrage, c'est un
   plantage par frame (§0).
2. **Le rythme est dicté par la distance, pas par le combat** : 34–42 m à 1,95 m/s = **17 à 21 s**
   d'approche, pour des vagues de 5 à 9 ennemis ; d'où une vague I à **39 s de médiane** et un
   palier de **72 s sans un seul mort** (`chk2`).
3. **La mort est binaire** : 3 marcheurs au contact = **2,8 s** de survie en V1, **5** marcheurs =
   **1,7 s** (1,1 s en V12), sans invulnérabilité et avec `maxAlive` à 24–28 en fin de nuit. Aucune
   courbe de PV, seulement des marches de 40 à 77 PV en 2 s (`chk4` : 120 → 54 → 1 PV en 4 s).
4. **Les munitions sont sur-dotées au début et justes à la fin** : ratio offre/demande **3,14 → 1,35**,
   réserve qui **monte de 72 à 141** en 12 morts, alors que le besoin réel mesuré est de **1,95
   cartouche par mort**.
5. **Le butin tiré ne correspond pas au palier du joueur** : **19,4 %** des objets lâchés en V1 sont
   des munitions pour des armes qui n'existent pas encore (5,56, .308), et le palier 3 n'arrive
   qu'en V7.
6. **La courbe des vagues est en dents de scie** : ×2,8 entre II et III (623 → 1 722 PV), puis
   V3 > V4, V10 < V9, et une taille qui **baisse** de 29 à 25 entre X et XI.
7. **Les coffres sont un contenu mort** : 0 ouverture sur 9 parties, 53 % de consommables, **81,6 %
   de doublons** internes, 0,24 arme par coffre, et une clé toutes les ~23 morts pour un coffre situé
   à 25 m du combat.

---

## 5. Recommandations chiffrées

### 5.0 Préalable (bloquant, avant toute autre mesure)

| # | Fichier | Actuel | Proposé |
|---|---|---|---|
| 0.1 | `zombie.js:447`, `zombie.js:469` | `Sprite` sans `raycast` neutralisé | `halo.raycast = () => {}` (supprime l'avertissement par frame) |
| 0.2 | `player.js:703` | `new THREE.Raycaster(...)` sans caméra | `rc.camera = camera` — **appliqué le 22/10 à 10 h 41**, à revalider |
| 0.3 | `bot.js:392` | `ammoSpent` = delta net | `shots` cumulés + `magDelta` |

Sans 0.1/0.2, les vagues IV+ restent non mesurables et les propositions ci-dessous ne pourront pas
être validées.

### 5.1 Taille, composition et cadence des vagues

| paramètre | fichier | actuel | proposé | effet attendu |
|---|---|---|---|---|
| rayon d'apparition | `graveyard.js:403` | `34 + (i%3)*4` → 34–42 m | `24 + (i%3)*3` → **24–30 m** | contact en **10,4–13,0 s** au lieu de 17,4–21,5 |
| nb de points d'apparition | `graveyard.js:401` | 12 | **16** | moins d'empilement sur les vagues à 29 ennemis |
| vitesse du marcheur | `zombie.js:24` | 1,95 m/s | **2,3 m/s** | −15 % de trajet, laisse le fusil à pompe jouable |
| intervalle d'apparition V1–IX | `game.js:643` | 0,55 s | **0,45 s** | vague I : 6 ennemis en 2,7 s au lieu de 5 en 2,8 |
| intermission | `game.js:364` | 7,5 s (9 s après V12) | **5,0 s** (6,5 s après V12) | **−27 s** de temps mort sur la nuit |
| taille V1 | `WAVE_PLANS[0].size` | 1,0 (5 hôtes) | **1,2** (6 hôtes) | la V1 doit apprendre, pas attendre |
| taille V3 | `WAVE_PLANS[2]` | 1,15 + 22 % colosses (9) | **1,05 + 10 % colosses** (8) | pool 1 722 → **1 308** (−24 %) |
| taille V4 | `WAVE_PLANS[3].size` | 1,05 (11) | **1,15** (12) | 1 451 → **1 562** |
| taille V5 | `WAVE_PLANS[4]` | 1,4 (15), spawn 0,42 | **1,25** (14), spawn 0,38 | 2 147 → **1 995** |
| taille V8 | `WAVE_PLANS[7]` | 1,15 + 24 % colosses (18) | **1,05 + 16 %** (17) | 4 696 → **3 854** (−18 %) |
| taille V10 | `WAVE_PLANS[9].size` | 1,5 (**29**) | **1,3** (25) | 5 096 → **4 417**, et la taille redevient croissante |
| taille V11 | `WAVE_PLANS[10]` | 1,2 + **30 % colosses** (25) | **1,05 + 18 %** (22) | 8 561 → **5 674** (−34 %) |
| taille V12 | `WAVE_PLANS[11].size` | 1,45 (**33**) | **1,25** (29) | 10 585 → **7 924** (−25 %) |
| quota de colosses **par vague** | `game.js:516-519` | illimité dans le mix (jusqu'à 8) | **2 jusqu'à V8, 4 ensuite** (le surplus devient marcheur/coureur) | retire jusqu'à 3 100 PV à la V12 |

Courbe de pool résultante (V1→V12) : **630, 740, 1 308, 1 562, 1 995, 1 499 (boss), 2 199, 3 854,
4 303, 4 417, 5 674, 7 924** — soit 36 106 PV au lieu de 44 338 (**−19 %**) avec 188 hôtes au lieu de
201. Les trois marches restantes sont les **introductions de type** — II→III ×1,77 (colosse), VI→VII
×1,47 (coureur + zélateur), VII→VIII ×1,75 (colosse + zélateur) : elles sont voulues. Une marche est
acceptable si elle est **annoncée** (nom de plan + composition à l'écran) et si elle reste **unique
dans la vague** ; le défaut actuel n'est pas la marche, c'est qu'elle se produisait deux fois (V3
puis V8) sans que le joueur ait de quoi y répondre (palier d'arme 2 jusqu'en V6).

Budget de nuit visé : 480 s = **425 s de combat + 55 s d'intermissions**, soit **35 s par vague**. La
V1 doit tenir en 18–22 s (10–13 s de contact + 6–8 s de nettoyage) : c'est exactement ce que donnent
une couronne à 24–30 m et une intermission à 5 s.

### 5.2 Courbe de difficulté

| paramètre | fichier | actuel | proposé | justification |
|---|---|---|---|---|
| pente de difficulté | `game.js:335` | `1 + 0,085(n−1)`, plafond 3,2 | **`1 + 0,072(n−1)`**, plafond **2,8** | V12 : 1,935 → **1,79** ; le plafond tombe en V26 au lieu de V27 |
| exposant des PV | `zombie.js:351` | `diff^1,25` | **`diff^1,12`** | combiné à la nouvelle pente, V12 : ×2,28 → **×1,92** (marcheur 202 PV au lieu de 239) |
| exposant des dégâts | `zombie.js:354` | `diff^0,9` | **`diff^0,75`** | V12 : ×1,81 → **×1,55** |
| PV du colosse | `zombie.js:26` | 340 | **300** | un colosse = 2,9 marcheurs au lieu de 3,2 |
| palier d'arme | `weapons.js:139-145` | V≤3→1, V≤6→2, V≤8→3, sinon 4 | **V≤2→2, V≤4→3, V≤6→4** | le joueur doit avoir le palier 3 quand les PV doublent, pas 5 vagues après |
| cadence du boss | `game.js:359` | `n % 5 === 0` → V5, V10, V15 | **aligner sur le plan** : V6, V11, V16 (`plan.boss`) | le plan « L'Officiant » est en position 6 : le boss arrive une vague après son annonce |
| PV du boss | `boss.js:11` | 2 400 × diff | **1 800 × diff** | V6 : 3 420 → **2 448**, soit 1,6 vague au lieu de 2,3 |
| caches du boss | `game.js:590-595` | `wave: 6` codé en dur | **`wave: state.wave`** | aujourd'hui un coffre de V11 est tiré avec le palier de la V6 (armes ≤ palier 2) |

**Ne pas toucher à l'exponentielle des dégâts pour régler la mortalité.** Le §3.3 montre que le
problème est la simultanéité, pas le multiplicateur : trois marcheurs tuent en 2,8 s dès la V1 (où le
multiplicateur vaut 1,0), et cinq en 1,7 s. Les deux leviers efficaces sont ci-dessous.

### 5.3 Survie — le vrai levier de difficulté

| paramètre | fichier | actuel | proposé | effet |
|---|---|---|---|---|
| dégâts marcheur | `zombie.js:24` | 18 (cycle 1,5 s = 12,0 DPS) | **14** (9,3 DPS) | −22 % |
| dégâts colosse | `zombie.js:26` | 34 (cycle 2,4 s = 14,2 DPS) | **28** (11,7 DPS) | −18 % |
| dégâts zélateur (flamme) | `zombie.js:29` | 12 (cycle 2,0–3,2 s = 4,6 DPS) | **10** (3,8 DPS) | −17 % |
| dégâts coureur | `zombie.js:25` | 10 (cycle 1,9 s = 5,3 DPS) | **inchangé** | c'est le moins dangereux des quatre : ne pas le raboter |
| fenêtre d'invulnérabilité | `player.js:562` | **aucune** | **0,45 s** après chaque coup encaissé | plafonne la meute à 2,2 coups/s : 6 marcheurs passent de 72 à 31 DPS |
| PV du joueur | `player.js:24-25` | 100 | **120** | 3 marcheurs : 2,8 s → **4,3 s** |
| soin de fin de vague | `game.js:365` | +8 PV | **+15 PV** | contrebalance la hausse des PV max |
| trousse de soin | `loot.js:767` | +45 PV | **+35 PV** | évite le soin « plein bar » |
| fiole de lumière | `game.js:192` | +35 PV | **+30 PV** | idem |

Cible mesurable : **survie à 3 contacts ≥ 4,0 s** en V1 (2,8 s aujourd'hui) et **à 6 contacts
≥ 3,5 s** (1,4 s aujourd'hui). C'est le seul chiffre qui doit guider la difficulté ressentie : le
nombre d'ennemis simultanés, pas leurs PV.

### 5.4 Munitions

Objectif : ramener le ratio offre/demande de **5× (mesuré) / 3,14 (modèle)** à **~2,0** en début de
nuit, **sans jamais assécher** une réserve basse (le cas `smoke` doit rester survivable).

| paramètre | fichier | actuel | proposé |
|---|---|---|---|
| boîte de 9 mm | `loot.js:16` | 14 | **10** |
| boîtes de calibre 12 | `loot.js:17` | 6 | **4** |
| boîte de 5,56 | `loot.js:18` | 18 | **18** (inchangé : c'est la munition de fin de nuit) |
| étui de .308 | `loot.js:19` | 5 | **5** (inchangé) |
| chance de munition par série | `loot.js:85` | 55 % (plat) | **45 % en V1–III, 55 % en V4–VIII, 60 % en V9+** |
| compensation « cadavre vide » | `loot.js:92` | 45 % | **25 %** |
| bonus de vague | `loot.js:45` | `+1,2 %/vague`, plafond 14 % | `+1,0 %/vague`, plafond **10 %** |
| **règle anti-gaspillage** | `loot.js:41` (début de `rollDrops`) | aucune | si le calibre tiré est à **≥ 75 % de `MAX_RESERVES`**, relancer une fois le tirage (puis laisser vide) |
| réserves max 9 mm | `weapons.js:114` | 240 | **240 (inchangé : jamais atteint, max observé 141)** |

Effet attendu : ~**7,4 unités fournies par mort en V1–III** au lieu de 10,4 (**−28 %**) et ~8,5 au
lieu de 10,1 en V12 (**−16 %**). Les munitions rares (.308, 5,56) sont préservées : ce sont elles qui
font la différence en fin de nuit, et elles sont aujourd'hui **inutilisables** jusqu'à la V7 (§3.5).

### 5.5 Butin

| paramètre | fichier | actuel | proposé | pourquoi |
|---|---|---|---|---|
| 2ᵉ série sur un mort | `loot.js:82` | 10 % | **7 %** | 1,1 objet/mort est déjà au-dessus du besoin |
| trousse | `loot.js:86` | 11 % | **8 %** | 0,112/mort → 3,7 trousses sur une vague de 33 hôtes = 1,7 barre de vie |
| fiole | `loot.js:87` | 6 % | **5 %** | |
| clé | `loot.js:88` | 4 % | **6 %** | 0 coffre ouvert sur 9 parties : la clé doit être plus fréquente, pas plus rare |
| lanterne | `loot.js:89` | 2,5 % | **3 %** | objet le plus rare alors qu'il est le plus « atmosphérique » |
| **filtre de palier sur les munitions** | `loot.js:72-74` | tables fixes (5,56 dès la V1) | ne tirer que les calibres dont une arme est **débloquable** (`maxWeaponTier(wave)`) | supprime les **19,4 %** d'objets inutiles en début de nuit |
| arme au sol | `weapons.js:132-136` | 3 % V2–III, 4,5 % V4–VI, 7 % V7–IX, 9,5 % V10+ | **8 / 10 / 12 / 14 %** | aujourd'hui un drop d'arme est **15× plus rare** qu'une arme garantie |
| arme garantie en bénédiction | `game.js:434` | **à chaque fin de vague** | **une fin de vague sur deux** | sinon `rollWeaponDrop` ne sert à rien : 0,21 arme par vague contre 1 garantie |

### 5.6 Coffres

| paramètre | fichier | actuel | proposé | effet |
|---|---|---|---|---|
| coffres sur la carte | `loot.js:594-598` | 4 coffres à 18,6–38,9 m | **6 coffres, tous à ≤ 26 m** | 1 coffre atteignable en < 8 s de course |
| caisses | `loot.js:594-598` | 8 | 8 (inchangé) | |
| rayon d'ouverture auto | `loot.js:611` | 1,85 m | **2,4 m** | ouvre au passage, sans s'arrêter |
| doublons internes | `loot.js:181-183` | 81,6 % des coffres | **tirage sans remise** (retirer l'objet tiré du pool) | 81,6 % → **0 %** |
| pièces par coffre | `loot.js:181` | 3 ou 4 (+ 50 % un extra) | **3 fixes**, extra à **35 %** | 4,38 → **3,4** pièces |
| poids des cachets | `loot.js:103-129` | 24 / 20 / 19 / 17 / 20 | **20 / 18 / 18 / 22 / 16 + « Réserve de la nef » 6** | reliquaire (.308, la munition de la carabine) remonte |
| arme par coffre (Armurerie) | `loot.js:105` | 55 % | **45 %**, mais **palier courant garanti** | une arme utile, pas une arme de palier 1 en V10 |
| contenu consommable | `loot.js:103-129` | **53 %** des pièces | **≤ 35 %** (réduire lanterne 26→18 et clé 34→24 en Sacristie) | le coffre doit être une ressource, pas une armoire à pharmacie |

Ajouter un 6ᵉ cachet n'a de sens que si les 5 existants arrêtent de tirer dans le même sac : c'est le
**tirage sans remise** et la **baisse des consommables** qui produisent la variété perçue, pas le
nombre d'étiquettes.

### 5.7 Ce qui n'est pas un problème d'équilibrage (à ne pas « corriger » par des chiffres)

- **Le soin** : 189 PV de soin disponibles en V12 (1,9 barre de vie) pour un joueur qui peut perdre
  120 PV en 1,1 s sous 5 contacts. Ne pas baisser les trousses avant d'avoir posé l'invulnérabilité
  du §5.3.
- **Les PV des ennemis** : le temps de tuer est déjà passé de 2 à 4 tirs à la tête en V12 (§3.2). Le
  problème est la **quantité** et l'**arrivée**, pas la résistance individuelle.
- **Le nombre d'objets** : 8 types suffisent si les tirages sont sans remise et filtrés par palier.

---

## 6. Protocole de revérification

1. Appliquer §5.0 (2 lignes) — sans cela, tout test de vague IV+ mesure un plantage.
2. Rejouer **6 parties à `--night=480`** (nuit réelle), skill 0,6 / 0,75 / 0,85 × 2, dont au moins
   une qui atteint la vague VI (boss).
3. Critères de réussite chiffrés :
   - vague I : **18–22 s**, et **< 5 %** du temps de nuit en attente sans ennemi vivant ;
   - vague XII atteinte par au moins **1 partie sur 6** ;
   - **ratio offre/demande de munitions entre 1,8 et 2,2** à toutes les vagues ;
   - **au moins 2 coffres ouverts par partie** et **0 doublon** dans un coffre ;
   - **temps de survie à 3 contacts ≥ 3,0 s** en V1.
4. Corriger `bot.js` avant de mesurer : `ammoSpent` en tirs cumulés (§0.3), ciblage des **caisses**
   (pas seulement des coffres), et un garde-fou « 8 s sans tir alors qu'un ennemi est vivant →
   abandon + rapport ».

---

## 7. Annexe — biais d'instrumentation constatés

| # | Symptôme | Cause | Impact sur l'analyse |
|---|---|---|---|
| A1 | `waves[].plan` décalé d'une vague (la V1 est étiquetée « La meute ») | `bot.js:386` lit `state.planName` **après** `startWave(n+1)` | plans corrigés via `events` dans tout ce rapport |
| A2 | `waves[].ammoSpent = 0` sur 20 vagues | `bot.js:392` mesure un **delta net** (ramassages inclus) | consommation lue dans `diag.stats.shots` |
| A3 | `butin = 0` avec 21 morts | le bot ne ramasse que sans cible, dans 16 m | mesure la mobilité, pas la générosité |
| A4 | `caches = 0` partout | ciblage réservé aux coffres **avec clé en poche** (`bot.js:344`) | les 8 caisses ne sont jamais testées |
| A5 | `graves.broken = 0` | le bot ne tire jamais sur les tombes | mécanique de dette de tombe non testée |
| A6 | 260 à 5 258 `TypeError` par partie en V4+ | §0 | invalide les vagues IV+ |
| A7 | `smoke` : 5 % de précision, 84 cartouches pour 1 mort | configuration `skill 0.9` mais tolérance de visée 0,044 rad | à exclure des moyennes de consommation |
| A8 | `hpEnd > hpStart` (100 → 120) sans soin visible | bénédiction `maxHp` | normal, mais fausse le calcul de `hpLost` (borné à 0) |
| A9 | valeurs de `src/` mouvantes pendant l'analyse (`runner` 5,0 → 4,6 m/s et 12 → 10 dégâts, `atkCd` 1,5 → 1,9) | édition concurrente de l'arbre de travail (mtime 10:28–10:41) | toutes les valeurs citées sont celles lues entre 10:35 et 10:45 ; `runner` est à 10 dégâts / 1,9 s dans ce rapport |
