# GUIDE DU JEU — VIGILE v2

> **À qui s'adresse ce document.** Au **joueur** (sections 1 à 7, 10, 11) et au
> **développeur** (sections 8, 9, 12 à 16). Toutes les valeurs chiffrées sont
> **lues dans le code**, pas recopiées d'un ancien document. Les références
> `fichier:ligne` ne sont conservées que pour les modules **stables** (`boss.js`,
> `zombie.js`, `util.js`, `input.js`, `achievements.js`, `blessings.js`,
> `graveyard.js`, `audio.js`, `style.css`) ; les modules en cours de refonte
> (`game.js`, `weapons.js`, `player.js`, `loot.js`, `ui.js`, `main.js`,
> `index.html`, `server.py`) sont cités **par leur nom** et par le **symbole**
> nommé dans le texte — la passe d'arbitrage en cours déplace leurs lignes.
>
> **État du code** : commit `e8d73d9` **plus l'arbre de travail** du 22/10/2026
> (passe d'arbitrage : télémétrie, neuvième arme « Lance-grenades de la crypte »,
> événements de vague, réglages de la carabine). Voir `docs/ARBITRAGE.md`, généré
> depuis ce même état. La dernière vérification publiée est `node tools/verify.mjs`
> → 0 échec, mais elle précède cette passe : **à rejouer**.
>
> **Documents voisins** : `README.md` (vitrine et mesures), `docs/FICHE.md` (fiche
> projet), `docs/PROTOCOLE-TEST.md` (recette), `docs/ANALYSE-EQUILIBRAGE.md`.
> En cas de contradiction, **le code fait foi** ; la section 15 liste les écarts.

---

## Sommaire

1. [Lancer une veille](#1-lancer-une-veille)
2. [La boucle de jeu — 22 h → 6 h](#2-la-boucle-de-jeu--22-h--6-h)
3. [Contrôles et réglages](#3-contrôles-et-réglages)
4. [Arsenal et munitions](#4-arsenal-et-munitions)
5. [Butin, caisses, coffres, tombes](#5-butin-caisses-coffres-tombes)
6. [Bénédictions](#6-bénédictions)
7. [Succès](#7-succès)
8. [Difficulté — formules exactes](#8-difficulté--formules-exactes)
9. [Les morts](#9-les-morts)
10. [Le boss — L'Officiant, Le Diacre, L'Abbé noir](#10-le-boss--lofficiant-le-diacre-labbé-noir)
11. [HUD, radar, retours à l'écran](#11-hud-radar-retours-à-lécran)
12. [Écrans — menu, pause, inventaire, fin](#12-écrans--menu-pause-inventaire-fin)
13. [Architecture des fichiers](#13-architecture-des-fichiers)
14. [Tableau récapitulatif des valeurs](#14-tableau-récapitulatif-des-valeurs)
15. [Écarts documentation ↔ code](#15-écarts-documentation--code)
16. [Vérifier — citer les tests](#16-vérifier--citer-les-tests)

---

## 1. Lancer une veille

```bash
cd vigile
python server.py 8131
# http://127.0.0.1:8131/
```

- Aucun build, aucun `npm install`, aucun CDN : `vendor/three.module.js` +
  `three.core.js` (0.186) et tout le reste est généré au démarrage (`index.html`,
  `server.py`).
- `server.py` envoie `Cache-Control: no-store` : un module modifié est rechargé au
  prochain F5.
- Chrome récent avec WebGL2. Le jeu tourne aussi en `--headless=new` — c'est ainsi
  qu'il est vérifié.

**Paramètres d'URL utiles** (`src/main.js`) :

| Paramètre | Effet |
|---|---|
| `?night=SECONDES` | Durée réelle de la nuit (défaut **480 s** ; les outils de test passent 150 à 480 s). |
| `?snap=menu\|wave3\|emerge\|boss\|bossclose\|nave\|dawn\|perf\|arsenal\|loot` | Scène figée pour capture et diagnostic (`applySnap`). |
| `?q=low\|medium\|high` | Qualité initiale (sinon réglage persisté). |

**Ce qui est persistant** (`localStorage`) : `vigile.settings.v2` (réglages),
`vigile.audio.muted` (son coupé ou non), `vigile.succes.v1` (succès),
`vigile.telemetry.last` (dernier rapport de télémétrie, § 13.2).
Aucune sauvegarde de partie : **une veille = une session**.

---

## 2. La boucle de jeu — 22 h → 6 h

### 2.1 Le temps

| Élément | Valeur |
|---|---|
| Nuit | **8 heures de jeu** : 22:00 → 06:00 (`NIGHT_HOURS`) |
| Durée réelle | **480 s** par défaut, soit **1 s réelle = 1 min de jeu** (`nightDur`) |
| Conversion | `heure = 22 + (nightT / nightDur) × 8` |
| Affichage | `22:00`, `01:30`… (`clockLabel`, `util.js:76-81`) |
| Offices | Vêpres 21:30→00:30 · Matines →03:00 · Laudes →05:00 · Aube →06:00 (`util.js:84-90`) |
| Cloches | 23:00 (1 coup), 01:00 (2), 04:00 (1) |
| Aube | commence à **88 % de la nuit**, soit ≈ **05:02** (`dawnStart`) |
| Fin | à 100 % (06:00) → verdict |

L'horloge **s'arrête** pendant la pause, l'inventaire, le choix de bénédiction et
la révélation du boss : ces écrans posent `state.freeze = true`, et `updateNight()`
n'est appelée que si `!state.freeze`.

### 2.2 Les vagues

- **Douze assauts nommés**, puis « La nuit s'acharne » à partir de la XIII
  (`WAVE_PLANS`, `PLAN_AFTER`). Chaque plan fixe composition, taille, cadence
  d'apparition, et éventuellement multiplicateurs de vitesse et de dégâts.
- **Premier assaut après 6 s** ; entre deux vagues **5,5 s** de répit, **7 s**
  après la XII (`finishWave`).
- **Annonce** : « Vague IV · La procession » + « 11 hôtes quittent la terre ·
  122 % ». Le pourcentage est `round(difficulté × 100)`.
- **Apparition** : les morts sortent de terre à **~26 m** du joueur (jamais à
  moins de 14 m), après 8 tirages de points de la couronne (`spawnOne`). Ils sont
  **invulnérables pendant l'émergence** (1,6 à 2,4 s) et n'attaquent pas
  (`zombie.js:383-394`).
- **Plafond de vivants** : 24 (28 si le plan est à gros effectif), **10 dès qu'un
  boss est vivant** (`startWave`, `triggerBoss`).
- **Colosses** : au plus **2 vivants** (4 à partir de la vague IX) ; un tirage de
  colosse en trop est remplacé par un marcheur ou un coureur (`spawnOne`).
- **Événements de vague** (hors vague I et hors vagues de boss) :
  - **22 %** « Charrette de colosses » : **2 ou 3 colosses** supplémentaires
    (40 % pour le troisième), qui ignorent le plafond de colosses ;
  - **10 %** « Le Sonneur » : le **premier mort de la vague** devient une élite
    (PV ×3, échelle ×1,35, toast dédié).
- **Fin de vague** : quand `pending = 0` **et** plus aucun hôte vivant. Soin de
  **+12 PV**, toast « Vague nettoyée · +12 PV », puis **bénédiction**.
- **Le boss verrouille la vague** : tant qu'il respire, la vague ne se ferme pas ;
  le HUD affiche « Le boss tient la nef » et une annonce « La nef attend ».

### 2.3 Le boss

Un boss **tous les cinq assauts** : vague 5 → L'Officiant, 10 → Le Diacre,
15 → L'Abbé noir (`bossVariantForWave`). Il apparaît **dans la nef** (0 ; −7,5),
déclenche une **révélation cinématique de 3,6 s** (fondu, caméra, titre) pendant
laquelle la veille est figée, et pose **un dépôt de survie** dans l'église :
9 mm, calibre 12, trousse, un coffre et une caisse. Détail complet en § 10.

### 2.4 L'aube, la victoire, la défaite

| Issue | Condition | Texte de l'écran de fin |
|---|---|---|
| **Victoire** | 06:00 **et** boss mort (ou aucun boss apparu) | « L'aube s'est levée sur un Vigile encore debout. » |
| **Défaite au jour** | 06:00 avec le boss encore debout | « Le jour se lève. L'Officiant est toujours dans la nef. » |
| **Défaite par mort** | PV du joueur à 0 | « Les morts vous ont pris avant l'aube. » |

L'aube n'est pas qu'un minutage : à partir de 88 %, la lumière, le brouillard, la
lune, le ciel, les vitraux, les faisceaux et la musique se réchauffent
progressivement (`applyDawn`).

**Boucle en une phrase (version joueur)** : tenir 8 minutes réelles, abattre les
vagues qui montent, ramasser munitions et soins, casser des tombes pour alléger
l'assaut suivant, choisir une bénédiction après chaque vague, descendre dans la
nef tuer le boss quand la cloche sonne, et voir 06:00 avec lui mort.

---

## 3. Contrôles et réglages

### 3.1 Commandes

| Touche | Action |
|---|---|
| **Z A S E** | marcher : Z avant, A gauche, S arrière, E droite |
| Flèches / `KeyW` `KeyA` `KeyD` | solution de secours (QWERTY, flèches) |
| **Maj** | sprint (consomme l'endurance) |
| **Espace** | sauter |
| **Clic gauche** | tirer / frapper à la lame |
| **Clic droit** | utiliser l'objet actif ; sinon boire une fiole si blessé ; sinon viser (lunette) |
| **Molette** | arme suivante ou précédente, **parmi les armes possédées** |
| **1 … 9** | raccourci direct d'arme (refusé si non trouvée : toast explicatif) |
| **R** | recharger (munitions par calibre) |
| **I** | inventaire — **met la veille en pause** |
| **H** / **L** / **G** | trousse de soin / lanterne à huile / fiole de lumière |
| **F** | éteindre / rallumer la lanterne |
| **1 / 2 / 3** | choisir une bénédiction en fin de vague ; **Échap** refuse |
| **Échap** | pause / reprise (ne s'empile pas sur un écran déjà ouvert) |
| **M** ou 🔊/🔇 | couper / rétablir **tout** le son |
| ↑ ↓ + **Entrée** | menu : choisir et lancer (souris : survol) |
| Clic (canvas) | capture de la souris ; à défaut, visée en glisser |

> `E` **n'est pas** une touche d'interaction : c'est la droite du ZASE. Le butin,
> les caisses et les coffres s'ouvrent **au passage** (§ 5.2). La fiole est passée
> de `Q` à `G` pour la même raison.

### 3.2 Réglages (persistés)

| Réglage | Plage | Défaut | Effet |
|---|---|---|---|
| Sensibilité | 0,25 → 2,20 (pas 0,05) | 1,00 | `sens = 0.0022 × sensibilité` rad/px |
| Volume | 0 → 1 | 0,72 | bus audio |
| Champ de vision | 60 → 95° | 68 | FOV de base (+5° au sprint, réduit par la lunette) |
| Qualité | Basse / Moyenne / Haute | Haute | pixel ratio 1,5 · 1 · 0,78 ; bloom coupé en Basse ; ombres 2048² → 1024² |
| Inverser l'axe vertical | Oui / Non | Non | `invertY` |

Le son démarre **coupé** : aucun audio avant une action explicite.

---

## 4. Arsenal et munitions

### 4.1 Les neuf armes

On commence avec **deux** armes : pistolet Mle 1935 et hachette de garde
(`START_WEAPONS`). Les sept autres **se ramassent** (§ 4.5).

| # | Arme | Calibre | Chargeur | Dégâts/tir | Cadence | DPS théorique | Tête × | Abattage tête | Puissance | Rechargement | Palier |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---:|---:|
| 1 | **Pistolet Mle 1935** | 9 mm | 16 | 30 | 300 c/min (0,20 s) | 150 | ×2,6 | **40 %** | ●○○○ | 1,15 s | 1 |
| 2 | **Fusil à pompe Saint-Éloi** | cal. 12 | 10 | 11 × **8 grains** = 88 | 73 c/min (0,82 s) | 107 | ×1,6 | **32 %** | ●●○○ | 2,10 s | 1 |
| 3 | **PM « Vêpres »** | 9 mm | 40 | 16 | 800 c/min (0,075 s) | 213 | ×2,2 | **26 %** | ●●○○ | 1,45 s | 2 |
| 4 | **Fusil d'assaut « Matines »** | 5,56 | 40 | 24 | 571 c/min (0,105 s) | 229 | ×2,6 | **50 %** | ●●●○ | 1,70 s | 3 |
| 5 | **Carabine « Laudes »** | .308 | 10 | 105 | 86 c/min (0,70 s) | 150 | ×2,7 | **75 %** | ●●●● | 2,00 s | 4 |
| 6 | **Hachette de garde** | lame | — | 62 | 109 c/min (0,55 s) | 113 | ×2,4 | **35 %** | ●○○○ | — | 1 |
| 7 | **Revolver de sacristie** | 9 mm | 8 | 62 | 136 c/min (0,44 s) | 141 | ×2,35 | **55 %** | ●●○○ | 1,90 s | 1 |
| 8 | **Machette de garde** | lame | — | 44 | 167 c/min (0,36 s) | 122 | ×2,2 | **30 %** | ●●○○ | — | 2 |
| 9 | **Lance-grenades de la crypte** | 40 mm | 2 | 85 **(zone)** | 57 c/min (1,05 s) | 81 (mono-cible) | ×1,0 | **0 %** | ●●○○ | 2,50 s | 2 |

Sources : `weapons.js` (définitions), `headshotChance` (abattage). **DPS
théorique** = `dégâts × grains / cadence`, **tous projectiles au but**, sans chute
de distance ni tir à la tête : c'est une comparaison, pas une promesse. La lunette
de la carabine vaut `zoom: 0.40` → FOV ramené à 40 % (≈ ×2,5), affiché « × 2,5 »
dans le HUD.

**Lance-grenades** : ce n'est pas un hitscan. La grenade éclate **au premier
obstacle** (mort, mur ou sol) et blesse tous les morts dans un rayon de **4,4 m**,
avec des dégâts dégressifs jusqu'au bord : `85 × (0,45 + 0,55 × k)`, `k` décroissant
du centre vers le bord. Il ne tire **jamais** de coup à la tête (`headChance: 0`) et
ses munitions ne tombent que dans les coffres (§ 5.4).

**Armes de mêlée** : pas de munitions, pas de rechargement. Portée **2,5 m**
(hachette) et **2,7 m** (machette) (`reach`), cône de sélection `dot ≥ 0,45` et
cible la plus « devant ». Gestes distincts (abattage vertical / revers latéral)
définis par images-clés, avec **traînée de lame** (`meleePose`, `MELEE_KEYS`).

### 4.2 Munitions

Cinq calibres + la lame (`AMMO`, `AMMO_ORDER`).

| Calibre | Armes | Boîte au sol | Réserve de départ | Réserve max |
|---|---|---:|---:|---:|
| **9 mm** | pistolet, PM, revolver | 14 cartouches | 72 | 240 |
| **calibre 12** | fusil à pompe | 6 cartouches | 24 | 80 |
| **5,56 mm** | fusil d'assaut | 18 cartouches | 90 | 240 |
| **.308** | carabine | 5 cartouches | 15 | 60 |
| **40 mm** | lance-grenades | 3 grenades | 6 | 30 |

`DEFAULT_RESERVES` / `MAX_RESERVES` fixent ces bornes. Une arme ramassée donne
**deux chargeurs** de son calibre, plafonnés à la réserve max (`unlockWeapon`).

**Nombre de chargeurs affiché** = `max(1, ceil(réserve / chargeur))` dès qu'il
reste une cartouche : avec 11 balles et un chargeur de 12, le HUD annonce bien
1 chargeur, pas 0.

**Dégâts à distance** (`damageAtDistance`) :

```
dégâts(d) = dégâts × (1 − k × (1 − minFactor)),  k = clamp((d − a) / (b − a), 0, 1)
```

| Arme | Chute de a à b (m) | Facteur plancher |
|---|---|---|
| Pistolet | 16 → 44 | 0,62 |
| Fusil à pompe | 5 → 17 | 0,22 |
| PM | 10 → 34 | 0,50 |
| Fusil d'assaut | 24 → 62 | 0,70 |
| Carabine | aucune | 1,00 |
| Revolver | 18 → 46 | 0,68 |
| Lance-grenades | 8 → 26 | 0,90 — **déclarée mais non appliquée** : le souffle n'utilise que `damage` et `splash` (§ 15) |

**Dispersion** à la première balle : `spread + moveSpread (sprint) + 0,5 ×
moveSpread × bob + 0,8 × moveSpread (en l'air) − 0,4 × spread (visée)`, plancher
0,0002 rad. Réticule : `3 + spread × 900` px. Portée du hitscan : **90 m**.

### 4.3 Tirs à la tête

Deux mécanismes distincts, tous deux portés par l'arme :

1. **Multiplicateur de dégâts** `headMul` (×1,6 à ×2,7) appliqué si la partie
   touchée est `head`.
2. **Abattage net** : tirage aléatoire ; s'il réussit, la cible meurt **sur place**
   quel que soit son reste de PV.

```
chance = clamp( base × (1 + (headMod − 1) × 0,4) × (gros ? 0,2 : 1), 0,02 , 0,95 )
```

`base` vient de l'arme (26 % → 75 %, tableau § 4.1 ; **0 % au lance-grenades**) ;
`gros` = colosse, boss, ou toute cible à `maxHp ≥ 300` → **chance divisée par
cinq** ; `headMod` est la bénédiction « Œil de lynx » (`headshotChance`).

Sur un modèle GLB sans sous-partie « tête », la partie est déduite de la hauteur
d'impact : `point.y − pos.y > height × 0,79`. Sur le boss, le crâne entier compte
comme tête, mais **pas** les cierges ni la mitre, et les dégâts de tête y sont
×**1,55**.

### 4.4 Cadence, recul, manipulation

- Cadence = `cooldown / max(0,2 ; mods.fireRate)` ; armes automatiques : tir
  continu tant que le bouton est tenu.
- Durée de rechargement = `reload / max(0,2 ; mods.reload)` ; interrompue au
  changement d'arme.
- Recul : `recoil` caméra + `kick` view-model + secousse d'écran, propres à chaque
  arme.
- **Changement d'arme** : l'arme remonte du bas (0,55 s de blocage de tir,
  `switchK`).
- **Lance-grenades** : un seul projectile par tir, explosion au premier obstacle,
  rayon **4,4 m**, **85** au centre et un plancher de **38** (×0,45) au bord du
  souffle, secousse et gerbe de pierre. Le rayon touche **tous** les morts, sans
  distinction de partie du corps.

### 4.5 Comment on obtient les armes

| Voie | Règle |
|---|---|
| **Départ** | pistolet + hachette (`START_WEAPONS`) |
| **Butin sur un mort** | `weaponDropChance(vague)` : 0 % en I, 3 % ≤ III, 4,5 % ≤ VI, 7 % ≤ IX, 9,5 % ensuite ; **×2,3 sur un colosse**, plafond 50 % |
| **Palier autorisé** | vague ≤ 3 → palier 1 ; ≤ 6 → 2 ; ≤ 8 → 3 ; sinon 4 (`maxWeaponTier`) |
| **Choix dans le pool** | armes non possédées, poids `1 / palier²` : les meilleures restent rares (`pickWeapon`) |
| **Caisse** | 10 % de chance d'arme |
| **Coffre** | chance propre au cachet : 55 % armurerie, 38 % reliquaire, 12 % sacristie, 9 % pillage, 5 % soins |
| **Fin de vague** | une arme manquante **remplace la carte 1** de bénédiction si son palier est autorisé (`offerBlessing`) |
| **Boss** | lâche la meilleure arme manquante : carabine puis fusil d'assaut (`bossWeaponRewards`) |

Un doublon d'arme ramassé donne **+12 cartouches** de son calibre.

Le **lance-grenades** (palier 2) suit les mêmes voies à partir de la vague 4 ; ses
**grenades ne sont jamais lâchées par un mort** : seulement dans les coffres
(armurerie, reliquaire) et dans les caisses du scénario `arsenal`.

---

## 5. Butin, caisses, coffres, tombes

### 5.1 Les objets

| Objet | Effet | Rareté | Cumul max |
|---|---|---|---|
| Boîte de 9 mm | +14 cartouches | commun | réserve 240 |
| Boîtes de calibre 12 | +6 | commun | réserve 80 |
| Boîte de 5,56 | +18 | rare | réserve 240 |
| Étui de .308 | +5 | très rare | réserve 60 |
| Boîtes de 40 mm | +3 grenades | rare | réserve 30 |
| **Trousse de soin** | **+55 PV** (H) | rare | 6 |
| **Fiole de lumière** | **+35 PV** (G) ; si le stock est plein, soigne **+18 PV** immédiatement | rare | 3 (+1 par bénédiction) |
| **Lanterne à huile** | **30 s** de lumière large (L) | rare | 6 |
| **Clé de la sacristie** | ouvre **un** coffre verrouillé (consommée) | très rare | 9 |
| Arme | débloque l'arme + 2 chargeurs | rare / très rare (palier ≥ 3) | 9 armes |

**Le butin de vie et de munitions est volontairement rare** : une seule série par
mort, deux dans 10 % des cas ; les boîtes de munitions ne tombent que pour les
**calibres déjà possédés**.

### 5.2 Ramassage : aucun bouton

| Interaction | Rayon | Condition |
|---|---:|---|
| Objet au sol | **1,15 m** | ligne de vue dégagée (pas de ramassage à travers un mur) |
| Caisse / coffre | **1,85 m** | ligne de vue ; ouverture automatique |
| Invite affichée | 2,6 m (objet) / 2,9 m (coffre) | seulement si visible |
| Coffre verrouillé | — | s'ouvre seul si une clé est en poche, sinon message d'indice |

Un coffre vidé **s'enfonce et disparaît** en ~1,2 s. Le **popup de butin** (bas
droite) affiche nom, quantité et rareté ; un coffre liste **tout son contenu d'un
coup** et les ramassages suivants ne l'écrasent pas pendant **1,6 s**.

### 5.3 Butin d'un mort

**Morts ordinaires** — 1 série, +1 dans 10 % des cas :

| Tirage `r` | Résultat |
|---|---|
| < 0,600 | une boîte de munitions (9 mm 44, cal. 12 12, 5,56 20, .308 5 ; coureur : 50 / 14 / 12 / 3) |
| 0,600 → 0,700 | trousse de soin |
| 0,700 → 0,755 | fiole |
| 0,755 → 0,815 | clé |
| 0,815 → 0,840 | lanterne |
| ≥ 0,840 | rien |

Si rien n'est sorti du tout (ni série, ni arme), **45 %** de chance de lâcher
quand même une boîte (9 mm 70 %, cal. 12 30 %). Les armes sont tirées **en plus**,
via `rollWeaponDrop`.

**Colosse** : grosse munition garantie (5,56 si possédé, sinon 9 mm), .308 à 45 %
dès la vague VI si possédé ; +45 % une seconde grosse boîte, +22 % trousse, +18 %
lanterne, +16 % (+ bonus de vague) fiole.

### 5.4 Caisses et coffres

**Douze caches placés à chaque veille** : 8 caisses, 4 coffres — devant la
chapelle, dans le cimetière et sur les bas-côtés (`placeCaches`).

| Type | Contenu |
|---|---|
| **Caisse** | 1 à 3 objets, table 9 mm 30 / cal. 12 18 / 5,56 16 / .308 6 (2 avant la VI) / trousse 14 / fiole 10 / lanterne 7 / clé 7 ; **10 %** d'arme en plus |
| **Coffre** | **3 à 4 pièces** du cachet + **45 %** d'un appoint + **18 %** d'une pièce d'un autre cachet ; arme selon le cachet ; **clé et lanterne jamais en double** |

**Cinq cachets** tirés à l'ouverture (`CACHE_THEMES`) :

| Cachet | Poids | Arme | Table principale |
|---|---:|---:|---|
| **Armurerie** | 24 | 55 % | cal. 12, 5,56, 9 mm, .308, **40 mm** |
| **Réserve de soins** | 20 | 5 % | trousse, fiole, lanterne, 9 mm, clé |
| **Sacristie** | 19 | 12 % | clé, lanterne, fiole, trousse, cal. 12 |
| **Reliquaire** | 17 | 38 % | .308, fiole, clé, trousse, 5,56, **40 mm** |
| **Butin de pillage** | 20 | 9 % | 9 mm, cal. 12, 5,56, trousse, lanterne, clé |

Le contenu d'une caisse est **tiré à l'ouverture, à la vague courante** : une
caisse gardée pour la fin de la veille peut contenir une meilleure arme. Seuls les
dépôts du boss ont un butin **explicite**, fixé à l'apparition. Les coffres sont
**verrouillés** : il faut une clé, et le message d'indice reste affiché tant
qu'aucune clé n'est en poche.

> Mesure de variété : `tools/loottest.mjs` — 600 tirages de coffre, 443 contenus
> distincts, l'objet le plus fréquent passe de 100 % à 67 %. Le test lit le **vrai**
> `rollCache`.

### 5.5 Tombes destructibles

- **PV : 60** par stèle (`graveyard.js:222`). Le pistolet (30) en casse une en
  **deux balles** ; un coup de hachette (62) suffit.
- Une tombe brisée rend un **butin rare** dans **42 %** des cas — un tirage parmi
  `.308`, clé, fiole, `5,56` (`RARE_GRAVE_LOOT`).
- Sinon elle **épargne un hôte à la vague suivante** : `graveDebt++`, consommé au
  démarrage de la vague suivante (`startWave`). Le compteur est visible dans la
  pause et dans l'annonce de vague (« · N épargnés »).
- Environ **une cinquantaine** de tombes : 5 rangées × 6 colonnes × 2 côtés, avec
  18 % de vides (`graveyard.js:187-197`).

---

## 6. Bénédictions

À **chaque vague nettoyée**, trois cartes tirées au sort sans remise, pondérées
(`drawBlessings`). Choix `1`/`2`/`3`, clic, ou **Échap pour refuser** ; la partie
est figée pendant le choix et la nuit est en pause (`offerBlessing`). La carte 1
est **remplacée par une arme manquante** si son palier est autorisé à la vague
courante.

| Bénédiction | Tag | Effet réel | Poids |
|---|---|---|---:|
| **Zèle** | Dégâts | `damage ×1,18` | 10 |
| **Cadence** | Tir | `fireRate ×1,14` | 9 |
| **Cuirasse** | Vitalité | `maxHp ×1,2` (+20 PV, soignés) | 8 |
| **Doigts agiles** | Rechargement | `reload ×1,28` → rechargement ÷1,28 (−22 %) | 8 |
| **Œil de lynx** | Tirs à la tête | `head ×1,3` : dégâts de tête ×1,3 **et** chance d'abattage ×1,12 | 7 |
| **Pas de loup** | Mobilité | `speed ×1,07` | 7 |
| **Sang-froid** | Défense | `damageTaken ×0,86` (−14 %) | 7 |
| **Bras de fer** | Mêlée | `melee ×1,35` | 6 |
| **Grenier** | Munitions | +48 9 mm, +16 cal. 12, +60 5,56, +10 .308 (plafonnés) — **pas de 40 mm** | 8 |
| **Fiole de plus** | Soin | `maxFlasks +1` et une fiole pleine | 6 |

Application : `mods[kind] = max(0,2 ; mods[kind] × mul)` (`applyMod`). Les
multiplicateurs sont **cumulatifs** : deux « Sang-froid » donnent ×0,74 ; deux
« Zèle » ×1,39. `maxHp` est recalculé en `round(100 × mods.maxHp)` et le gain est
soigné immédiatement.

---

## 7. Succès

18 succès persistants (`localStorage`, clé `vigile.succes.v1`), bandeau doré en
jeu, panneau complet dans le menu avec barre de progression par succès.

| Succès | Palier | Objectif | Métrique |
|---|---|---|---|
| Premier sang | bronze | 1 mort | `kills` (cumulé) |
| Fossoyeur | argent | 150 morts | `kills` |
| Charnier | or | 600 morts | `kills` |
| Décapiteur | bronze | 10 tirs à la tête | `headshots` |
| Crâne fendu | argent | 50 tirs à la tête | `headshots` |
| Veilleur | or | tenir jusqu'à l'aube | `victories` |
| Intouchable | or | aube sans un seul coup encaissé | `flawless` |
| L'Officiant | argent | abattre le prêtre mort | `bossKills` |
| Maître des lieues | or | l'abattre après sa **phase III** | `bossPhase3` |
| Ardeur | bronze | nettoyer 5 vagues dans une veille | `bestWave` (meilleure veille) |
| Nuit blanche | or | nettoyer les 12 vagues | `bestWave` |
| Ferrailleur | argent | 25 morts à la lame | `meleeKills` |
| Connaisseur | argent | tirer avec **8 armes différentes** (9 à l'arsenal) dans une même veille | `bestWeapons` |
| Colosse | argent | 10 colosses | `bruteKills` |
| Coursier | bronze | 25 coureurs | `runnerKills` |
| Soif de lumière | bronze | boire 10 fioles | `flasks` |
| Béni | bronze | recevoir 5 bénédictions | `blessings` |
| Survivant | argent | voir l'aube avec **moins de 15 PV** | `lowHpVictory` |

Deux familles de compteurs : **cumulés sur toutes les veilles** (`kills`,
`headshots`, `flasks`, `bossKills`…) et **meilleure veille** (`bestWave`,
`bestWeapons`). Les succès se débloquent en jeu (toast 2,6 s) ou à l'écran de fin.

---

## 8. Difficulté — formules exactes

Toutes ces formules sont dans `src/game/game.js` et `src/entities/zombie.js` ;
elles sont **lues à l'exécution**.

### 8.1 Difficulté de la vague

```js
difficulty(n) = clamp(1 + (n − 1) × 0,072, 1, 2,8)
```

| Vague | I | V | X | XII | XX | XXVI+ |
|---|---:|---:|---:|---:|---:|---:|
| Difficulté | 1,000 | 1,288 | 1,648 | 1,792 | 2,368 | **2,800** (plafond) |

Le HUD et l'annonce affichent `round(difficulté × 100)` : 100 %, 129 %, 165 %…

### 8.2 Taille de la vague

```js
base(n)     = clamp(round(5 + (n − 1) × 1,6), 1, 32)
waveSize(n) = clamp(round(base(n) × plan.size), 1, 40)
```

`plan.size` vaut 1,05 à 1,3 pour les plans nommés, **0,12** pour « L'Officiant »
(un seul hôte avec le boss), 1,4 pour « La nuit s'acharne ». Les tombes brisées
retirent des hôtes **après** ce calcul : `pending = max(1, waveSize(n) − épargnés)`.

### 8.3 PV, dégâts et vitesse d'un mort

```js
PV      = PV_type    × difficulté^1,12
dégâts  = dégâts_type × difficulté^0,75 × plan.damage
vitesse = vitesse_type × min(1,45 ; difficulté^0,35) × [0,92…1,08] × plan.speed
```

Exemples : marcheur **105 PV** en V1, **202 PV** en V12 (×1,92), **211 PV** en
V13 ; ses coups passent de **16 à 25** PV. Colosse : 310 → 596 PV. Le facteur
`1,12` (au lieu de 1,25) et `0,75` (au lieu de 0,9) viennent de la passe
d'équilibrage du 22/10.

### 8.4 Composition, cadence, plafonds

| Réglage | Valeur |
|---|---|
| Composition | tirage pondéré dans `plan.mix` |
| Cadence d'apparition | `plan.spawn` sinon 0,45 s (0,36 s dès la X) |
| Distance d'apparition | ~26 m, jamais < 14 m |
| Vivants max | 24 / 28 (gros plans) / 10 (boss vivant) |
| Colosses vivants | 2 (4 dès la IX) |
| Événements | 22 % « Charrette » (2–3 colosses, hors plafond), 10 % « Le Sonneur » (PV ×3) |
| Boss | tous les 5 assauts, plafonné à 3 variantes |
| Intermission | 5,5 s (7 s après la XII), 6 s avant la vague I |
| Soin de fin de vague | +12 PV |

### 8.5 Courbe de la nuit (valeurs calculées)

| Vague | Plan | Hôtes | Diff. | PV marcheur | Dégâts marcheur | PV colosse |
|---|---|---:|---:|---:|---:|---:|
| I | Les errants | 6 | 1,000 | 105 | 16 | 310 |
| II | La meute | 7 | 1,072 | 114 | 17 | 335 |
| III | L'ossuaire | 8 | 1,144 | 122 | 18 | 360 |
| IV | La procession | 11 | 1,216 | 131 | 18,5 | 386 |
| V | **L'Officiant** (boss) | **1** + boss | 1,288 | 139 | 19,3 | 412 |
| VI | La horde | 16 | 1,360 | 148 | 20,1 | 437 |
| VII | La traque | 17 | 1,432 | 157 | 20,9 | 463 |
| VIII | Le siège | 17 | 1,504 | 166 | 21,7 | 490 |
| IX | L'office noir | 22 | 1,576 | 175 | 22,5 | 516 |
| X | La marée + **Le Diacre** (boss) | 25 | 1,648 | 184 | 23,3 | 542 |
| XI | Le chevalet | 22 | 1,720 | 193 | 24,0 | 569 |
| XII | La dernière veille | 29 | 1,792 | 202 | 24,8 | 596 |
| XIII+ | La nuit s'acharne | 34 → 38 (puis 40 max) | 1,864 → | 211 | 25,5 | 623 |

> **Vague V** : un seul hôte en plus du boss (`plan.size = 0,12`). Le tableau du
> `PROTOCOLE-TEST.md` § 5.1 annonce encore 8 hôtes : valeur antérieure au duel
> cadré (voir § 15). Les **événements de vague** ajoutent 2 à 3 colosses ou une
> élite aux chiffres ci-dessus : ce sont des hôtes **supplémentaires**, non comptés
> dans la colonne « Hôtes ». La vague XV, au-delà des plans nommés, appelle
> **L'Abbé noir**.

---

## 9. Les morts

Quatre types (`ZOMBIE_TYPES`). Les valeurs ci-dessous sont **de base** : PV et
dégâts sont ensuite multipliés par la difficulté, vitesse et dégâts par le plan
(§ 8.3).

| Type | PV | Vitesse | Dégâts | Rayon | Échelle | Cycle d'attaque | Portée de frappe |
|---|---:|---:|---:|---:|---:|---:|---:|
| **Marcheur** (rodeur) | 105 | 1,95 m/s | 16 | 0,36 m | 1,00 | 1,5 s | 1,9 m |
| **Coureur** | 62 | **4,60 m/s** | 10 | 0,34 m | 0,97 | 1,9 s | 1,9 m |
| **Colosse** | 310 | 1,50 m/s | 30 | 0,72 m | 1,45 (≈ 2,3 m) | 2,4 s | 2,7 m |
| **Zélateur** | 84 | 2,15 m/s | 11 | 0,34 m | 0,99 | 2,0–3,2 s | 14 m (tir), 2,8 m (corps) |

- **Attaque télégraphiée** : durée 0,72 / 0,56 / 0,95 / 1,15 s selon le type, la
  frappe tombe à **52 %** de l'animation (`zombie.js:34-35`).
- **Émergence** : 1,6 à 2,4 s, décalage aléatoire jusqu'à 0,45 s, main qui perce
  le sol, monticule, mottes, poussière, secousse et grognement étouffé par la
  distance (`zombie_anim.js:16-26`, `zombie.js:539-625`).
- **Zélateur** : garde **11 m**, tire à moins de **14 m** s'il a une ligne de vue,
  avance s'il l'a perdue. Sa **flamme noire** voyage à **11,5 m/s**, dure 3,2 s, se
  brise sur les murs et frappe pour **55 %** de ses dégâts (`zombie.js:457-505`).
  Son brûle-parfum s'embrase pendant l'armement : c'est le tell.
- **Le Sonneur** (événement, 10 % des vagues) : le **premier mort** de la vague
  reçoit **PV ×3** et une échelle **×1,35**. Le code ne force pas son type : ce
  peut être un marcheur ou un coureur promu, pas nécessairement un colosse (§ 15).
- **Charrette de colosses** (événement, 22 %) : **2 ou 3 colosses** de plus, qui
  ignorent le plafond de colosses vivants.
- **Anti-enlisement** : si un mort avance de moins de 15 cm en 0,8 s, il tente un
  pas de côté de 0,5 s ; au contact (≤ 1,6 m), c'est l'attaque qui prend le relais
  (`zombie.js:744-779`).
- **Mort** : animation 2,6 s au sol, enfoncement, retrait du monde à **5,4 s**
  (`zombie.js:647-659`).

---

## 10. Le boss — L'Officiant, Le Diacre, L'Abbé noir

### 10.1 Variantes et PV

```js
PV_boss = 1200 × difficulté × hpMul
hpMul   = 1,0 (Officiant) · 1,6 (Diacre) · 2,2 (Abbé noir)
```

| Variante | Vague | hpMul | Échelle | `dmgMul` | PV réels |
|---|---:|---:|---:|---:|---:|
| **L'Officiant** | 5 | 1,0 | 1,00 | 1,00 | **1 546** |
| **Le Diacre** | 10 | 1,6 | 1,12 | 1,12 | **3 164** |
| **L'Abbé noir** | 15 | 2,2 | 1,25 | 1,24 | **5 301** |

Rayon `0,9 × échelle` (0,90 / 1,01 / 1,12 m). Vitesses : 2,0 m/s en phase I, 2,75
en phase II, **3,52** en phase III. Il garde ses distances : il s'arrête à
`2,45 × échelle` du joueur. **Il ne pousse jamais le joueur** : aucune attaque ne
modifie `player.pos`, la charge s'arrête net sur l'impact (`boss.js:952-954`).

### 10.2 Les trois phases

| Seuil | Phase | Déclenchement | Effets |
|---|---|---|---|
| 100 % | **I** | — | cadence lente, cinq attaques (la colonne reste réservée à la phase II+) |
| **< 50 %** | **II** | `onPhase2` | annonce « Phase II », cri, **2 coureurs** en renfort, lueur rouge, vitesse ×1,375, accès à la **colonne de lumière**, cadence accrue |
| **< 25 %** | **III** | `onPhase3` | annonce « Phase III », **rugissement de 2,1 s** avec **invulnérabilité 1,2 s**, **2 renforts** (coureur + marcheur), éclats de verre, sceau plus rapide, cadence maximale |

Pendant le rugissement, les coups sont ignorés et un toast prévient : « L'Officiant
se protège — attendez la fin du rugissement » (`boss.js:766-776`).

Les dégâts de tête sur le boss sont **×1,55**, et l'abattage net y est **divisé
par cinq** (comme sur un colosse).

### 10.3 Les six attaques

Toutes télégraphiées au sol ou aux mains, et **multipliées par `dmgMul`** de la
variante. Cadences données en phase I / II / III.

| Attaque | Code | Télégraphe | Dégâts | Zone | Cadence (I/II/III) |
|---|---|---|---:|---|---|
| **Frappe au sol** | `slam` | anneau 3,2–3,55 m qui se resserre, 0,62 s | 16 (×1,1 dès II) | rayon **4,6 × échelle** | 1,9 / 1,5 / 1,35 s |
| **Onde de choc** | `wave` | bras levés 0,55 s, puis anneau qui s'étend | 13 (×1,1 dès II) | anneau à **13 m/s**, jusqu'à 13 m ; touche si l'écart au rayon est < 0,9 m | 2,2 / 1,6 / 1,5 s |
| **Charge** | `charge` | ligne 2,4 × 9 m au sol, 0,55 s | 16 (×1,1 dès II) | **15 m/s**, stoppée par le joueur ou le mur | 0,8 s après l'étourdissement |
| **Colonne de lumière** | `column` | anneau sous la cible, **1,0 s** | 20 (×1,1 en III) | rayon **1,7 m** ; **phase II+**, à plus de 7,2 m, 30 % | 2,4 / 1,9 / 1,6 s |
| **Éventail de flammes** | `volley` | éventail au sol 7,2 m (1,1 rad) + mains qui s'embrasent, 0,85 s | **8 par flamme** (×5) | 5 projectiles à **13,5 m/s**, 2,4 s de vie | 2,1 / 1,6 / 1,4 s |
| **Grand revers** | `sweep` | arc 1,0–3,9 m, ±1,32 rad, 0,7 s | 14 (×1,08 dès II) | portée **3,9 × échelle**, cône ±1,32 rad | 1,7 / 1,4 / 1,25 s |

La charge étourdit le boss **0,85 s** sur le joueur, **1,3 s** sur un mur.

**Choix de l'attaque** (`pickAttack`) :

```
distance > 7,2 m et phase ≥ 2 et r < 0,30 → colonne
distance < 4,4 m                          → 55 % frappe, 45 % revers
distance < 9 m                            → 46 % onde, 54 % éventail
distance < 15 m                           → 45 % éventail, 55 % onde
sinon                                     → 50 % charge, 50 % éventail
```

### 10.4 Révélation et mort

- **Révélation** : fondu, poussée de caméra dans la nef de 0,45 à 2,55 s,
  **retour à la position du joueur** de 2,55 à 3,55 s, titre « La cloche sonne /
  L'Officiant descend de l'autel », rugissement, secousse. Fin à 3,6 s
  (`startBossIntro`, `updateIntro`). Avant cette correction, la caméra sautait de
  la nef au joueur en une image (« tp puis éjection »).
- **Mort en trois temps** : chute du corps (2,4 s), extinction des cierges un à
  un, halo et sceau qui s'éteignent ; disparition à 3,5 s avec éclats de verre
  (`boss.js:966-1001`).
- **Butin du boss** : 3 fioles, un étui .308, une boîte 5,56, une trousse et **la
  meilleure arme manquante** (carabine puis fusil d'assaut), en cercle de 1,6 m
  (`dropBoss`).
- **Dépôt à l'apparition** : 9 mm (3,2 ; 6,4), cal. 12 (−3,0 ; 6,6), trousse
  (0,3 ; 9,4), coffre (−4,7 ; 10,4) et caisse (4,7 ; 9,4) à butin explicite
  (`triggerBoss`).

---

## 11. HUD, radar, retours à l'écran

### 11.1 Ce que le HUD affiche

| Zone | Contenu |
|---|---|
| **Haut gauche** | Vague (romain) + hôtes restants (`vivants + en attente`) |
| **Haut centre** | Horloge, jauge de nuit, office + « aube dans H h MM » |
| **Haut droite** | Objectif courant (« Tenir jusqu'à l'aube » / « Abattre … dans la nef ») |
| **Barre de boss** | Nom, **Phase I/II/III**, jauge de PV |
| **Radar** | cadran orienté regard en haut, points par type, nord mobile, « N à vue · M debout · +P » |
| **Bas gauche** | PV (+ max), endurance, fioles |
| **Bas centre** | Arsenal possédé (touche + nom), chargeur / réserve, **pips**, **nombre de chargeurs**, arme + calibre, objet actif, « Rechargement » |
| **Bas droite** | Réserves par calibre (5), trousses, clés, lanternes |
| **Sous le réticule** | Alerte « chargeur vide · R » / « N balles restantes » / « plus de munitions » |
| **Centre** | Réticule qui s'ouvre (`3 + spread × 900`), marqueur de touche (tête = distinct), direction des dégâts, lunette ×2,5 |
| **Transitoires** | Annonces (vague, phase, aube), toasts, popup de butin, succès doré |
| **Bords** | Voile de sang dès que les PV passent sous **45 %** |

Le **HUD passe par `pushHud`** : cap, chargeur et radar y sont donc présents aussi
dans les scènes figées (`?snap=`), ce qui rend les captures reproductibles.

### 11.2 Le radar des morts

- **Portée utile 34 m** ; au-delà le point reste collé au bord ; **au-delà de
  60 m** plus de point du tout (`RADAR_FAR`).
- **14 Hz** (une mise à jour toutes les 70 ms) — assez pour suivre, pas pour
  coûter.
- **Couleurs et formes** : marcheur clair (pastille 6 px), coureur ambre, colosse
  rouge plus grosse (9 px), zélateur violet, **boss = losange doré** (carré 10 px
  tourné à 45°) ; les morts en émergence sont translucides (`style.css:1784-1806`).
- **Nord** : -Z, tourne avec le regard.
- **Compteurs** : « à vue » = points à ≤ 34 m ; « debout » = tous les vivants
  (boss compris) ; « +P » = hôtes pas encore sortis.
- Le cadran passe en alerte (`class="hot"`) dès qu'un mort est à moins de **9 m**.

### 11.3 Ambiance sonore

Cinq bandes locales, une par office (`audio.js:12-18`) : *Deus Culpa* (menu),
*Morthond* (nuit), *The Death Song* (assaut), *War Eternal* (boss), *Excelsis*
(aube). Fondus de 2,2 s ; si les `.ogg` manquent (ils ne sont pas versionnés), la
nappe synthétisée reste seule. Le son démarre muet.

---

## 12. Écrans — menu, pause, inventaire, fin

| Écran | Ouverture | Contenu | Fermeture |
|---|---|---|---|
| **Menu** | au chargement | décor 3D vivant, 4 boutons (Commencer, Réglages, Commandes, Succès) | « Commencer la veille » |
| **Réglages** | bouton menu | 5 réglages + « Réinitialiser », appliqués immédiatement | ✕ / Échap |
| **Commandes** | bouton menu | liste des touches, rappel du ramassage automatique | ✕ / Échap |
| **Succès** | bouton menu + badge `n/18` | 18 fiches, progression, palier bronze/argent/or | ✕ / Échap |
| **Bénédictions** | fin de vague | 3 cartes (touche, icône, nom, tag, description) | 1/2/3, clic, Entrée, **Échap = refus** |
| **Inventaire** | **I** | objets avec quantités et description, objet actif ; **« Armes disponibles »** : fiche cliquable par arme possédée | I / Échap / ✕ |
| **Pause** | **Échap** ou perte de souris | horloge, **objectifs** (objectif, vague, hôtes, boss, clés, légende radar, tombes), réglages, Reprendre / Quitter | Reprendre / Échap |
| **Fin** | victoire, défaite, mort | verdict **L'AUBE / LA NUIT**, heure, raison, citation, **11 statistiques** + succès | Veiller encore / Menu |
| **Chargement** | au boot | jauge, « La nuit se lève… » / « mannequins de secours » | automatique |

**Pause** : la souris perdue ne met en pause que si aucun écran n'est ouvert et
hors d'une fenêtre de grâce de 1,2 à 1,5 s après la fermeture d'un écran
(`canAutoPause`, `lockGrace`). C'est ce qui évite qu'un clic sur une carte de
bénédiction déclenche la pause.

**Inventaire** : `I` met la veille en pause (`freeze`), coupe les entrées et rend
la souris ; l'objet choisi s'utilise ensuite au **clic droit**. Avec « Aucun
objet » (défaut), le clic droit boit une fiole si l'on est blessé (sauf carabine,
où il arme la lunette). Un clic sur une fiche d'arme l'équipe.

**Écran de fin** : 11 lignes — temps tenu, vague atteinte, morts abattus,
précision, tirs à la tête, dégâts encaissés, boss, tombes brisées, fioles bues,
bénédictions, tirs tirés — plus « Succès : n/18 ».

---

## 13. Architecture des fichiers

```
index.html                 DOM complet (menu, HUD, succès, bénédictions, inventaire, pause, fin)
server.py                  statique 127.0.0.1:8131, no-store, file d'écoute 128, POST /api/telemetry
vendor/                    three.module.js + three.core.js (0.186), GLTFLoader, SkeletonUtils
assets/zombies/            z_walker / z_runner / z_brute (.glb riggés, CC0) + CREDITS.md
assets/music/              5 pistes .ogg locales, non versionnées + CREDITS.md

src/core/util.js           RNG déterministe (Mulberry32), maths, roman, heure/office
src/core/input.js          clavier, souris, pointer lock (repli glissé), Échap/R/F
src/core/audio.js          effets synthétisés + musique sur bande (5 pistes)
src/world/textures.js      ~25 textures canvas (pierre, ardoise, vitraux, sang…)
src/world/geo.js           fusion de géométries, murs extrudés à ouvertures
src/world/chapel.js        nef, abside (paroi keepIn), portail, rosace, clocher, mobilier
src/world/graveyard.js     lande, allée, cimetière (tombes 60 PV), clôture, spawnPoints
src/world/sky.js           dôme shader (dégradé, étoiles, lune + halo), MOON_DIR partagé
src/world/menu_stage.js    mise en scène du menu (halos, seuil, brume)
src/fx/post.js             HDR, bright pass, deux flous, ACES, étalonnage, grain
src/fx/volumetrics.js      faisceaux de lune (prismes additifs) + poussière
src/fx/particles.js        impacts, sang, terre, éclats, fumées, flaques
src/entities/player.js     contrôleur FPS (ZASE), arsenal possédé, lanterne, hitscan, mêlée, souffle
src/entities/weapons.js    définitions (9 armes), munitions, paliers, abattage, view-models
src/entities/zombie.js     IA (rodeur/coureur/colosse/zélateur), flammes noires, émergence
src/entities/zombie_glb.js chargement GLB, clones squelettés, clips
src/entities/zombie_rig.js mannequins procéduraux de secours
src/entities/zombie_anim.js poses par articulation (repli sans GLB), courbe d'émergence
src/entities/boss.js       L'Officiant : trois variantes, trois phases, six attaques
src/entities/loot.js       objets au sol, tables de butin, caisses et coffres
src/game/game.js           horloge, vagues, boss, bénédictions, succès, HUD, __diag, snaps
src/game/achievements.js   18 succès, progression, persistance localStorage
src/game/blessings.js      dix bénédictions, tirage pondéré de trois cartes
src/game/telemetry.js      télémétrie de partie (mémoire → POST /api/telemetry, repli localStorage)
src/ui/ui.js               menu, HUD différé, réglages, succès, bénédictions, inventaire, pause, fin
src/ui/style.css           système typographique et mise en page (1 918 lignes)
src/main.js                renderer, post, préchargement GLB, boucle, réglages, __diag, __test
tools/                     cdp.mjs + verify, smoke, shot, playtest, bosstest, zombietest,
                           weaponstest, itemstest, progresstest, featurestest, introtest,
                           audittest, hudtest, loottest, deeptest, bot.js, uiaudit, contrast
shots/                     captures réelles produites par les outils
docs/                      documentation versionnée (FICHE, PROTOCOLE-TEST, ANALYSE, ce guide)
```

Volumétrie indicative (`wc -l`, arbre courant) : `game.js` 1 663, `boss.js` 1 515,
`style.css` 1 918, `weapons.js` 1 148, `player.js` 1 124, `textures.js` 1 003,
`ui.js` 943, `loot.js` 909, `zombie.js` 866, `chapel.js` 811, `audio.js` 672,
`telemetry.js` 193.

### 13.1 Points d'entrée et API publiques

| Objet | Rôle |
|---|---|
| `createWorld(...)` | état de la veille, monde, joueur, butin, boss ; retourne l'API utilisée par `main.js` |
| `startGame({ nightSeconds })` | remise à zéro + entrée en jeu |
| `applySnap(nom)` | scènes figées `?snap=` |
| `world.pauseObjectives()` | lignes d'objectifs de la pause |
| `world.planInfo(n)`, `waveSize(n)`, `difficulty(n)` | lecture des formules de vague (outils et tests) |
| `window.__diag()` | fps moyen/min, erreurs, état, arme, butin, vagues, boss, draws, triangles, GPU, viewport |
| `window.__errors`, `window.__assets` | erreurs console collectées, GLB chargés ou non |
| `window.__test` | pilotage des tests : `start`, `snap`, `aimAt`, `spawn`, `killAll`, `triggerBoss`, `weakenBoss`, `offerBlessing`, `chooseBlessing`, `openInventory`, `inventory`, `pickItem`, `useItem`, `holdMelee`, `headOf`… |
| `window.__world`, `__audio`, `__input` | références directes pour les scripts CDP |

### 13.2 Télémétrie

`src/game/telemetry.js` accumule en mémoire les événements d'une veille (tirs,
touches, dégâts, vagues, boss, coffres, échantillons toutes les 2 s) et **POSTe une
seule fois** à la fin vers `/api/telemetry`. Le rapport est toujours écrit dans
`localStorage` (`vigile.telemetry.last`) avant l'envoi ; si le POST échoue, il y
reste. `server.py` reçoit ce POST : 404 hors `/api/telemetry`, **413** au-delà de
8 Mo, **400** si le JSON est invalide, puis écrit `telemetry/session-<id>.json`
(identifiant assaini, 60 caractères max) et répond `{ "ok": true, "file": … }`.
Le dossier `telemetry/` est ignoré par Git. `python tools/telemetry_report.py` en
tire un bilan (`--write` → `docs/RAPPORT-JEU.md`).

---

## 14. Tableau récapitulatif des valeurs

### 14.1 Joueur

| Valeur | Réglage |
|---|---|
| PV de départ / max | 100 |
| Vitesse marche / sprint | 4,15 / **6,60 m/s** |
| Endurance | 100 ; −24/s au sprint ; +17/s au repos ; sprint si > 2 |
| Saut / gravité | 5,4 m/s / 19,5 m/s² |
| Accélération | 12 au sol, 3,4 en l'air (amorti) |
| Invulnérabilité après un coup | **0,45 s** |
| Hauteur d'œil / rayon | 1,63 m / 0,34 m |
| Portée du tir | 90 m |
| Fioles max | 3 (+1 par « Fiole de plus ») |
| Soins | trousse **+55**, fiole **+35** (+18 si stock plein), vague **+12** |
| Lanterne | intensité 60 (92 avec huile), portée 22 m (30 m avec huile, **30 s**) |

### 14.2 Armes

| Arme | Dégâts | Cadence | Chargeur | Réserve max | Tête × | Abattage |
|---|---:|---:|---:|---:|---:|---:|
| Pistolet Mle 1935 | 30 | 300 c/min | 16 | 240 (9 mm) | 2,6 | 40 % |
| Fusil à pompe Saint-Éloi | 11 × 8 | 73 c/min | 10 | 80 (12) | 1,6 | 32 % |
| PM « Vêpres » | 16 | 800 c/min | 40 | 240 (9 mm) | 2,2 | 26 % |
| Fusil d'assaut « Matines » | 24 | 571 c/min | 40 | 240 (5,56) | 2,6 | 50 % |
| Carabine « Laudes » | 105 | 86 c/min | 10 | 60 (.308) | 2,7 | 75 % |
| Hachette de garde | 62 | 109 c/min | — | — | 2,4 | 35 % |
| Revolver de sacristie | 62 | 136 c/min | 8 | 240 (9 mm) | 2,35 | 55 % |
| Machette de garde | 44 | 167 c/min | — | — | 2,2 | 30 % |
| Lance-grenades de la crypte | 85 (zone 4,4 m) | 57 c/min | 2 | 30 (40 mm) | 1,0 | 0 % |

### 14.3 Morts

| Type | PV (V1 → V12) | Dégâts (V1 → V12) | Vitesse | Rayon |
|---|---|---|---|---|
| Marcheur | 105 → 202 | 16 → 24,8 | 1,95 m/s | 0,36 |
| Coureur | 62 → 119 | 10 → 15,5 | 4,60 m/s | 0,34 |
| Colosse | 310 → 596 | 30 → 46,5 | 1,50 m/s | 0,72 |
| Zélateur | 84 → 161 | 11 → 17,0 (flamme : ×0,55) | 2,15 m/s | 0,34 |

### 14.4 Boss

| Variante | PV | Échelle | `dmgMul` | Frappe / Onde / Charge / Colonne / Flamme / Revers |
|---|---:|---:|---:|---|
| L'Officiant | 1 546 (V5) | 1,00 | 1,00 | 16 / 13 / 16 / 20 / 8 / 14 |
| Le Diacre | 3 164 (V10) | 1,12 | 1,12 | 17,9 / 14,6 / 17,9 / 22,4 / 9,0 / 15,7 |
| L'Abbé noir | 5 301 (V15) | 1,25 | 1,24 | 19,8 / 16,1 / 19,8 / 24,8 / 9,9 / 17,4 |

### 14.5 Vagues et rythme

| Valeur | Réglage |
|---|---|
| Nuit | 480 s, 8 h de jeu |
| Aube | 88 % → 100 % (≈ 05:02 → 06:00) |
| Vague I | 6 hôtes, diff. 1,000 |
| Vague V | 1 hôte + **boss** |
| Vague XII | 29 hôtes, diff. 1,792 |
| Boss | vague V (Officiant), X (Diacre), XV (Abbé noir) |
| Au-delà | 34 → 40 hôtes, diff. jusqu'à 2,8 |
| Intermission | 5,5 s (7 s après la XII) |
| Vivants max | 24 / 28 (gros plans) / 10 (boss vivant) |
| Colosses vivants | 2 (4 dès la IX) |
| Événements | 22 % 2–3 colosses · 10 % Sonneur (PV ×3, échelle ×1,35) |
| Apparition | ~26 m, jamais < 14 m |
| Cadence d'apparition | 0,45 s (0,36 s dès la X) ; plans : 0,42 / 0,38 / 0,34 |
| Soin de vague | +12 PV |

### 14.6 Économie

| Valeur | Réglage |
|---|---|
| Boîtes | 9 mm 14 · cal. 12 6 · 5,56 18 · .308 5 · 40 mm 3 |
| Réserves max | 240 / 80 / 240 / 60 / 30 (40 mm) |
| Tombes | 60 PV ; 42 % butin rare, sinon 1 hôte épargné |
| Coffres | 4 verrouillés (1 clé chacun) + 8 caisses |
| Coffre | 3 à 7 pièces (arme comprise), 5 cachets, arme 5 à 55 % selon cachet |
| Clés / trousses / lanternes max | 9 / 6 / 6 |
| Arme en butin | 0 → 9,5 % selon la vague, ×2,3 colosse |

---

## 15. Écarts documentation ↔ code

Relevés pendant la rédaction, **non corrigés** (ce guide ne modifie aucun fichier
source). Les numéros de ligne sont omis pour les fichiers en cours de
modification : le texte cité suffit à retrouver la ligne.

| # | Où | Ce qui est écrit | Ce que fait le code |
|---|---|---|---|
| 1 | `docs/PROTOCOLE-TEST.md` § 5.1 | Vague V : **8 hôtes** | `waveSize(5) = 1` (`plan.size = 0,12`) : **1 hôte + boss** |
| 2 | `docs/FICHE.md` § 2 | Zélateur : flamme **16,5 m/s**, **85 %** des dégâts | **11,5 m/s**, **×0,55** (`zombie.js:465`) |
| 3 | `game.js` (`ITEM_DEFS`) | Trousse : « Rend **45 PV** » | `useMedkit` soigne **55** (`loot.js`) |
| 4 | `game.js` (`ITEM_DEFS`) | Lanterne : « **22 s** de lumière large » | `boostLantern(30)` → **30 s** (`loot.js`) |
| 5 | `weapons.js` (PM) | « **Trente** coups » | Chargeur **40** |
| 6 | `weapons.js` (fusil d'assaut) | « **trente** coups » | Chargeur **40** |
| 7 | `weapons.js` (carabine) | « **Cinq** balles lourdes » | Chargeur **10** |
| 8 | `weapons.js` (revolver) | « **Sept** balles lourdes » | Chargeur **8** |
| 9 | `player.js` (en-tête) | « arsenal (**6 armes**) » | **9 armes** (`WEAPONS`) |
| 10 | `loot.js` (commentaire) | Clé 4 %, rien 21,5 % | Seuils réels : clé **6 %**, rien **16 %** |
| 11 | `README.md` § 4 | Architecture sans `src/game/telemetry.js` | Module présent, branché et servi par `server.py` |
| 12 | `docs/FICHE.md` § 2, `README.md` § 3 | Revolver « **7** coups lourds » | Chargeur **8** |
| 13 | `README.md` § 3, `docs/FICHE.md` § 2 | « huit armes », « les six autres se ramassent » | **Neuf** armes : lance-grenades de la crypte, palier 2 |
| 14 | `achievements.js` | « Tirer avec les huit armes » | Objectif `bestWeapons = 8` alors que l'arsenal en compte **9** (le succès reste atteignable) |
| 15 | `game.js` (événement) | Annonce « **Le Sonneur** — un colosse marche devant les autres » | Le type du premier mort **n'est pas forcé** : l'élite (PV ×3) peut être un marcheur ou un coureur |
| 16 | `weapons.js` (lance-grenades) | Portée « 8–26 m · 90 % », reprise dans `docs/ARBITRAGE.md` | `splashFire` n'appelle **pas** `damageAtDistance` : la chute déclarée n'est pas appliquée |

Les lignes 1 à 14 sont des **commentaires, descriptions d'interface ou tableaux de
documentation** restés en arrière d'une passe d'équilibrage ; les lignes **15 et
16** sont des **comportements à arbitrer**. Corriger les unes demande de modifier
`game.js`, `weapons.js` ou les docs ; corriger les autres demande une décision de
jeu, puis une passe dédiée avec `node tools/weaponstest.mjs` et
`node tools/verify.mjs` en preuve.

---

## 16. Vérifier — citer les tests

La recette complète est dans **`docs/PROTOCOLE-TEST.md`** (prérequis, scénarios
manuels, grille de difficulté, reproductibilité). Les scripts qui font foi :

| Script | Ce qu'il prouve |
|---|---|
| `node tools/verify.mjs` | 8 scènes + playtest + bosstest, `failures: 0` attendu |
| `node tools/playtest.mjs` | un bot joue : menu, marche, tir, rechargement, pause, fin |
| `node tools/bosstest.mjs` | apparition, dégâts, phase II, mort du boss |
| `node tools/zombietest.mjs` | émergence (sous le sol → debout), articulations, GLB, fps |
| `node tools/weaponstest.mjs` | les armes, munitions typées, mêlée, mire |
| `node tools/itemstest.mjs` | ramassage auto, inventaire, clic droit, abattage par arme |
| `node tools/progresstest.mjs` | armes ramassées, paliers, plans de vague, zélateur, musique |
| `node tools/featurestest.mjs` | 18 succès + bénédictions, persistance |
| `node tools/introtest.mjs` | révélation du boss (fondu, caméra, reprise) |
| `node tools/audittest.mjs` | collisions, filet anti-chute, butin derrière un mur, éclairage |
| `node tools/hudtest.mjs` | radar (points devant/derrière/gauche/droite) et lecture des munitions |
| `node tools/loottest.mjs` | variété des coffres sur 600 tirages |
| `node tools/deeptest.mjs` | un bot joue une veille entière → `tools/reports/deep-*.json` |
| `node tools/uiaudit.mjs`, `contrast.mjs` | débordements DOM ; contraste WCAG mesuré |

Dernier état publié (`README.md` § 5) : `verify` 0 échec, `playtest` 24/24,
`bosstest` 8/8, `weaponstest` 71/71, `itemstest` 15/15, `progresstest` 41/41,
`zombietest` 39/39, `featurestest` 22/22, `introtest` 7/7, `audittest` 17/17,
`hudtest` 19/19, `loottest` 13/13.

---

*Document rédigé pour le joueur et le développeur. Toute valeur modifiée dans
`src/` doit être répercutée ici : les sections 4, 8, 9, 10 et 14 sont les plus
sensibles. Vérifier ensuite avec `node tools/verify.mjs`, puis mettre à jour
`docs/FICHE.md` si la passe change le jeu.*
