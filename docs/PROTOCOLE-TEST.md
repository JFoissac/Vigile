---
titre: PROTOCOLE DE TEST — Vigile v2
projet: Vigile-v2
role: Recette du gameplay — tests automatisés, protocole manuel cochable, grille de difficulté vague par vague, reproductibilité.
version: 1.0
date: 2026-10-22
statut: actif
---

# PROTOCOLE DE TEST — Vigile v2

Ce document sert à décider, **preuves en main**, si une version de Vigile v2 est jouable et
expédiable. Il se lit dans l'ordre : prérequis, serveur, tests automatisés, puis recette
manuelle du gameplay. La grille de difficulté et la section reproductibilité se remplissent
**pendant** la passe manuelle, pas après.

- **Passe automatisée** : ≈ 6 minutes hors `deeptest` (8 à 10 min pour une veille entière).
- **Passe manuelle complète** : 75 à 100 minutes, montre et souris en main.
- **Règle de base** : un test qui affiche `FAIL` est un échec, même si le script continue.
  Un test qui ne s'exécute pas (exception, page non prête) est un échec, pas un « non concluant ».
- **Rien n'est validé sur une impression.** Chaque point manuel indique quoi regarder et, quand
  c'est utile, la valeur mesurable à relever dans la console (`window.__diag()`).

## 0. Conventions

| Élément | Convention |
|---|---|
| Identifiants | `M` mise en route · `D` déplacement/collisions · `T` tir/mire · `A` armes/munitions · `L` butin/coffres · `V` vagues/boss · `H` HUD/radar · `P` pause/inventaire · `R` réglages/audio · `F` fin de partie · `X` performances |
| Case | `- [ ]` à cocher ; en cas d'échec, noter l'identifiant, la capture et le `__diag()` |
| Console | `F12` → onglet Console → `window.__diag()`. Ouvrir la console **libère le pointeur** : recliquer dans la vue pour le recapturer |
| Version testée | `git rev-parse --short HEAD` + date, à inscrire en tête de la fiche de relevé (§ 6.6) |
| Captures | Toujours dans `shots/`, jamais retouchées ; relues en crop natif |

## 1. Prérequis

| Élément | Requis | Vérification |
|---|---|---|
| Système | Windows 11 (machine de référence) | — |
| Navigateur | Chrome stable, WebGL2 | `chrome://gpu` : « WebGL2: Hardware accelerated » |
| Chemin Chrome | `C:/Program Files/Google/Chrome/Application/chrome.exe` | sinon exporter `CHROME_PATH` |
| Python | 3.10+ (serveur statique, bibliothèque standard seulement) | `python --version` |
| Node | ≥ 22 (WebSocket natif requis par `tools/cdp.mjs` ; mesuré sur 25.5) | `node -v` |
| Écran | 1600 × 900 minimum, fenêtre 1600 × 900 | `window.__diag().viewport` |
| Dépendances | **aucune** : pas de `npm install`, aucun CDN, aucun accès réseau au chargement | — |
| Audio | muet au démarrage ; les 5 pistes `.ogg` sont optionnelles et non versionnées | `assets/music/` peut être vide |
| Charge machine | fermer jeux, rendus, navigateurs lourds | les fps varient de ±30 % avec la charge |

**État local à connaître** (localStorage, aucun compte, aucune synchronisation) :

| Clé | Contenu | Remise à zéro |
|---|---|---|
| `vigile.settings.v2` | sensibilité, volume, FOV, qualité, inversion Y | `localStorage.removeItem('vigile.settings.v2')` |
| `vigile.audio.muted` | `1` muet / `0` sonore | `localStorage.removeItem('vigile.audio.muted')` |
| `vigile.succes.v1` | 18 succès et leur progression | `localStorage.removeItem('vigile.succes.v1')` |

Pour une passe « comme à la première ouverture » : `localStorage.clear()` puis `F5`.
Cela efface aussi les succès : le signaler si la passe doit vérifier leur persistance.

**Commandes** (rappel ; le panneau « Commandes » du menu les reprend) :

| Touche | Action |
|---|---|
| `Z` `A` `S` `E` / flèches | marcher — `Z` avant, `A` gauche, `S` arrière, `E` droite |
| `Maj` | sprint (consomme l'endurance) |
| `Espace` | sauter |
| Clic gauche | tirer, ou frapper à la lame |
| Clic droit | utiliser l'objet actif ; à défaut, boire une fiole si blessé, sinon viser à la lunette |
| Molette, `1`…`8` | changer d'arme (armes possédées seulement) |
| `R` | recharger (munitions par calibre) |
| `I` | inventaire — met la veille en pause |
| `H` / `L` / `G` | trousse de soin / lanterne / fiole de lumière |
| `F` | éteindre ou rallumer la lanterne |
| `1` `2` `3` / `Échap` | choisir une bénédiction / la refuser (fin de vague) |
| `M` ou 🔊/🔇 | couper ou rétablir tout le son |
| `Échap` | pause, réglages, reprise |

## 2. Lancer le serveur

```bash
cd vigile
python server.py 8131
# attendu : Vigile v2 — http://127.0.0.1:8131/  (racine : dossier du dépôt)
```

Puis ouvrir `http://127.0.0.1:8131/`.

- **Contrôle de vie** : `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8131/` doit rendre `200`.
- **Arrêt** : `Ctrl+C` dans le terminal du serveur.
- **Port occupé** : `netstat -ano | findstr :8131`, tuer le processus fautif, ou lancer
  `python server.py 8132` **et** exporter `VIGILE_URL=http://127.0.0.1:8132/` pour les tests.
- **Ne jamais ouvrir `index.html` en `file://`** : les modules ES et l'import map exigent HTTP.
- Le serveur envoie `Cache-Control: no-store` : après modification d'un module, un simple `F5`
  suffit. Ne pas ajouter de query string aux imports.
- La file d'écoute est à 128 : c'est volontaire, Chrome ouvre une vingtaine de connexions pour
  les modules. Un `ERR_CONNECTION_REFUSED` intermittent en headless signale un serveur mal lancé.

## 3. Tests automatisés

### 3.1 Règles d'exécution

1. Serveur lancé (§ 2), terminal **dans** la racine du dépôt.
2. Lancer chaque script séparément, depuis la racine du dépôt.
3. **Sans terminal interactif** (tâche de fond, CI), ajouter `< /dev/null` : sans entrée standard,
   `verify` sort en code 1 au lieu de mesurer.
4. Chaque script ouvre son propre Chrome `--headless=new --use-angle=d3d11 --enable-gpu
   --mute-audio`, puis le referme. Aucune fenêtre, aucun son sur la machine.
5. **Code de sortie 0 = réussite.** Un code non nul ou une exception Node est un échec.
6. Lire la **dernière ligne** : elle donne le compte de contrôles (`24/24`, `failures: 0`, etc.).
7. Les captures sont écrites dans `shots/` ; ne pas les supprimer avant la revue visuelle.

### 3.2 Tableau des scripts

| Script | Commande | Ce qu'il prouve | Critère de réussite | Durée indicative |
|---|---|---|---|---|
| **verify** | `node tools/verify.mjs` | 8 scènes figées (menu, menu sans HUD, vague III, vague III sans HUD, boss, nef, aube, perf 26 morts) : chargement, 0 erreur console, fps/draws/triangles, captures ; puis `playtest` et `bosstest` en sous-processus | `failures: 0` et code 0 ; 8 PNG produits | 90–180 s |
| **playtest** | `node tools/playtest.mjs` | un bot joue vraiment via CDP : clic sur « Commencer », audio muet puis `M`, marche avant, apparition de morts, un tir consomme une balle, dégâts tuent, rechargement, pause/reprise, écran de fin à l'aube, 12 lignes de statistiques | `24/24`, code 0 | 40–60 s |
| **bosstest** | `node tools/bosstest.mjs` | apparition du boss, barre dédiée, dégâts, phase II sous 50 %, mort enregistrée, objectif mis à jour, barre masquée | `8/8`, code 0 | 25–45 s |
| **zombietest** | `node tools/zombietest.mjs` | émergence (main puis corps), articulations, GLB chargés, repli procédural, fps avec 26 morts | `"checks": 39`, `"ok": true`, code 0 | 60–100 s |
| **weaponstest** | `node tools/weaponstest.mjs` | les 8 armes, modèles, munitions typées, mêlée, dégâts/tirs à la tête, butin d'armes, cohérence des fiches | `71/71`, code 0 | 60–120 s |
| **itemstest** | `node tools/itemstest.mjs` | ramassage automatique, inventaire (`I`), clic droit objet, molette, taux d'abattage à la tête (~40 % pistolet, ~8 % sur colosse) | `15/15`, code 0 | 40–80 s |
| **featurestest** | `node tools/featurestest.mjs` | 18 succès, bandeau, panneau, persistance localStorage ; bénédictions (3 cartes, choix, refus) | `22/22`, code 0 | 40–80 s |
| **introtest** | `node tools/introtest.mjs` | révélation du boss : fondu, caméra dans la nef, gel puis reprise, boss debout | `7/7`, code 0 | 25–50 s |
| **progresstest** | `node tools/progresstest.mjs` | armes ramassées, paliers de butin, mire alignée sur le réticule, gestes de mêlée, plans de vague, zélateur et flamme noire, bénédiction sans pause parasite, musique | `41/41`, code 0 | 60–120 s |
| **audittest** | `node tools/audittest.mjs` | collisions (murs ouest/est/façade, portail), filet anti-chute, 8 morts non encastrés, butin derrière un mur non ramassé, éclairage mesuré (nuit/nef/aube) | `"checks": 17`, `"failures": 0`, code 0 | 50–90 s |
| **hudtest** | `node tools/hudtest.mjs` | radar (taille, place sous le bloc de vague, points devant/derrière/gauche/droite, 4 classes de morts), munitions (pips, chargeurs, alerte de chargeur vide), fps | `19/19`, code 0 | 30–50 s |
| **loottest** | `node tools/loottest.mjs` | variété des coffres sur 600 tirages : ≥ 4 cachets, aucun cachet > 35 %, 3 à 7 objets, aucun objet garanti, armes 10–55 %, caisse 1–4 objets, arme de palier 1 possible dès la vague I | `13/13`, code 0 | 15–30 s |
| **deeptest** | `node tools/deeptest.mjs --name=expert` | un bot joue **une veille entière** et rend un rapport JSON : vagues, PV, munitions, butin, coffres, contrôles radar/munitions du HUD | `done: true`, `hudRadar` et `hudAmmo` à 0 écart, code 0 | 8–10 min (`--night=480`) |
| **smoke** | `node tools/smoke.mjs wave3` | une scène : page prête, fps réels, 0 erreur, capture | `ready: true`, `pageErrors: []`, PNG `shots/smoke-wave3.png` | 10–20 s |
| **uiaudit** | `node tools/uiaudit.mjs` | débordements et chevauchements du HUD, panneau Réglages, écran de fin | `out: []`, `fits: true`, `statsCount: 12`, `statsInView: true`, `overflowX: false` | 20–35 s |
| **contrast** | `node tools/contrast.mjs` | contraste WCAG 2.1 mesuré sur les 13 textes du menu (seuil 4,5:1, 3:1 au-delà de 24 px) | `echecs: 0`, code 0 | 20–40 s |

`verify` est le **seuil de porte** : s'il passe, les scènes, le jeu de base et le boss tiennent.
Les autres scripts couvrent chacun un système ; ils ne se remplacent pas.

### 3.3 Les 8 scènes de `verify`

| Scène | URL | Ce qu'elle doit montrer |
|---|---|---|
| `menu` | `?snap=menu` | menu complet, décor 3D vivant, lune, halo, étoiles |
| `menu` (sans HUD) | `?snap=menu` + masquage DOM | décor seul, sans aucun widget |
| `wave3` | `?snap=wave3` | vague III, HUD, morts + zélateur |
| `wave3` (sans HUD) | `?snap=wave3` + masquage DOM | lisibilité de la scène sans interface |
| `boss` | `?snap=boss` | boss en phase II, barre dédiée |
| `nave` | `?snap=nave` | nef seule, sans HUD (contrôle « pas de scène blanche ») |
| `dawn` | `?snap=dawn` | aube, HUD, ciel réchauffé |
| `perf` | `?snap=perf` | 26 morts vivants, mesure de charge maximale |

Chaque scène doit rendre `errors: 0` et une capture dans `shots/`. Les fps et le nombre de
draw calls sont **journalisés** mais pas assertés par `verify` : les comparer au tableau § 4.10.

### 3.4 `deeptest` — le bot qui joue une veille

```bash
node tools/deeptest.mjs --name=expert --skill=0.92 --turn=8   --head=0.95
node tools/deeptest.mjs --name=moyen  --skill=0.62 --turn=4.2 --head=0.6 --night=180
node tools/deeptest.mjs --name=novice --skill=0.35 --turn=2.6 --head=0.35
```

| Option | Sens | Défaut |
|---|---|---|
| `--name=` | nom du rapport, fichier `tools/reports/deep-<name>.json` | `expert` |
| `--skill=` | qualité de décision (0 à 1) | `0.92` |
| `--turn=` | vitesse de rotation de visée, rad/s | `8` |
| `--head=` | proportion de visées à la tête | `0.95` |
| `--reaction=` | délai de réaction, secondes | `0.1` |
| `--night=` | durée de la nuit en secondes | `480` |
| `--max=` | délai maximal du script, secondes | `night + 90` |
| `--port=` | port de debug Chrome | aléatoire 9900–9990 |

Le bot pilote **les mêmes entrées que le joueur** (`window.__input` : touches, tir,
rechargement) ; il n'a aucun accès privilégié au moteur. Il choisit ses armes, boit ses
trousses, ramasse le butin et journalise vague par vague.

**Lecture du rapport** :

- `done` et `result` : la veille est allée au bout (`victory`, `reason`, `wave`, `kills`, `hp`,
  `clock`, `accuracy`, `damageTaken`) ;
- `hud.radarBad` / `hud.radarChecks` et `hud.ammoBad` / `hud.ammoChecks` : **doivent être à 0** ;
  ce sont les seuls contrôles automatisés du radar et de la lecture des munitions en conditions
  de jeu réel ;
- `waves[]` : par vague, `dur`, `hpLost`, `kills`, `loot`, `ammoSpent`, `alive` ;
- `outcomes` : ce que les tirs ont touché (`enemy:head`, `enemy:body`, `stone`, `ground`) ;
- `bands` : précision par tranche de distance (0–12, 12–25, 25–40, 40+ m) ;
- `caches[]` : chaque coffre ouvert, avec son cachet et son contenu réel ;
- `errors` et `botErrors` : doivent être vides.

> Piège de lecture : `waves[].plan` est relevé à la **clôture** de la vague ; il peut déjà porter
> le nom du plan suivant (décalage d'un cran observé). Pour le plan réellement joué, se fier à
> `diag.plan` ou à l'annonce du HUD.

Codes de sortie : `0` veille terminée, `1` page non prête, `2` veille non terminée dans le délai.

### 3.5 État mesuré le 22/10/2026

Relevé sur l'arbre de travail à cette date (une passe de rééquilibrage du butin, du HUD et des vagues était en cours).
**Ces valeurs ne remplacent pas un nouveau passage** : elles disent où en est le dépôt.

| Script | Résultat | Commentaire |
|---|---|---|
| `verify` | `failures: 0` | 8 scènes, 0 erreur ; scène `perf` à 79 i/s de moyenne, 40 i/s au minimum sur machine chargée |
| `playtest` | `24/24` | — |
| `bosstest` | `8/8` | — |
| `zombietest` | `39` contrôles, `ok: true` | — |
| `weaponstest` | **70/71** | échec « le coffre recrache au moins quatre objets » : mesuré 6 → 9, soit 3 objets. Le tirage peut rendre 3 (3 ou 4 de base). Critère historique à mettre à jour (≥ 3), ou tirage à garantir à 4 |
| `itemstest` | `15/15` | — |
| `featurestest` | `22/22` | — |
| `introtest` | `7/7` | — |
| `progresstest` | `41/41` | — |
| `audittest` | `17` contrôles, `failures: 0` | — |
| `hudtest` | `19/19` | script corrigé depuis : il passe par l'arme réelle. Les 3 écarts du relevé précédent venaient de l'écriture directe de `p.state.ammo` suivie de `syncState()`, qui réécrit la valeur depuis le chargeur |
| `loottest` | `13/13` | coffres 3–7 objets, caisses 1–4, arme de palier 1 possible dès la vague I |
| `deeptest --night=45` | `done: true` | 169 contrôles radar et 169 contrôles munitions, 0 écart, 0 erreur |
| `uiaudit` | `out: []`, `rows: 5`, `statsCount: 12`, `overflowX: false` | — |
| `contrast` | `echecs: 0` | 13 textes du menu au-dessus du seuil |

**Écarts de documentation constatés** (à trancher, ne pas les compter comme échecs de gameplay) :

1. Le panneau **Commandes** du menu liste encore « `E` — Ouvrir un coffre ou une caisse ».
   Or `E` est la droite du ZASE et les caisses s'ouvrent **au passage** ; aucun binding
   d'interaction n'existe. Le testeur se fie au comportement, pas à cette ligne.
2. Le README dit « victoire = aube **et** boss mort ». Le code accorde aussi la victoire si
   **aucun boss n'a été déclenché** (nuit courte). Avec la nuit par défaut, le boss tombe
   forcément avant l'aube : la nuance ne se voit qu'en passe accélérée.

## 4. Protocole manuel de gameplay

### 4.0 Mise en route

Ouvrir Chrome, une seule fenêtre, `http://127.0.0.1:8131/`, idéalement en 1600 × 900.
Pour une passe rapide, utiliser `http://127.0.0.1:8131/?night=120` (nuit de 2 min) ;
pour la passe de recette, garder la nuit par défaut (8 min).

- [ ] **M-01 · Chargement du menu**
  - Geste : ouvrir l'URL, chronométrer jusqu'à l'affichage du menu.
  - Attendu : menu complet en ≈ 1 à 3 s, décor 3D vivant (lune, halo, étoiles), aucun écran blanc.
  - Constat : chrono à la main ; la console ne doit rien afficher (`window.__errors` vide).

- [ ] **M-02 · Options du menu**
  - Geste : lire les quatre entrées.
  - Attendu : « Commencer la veille », « Réglages », « Commandes », « Succès 0/18 ».
  - Constat : une seule option marquée à la fois au clavier ; le survol marque aussi.

- [ ] **M-03 · Navigation clavier**
  - Geste : `↓` `↓` puis `↑`, valider par `Entrée` sur « Commandes ».
  - Attendu : la sélection suit, `Entrée` ouvre le panneau, `✕` ou `Échap` le referme.
  - Constat : le panneau affiche la liste des touches ; aucun élément ne déborde.

- [ ] **M-04 · Démarrage d'une veille**
  - Geste : `Échap` pour fermer, sélectionner « Commencer la veille », `Entrée`.
  - Attendu : HUD visible, annonce « Vêpres · 22:00 / Tenez jusqu'à l'aube », pointeur capturé.
  - Constat : si la capture échoue, l'invite « Cliquez pour capturer la souris » s'affiche ;
    un clic dans la vue suffit.

- [ ] **M-05 · État initial**
  - Geste : lire le HUD sans bouger.
  - Attendu : PV 100, endurance pleine, pistolet 12 / 72 (6 chargeurs), vague I, 6 hôtes,
    horloge 22:00 · Vêpres, objectif « Tenir jusqu'à l'aube », radar à 0.
  - Constat : `window.__diag().hp`, `.ammo`, `.reserve`, `.wave`, `.clock` doivent concorder.

### 4.1 Déplacement et collisions

- [ ] **D-01 · Avancer (`Z`)**
  - Geste : maintenir `Z` une seconde en terrain dégagé, face à la chapelle.
  - Attendu : déplacement continu d'environ 4 m (vitesse de marche 4,15 m/s), caméra stable.
  - Constat : `__diag().pos.z` diminue d'environ 4 unités ; aucun à-coup.

- [ ] **D-02 · Gauche et droite (`A`, `E`)**
  - Geste : `A` puis `E`, sans tourner la souris.
  - Attendu : pas latéral à gauche puis à droite, la caméra ne pivote pas.
  - Constat : le décor glisse latéralement ; `pos.x` change, `yaw` ne change pas.

- [ ] **D-03 · Reculer (`S`)**
  - Geste : maintenir `S`.
  - Attendu : recul sans retournement de la caméra ; vitesse comparable à l'avance.
  - Constat : `pos.z` augmente ; on voit toujours devant soi.

- [ ] **D-04 · Secours clavier**
  - Geste : refaire D-01 à D-03 avec les **flèches**, puis avec les codes physiques `KeyA`/`KeyD`.
  - Attendu : mêmes déplacements (tolérance AZERTY/QWERTY).
  - Constat : aucune touche ne déclenche autre chose (pas de saut, pas d'inventaire).

- [ ] **D-05 · Sprint et endurance (`Maj`)**
  - Geste : `Maj` + `Z` pendant 5 s, puis relâcher et attendre.
  - Attendu : vitesse ≈ 6,6 m/s ; l'endurance descend en ≈ 4 s, le sprint se coupe à 0 ;
    elle remonte en ≈ 6 s (17 points/s) ; pas de sprint sans endurance.
  - Constat : barre d'endurance sous les PV ; chronométrer la vidange et la remontée.

- [ ] **D-06 · Saut (`Espace`)**
  - Geste : sauter sur place, puis en marchant.
  - Attendu : montée franche, retombée au sol, pas de vol, pas de traversée de plafond.
  - Constat : la caméra monte puis redescend ; `pos.y` revient au sol.

- [ ] **D-07 · Murs de la chapelle**
  - Geste : pousser contre le mur ouest, le mur est, puis la façade sud hors du portail.
  - Attendu : blocage net à ≈ 6,42 m (ouest/est) et ≈ 12,87 m (façade) ; jamais dans la pierre ;
    la caméra ne traverse pas.
  - Constat : `audittest` mesure ces valeurs ; à l'œil, on s'arrête sans vibrer ni pénétrer.

- [ ] **D-08 · Portail**
  - Geste : entrer et sortir par le portail central (`x ≈ 0`, `z ≈ 11,5`).
  - Attendu : passage libre dans les deux sens, sans blocage latéral.
  - Constat : on traverse l'ouverture sans être poussé sur les montants.

- [ ] **D-09 · Mobilier, piliers, stèles, arbres**
  - Geste : longer les piliers de la nef, les bancs, les stèles du cimetière, les arbres morts.
  - Attendu : contournement, pas d'encastrement, pas de passage au travers.
  - Constat : aucun tremblement ; on ne ressort pas de l'autre côté d'un pilier.

- [ ] **D-10 · Filet anti-chute**
  - Geste : en console, `window.__world.player.teleport(0, -50)` (outil de test).
  - Attendu : le joueur est remonté à `y ≈ 0,35`, vivant, sans erreur.
  - Constat : `__diag().pos.y` et `.hp` ; reprise normale de la marche.

- [ ] **D-11 · Tenue de caméra**
  - Geste : marcher, sprinter, sauter, tirer.
  - Attendu : tête qui bouge légèrement, FOV qui s'ouvre au sprint, pas de tremblement permanent.
  - Constat : subjectif, mais noter toute gêne (nausée, oscillation) : c'est un défaut de recette.

### 4.2 Tir et mire

- [ ] **T-01 · Tir au pistolet**
  - Geste : clic gauche sur un mur, à 5 m.
  - Attendu : départ de coup, flamme/son, impact et poussière sur la pierre ; 12 → 11 balles.
  - Constat : compteur de munitions et pips diminuent d'un cran.

- [ ] **T-02 · Alignement de la mire**
  - Geste : viser le centre d'une dalle à 10 m et tirer.
  - Attendu : l'impact tombe **dans le réticule** (canon sous le réticule, ligne de mire alignée).
  - Constat : marque d'impact visible au centre ; pas d'écart systématique d'un côté.

- [ ] **T-03 · Ouverture du réticule**
  - Geste : tirer plusieurs coups, puis sprinter.
  - Attendu : le réticule s'ouvre au tir et en mouvement, se referme au repos.
  - Constat : écartement des quatre traits ; la dispersion réelle suit l'ouverture.

- [ ] **T-04 · Marqueur de touche**
  - Geste : tirer sur un mort, puis sur un mur.
  - Attendu : marqueur de touche sur le mort ; rien sur le mur.
  - Constat : croix blanche brève au centre ; le son diffère.

- [ ] **T-05 · Tir à la tête**
  - Geste : viser le haut du crâne d'un rodeur (au-dessus de 79 % de sa hauteur) au pistolet.
  - Attendu : 2 tirs suffisent (30 × 2,6 = 78 par balle, 105 PV) ; l'abattage net (~40 % au
    pistolet) peut le tuer au premier ; chute immédiate.
  - Constat : le compteur `headshots` augmente dans les statistiques de fin ; le corps tombe net.

- [ ] **T-06 · Tir au corps**
  - Geste : tirer au torse d'un rodeur.
  - Attendu : 4 balles de pistolet (30 × 4 = 120 > 105 PV) ; pas d'abattage net.
  - Constat : compter les impacts ; le mort encaisse avant de tomber.

- [ ] **T-07 · Pas de tir à travers les murs**
  - Geste : se placer derrière un mur, un mort de l'autre côté, tirer.
  - Attendu : impact sur le mur, aucun dégât, aucun marqueur de touche.
  - Constat : le mort reste intact et continue sa route.

- [ ] **T-08 · Lunette de la carabine**
  - Geste : avec la carabine et l'objet actif « aucun », clic droit ; re-clic droit.
  - Attendu : lunette × 2,5, FOV resserré, réticule masqué ; sortie propre au second clic.
  - Constat : masque circulaire et graduations ; le tir à la lunette reste aligné.

- [ ] **T-09 · Clic droit avec un objet actif**
  - Geste : choisir « Trousse de soin » dans l'inventaire, fermer, clic droit.
  - Attendu : la trousse est consommée (soin), **la lunette ne s'arme pas**.
  - Constat : PV remontent ; aucune vue télescopique.

- [ ] **T-10 · Dispersion**
  - Geste : 5 tirs rapides sur un mur à 15 m, à l'arrêt ; puis 5 tirs en sprint.
  - Attendu : groupement serré à l'arrêt, nettement plus large en sprint.
  - Constat : comparer les impacts ; la dispersion doit rester lisible, pas aléatoire au point
    de rendre la visée inutile.

- [ ] **T-11 · Mêlée**
  - Geste : hachette, clic gauche sur un rodeur à bout portant ; puis machette.
  - Attendu : geste vertical pour la hachette, revers latéral pour la machette ; pas de munitions ;
    dégâts en une frappe (hachette 62, machette 44).
  - Constat : animation distincte et lisible ; le mort recule ou tombe.

### 4.3 Armes et munitions

- [ ] **A-01 · Arsenal de départ**
  - Geste : ouvrir `I`, lire « Armes disponibles » ; puis molette.
  - Attendu : **deux** armes seulement — pistolet Mle 1935 (touche 1) et hachette de garde
    (touche 6) ; deux cases dans le HUD ; la molette n'alterne qu'entre elles.
  - Constat : aucune autre fiche ; la note indique les armes restant à trouver.

- [ ] **A-02 · Armes possédées seulement**
  - Geste : essayer `2`, `4`, `8` au clavier, puis la molette dans les deux sens.
  - Attendu : les touches des armes non possédées ne font rien ; la molette boucle sur les
    armes possédées, dans l'ordre des touches.
  - Constat : le nom d'arme du HUD ne montre jamais une arme absente.

- [ ] **A-03 · Ramassage d'une arme**
  - Geste : tuer un mort ou ouvrir un coffre jusqu'à obtenir une arme, marcher dessus.
  - Attendu : arme au sol avec modèle et halo de rareté ; au passage, elle rejoint l'arsenal
    avec **deux chargeurs** ; une case apparaît dans le HUD ; toast « Arme trouvée ».
  - Constat : `I` montre la nouvelle fiche ; la molette l'atteint.

- [ ] **A-04 · Fiche d'arme**
  - Geste : lire une fiche dans « Armes disponibles ».
  - Attendu : touche, calibre, dégâts, multiplicateur de tête, puissance en points, **taux
    d'abattage à la tête**, munitions disponibles.
  - Constat : valeurs cohérentes avec le tableau ci-dessous ; un clic équipe l'arme et
    rafraîchit la fiche sans fermer l'inventaire.

| Arme | Touche | Calibre | Chargeur | Dégâts | Tête × | Abattage tête | Rechargement |
|---|---|---:|---:|---:|---:|---:|---:|
| Pistolet Mle 1935 | 1 | 9 mm | 12 | 30 | 2,6 | 40 % | 1,35 s |
| Fusil à pompe Saint-Éloi | 2 | cal. 12 | 8 | 11 × 8 grains | 1,6 | 32 % | 2,45 s |
| PM « Vêpres » | 3 | 9 mm | 30 | 16 | 2,2 | 26 % | 1,70 s |
| Fusil d'assaut « Matines » | 4 | 5,56 | 30 | 24 | 2,6 | 50 % | 2,00 s |
| Carabine « Laudes » | 5 | .308 | 5 | 105 | 2,7 | 75 % | 2,60 s |
| Hachette de garde | 6 | lame | — | 62 | 2,4 | 35 % | — |
| Revolver de sacristie | 7 | 9 mm | 7 | 62 | 2,35 | 55 % | 2,15 s |
| Machette de garde | 8 | lame | — | 44 | 2,2 | 30 % | — |

- [ ] **A-05 · Rechargement (`R`)**
  - Geste : tirer 3 coups, presser `R` ; refaire à chargeur plein.
  - Attendu : geste propre à l'arme (glissière, pompe, chargeur, verrou, barillet) ; durée du
    tableau ; compteur rempli depuis la réserve ; `R` à chargeur plein ne fait rien.
  - Constat : le libellé « Rechargement » s'affiche, le tir est bloqué pendant le geste.

- [ ] **A-06 · Munitions par calibre**
  - Geste : tirer au pistolet, passer au PM (même 9 mm), puis au fusil d'assaut (5,56),
    à la carabine (.308), au fusil à pompe (cal. 12).
  - Attendu : quatre réserves indépendantes ; le HUD affiche les quatre calibres et leurs
    quantités ; une arme de mêlée n'a ni chargeur ni réserve.
  - Constat : vider le 9 mm ne touche pas au 5,56 ; les compteurs du bas du HUD concordent.

- [ ] **A-07 · Chargeur vide**
  - Geste : vider le chargeur sans recharger, puis cliquer gauche.
  - Attendu : alerte sous le réticule « chargeur vide · R », panneau de munitions en état
    `empty`, clic sans coup ; message si la réserve est vide aussi.
  - Constat : l'alerte est lisible sans quitter le centre de l'écran.

- [ ] **A-08 · Lecture des chargeurs**
  - Geste : pistolet 12 / 72.
  - Attendu : 12 traits (un par balle), 7 allumés pour 7 balles, « 6 chargeurs » (72 / 12).
  - Constat : `#ammo-pips i`, `#ammo-mags`, `#ammo`, `#ammo-res` dans le DOM.

- [ ] **A-09 · Armes de mêlée**
  - Geste : passer à la hachette puis à la machette.
  - Attendu : aucune munition affichée, pas de rechargement possible, coup au clic gauche,
    portée courte (il faut être au contact).
  - Constat : le HUD masque le bloc de munitions ou l'annote « lame ».

- [ ] **A-10 · Panne sèche**
  - Geste : vider toutes les réserves de balles (ou utiliser `__test.setGod(true)` pour tenir).
  - Attendu : plus aucun tir à distance ; seules les lames restent ; message explicite quand
    le chargeur et la réserve sont vides.
  - Constat : la veille devient une affaire de mêlée — c'est le comportement voulu, pas un bug.

### 4.4 Butin et coffres

- [ ] **L-01 · Ramassage au passage**
  - Geste : marcher sur une boîte de munitions, une trousse, une fiole, une clé, une lanterne.
  - Attendu : ramassage automatique à ≈ 1,15 m, bandeau ou popup, quantités mises à jour.
  - Constat : aucun appui de touche ; le halo disparaît avec l'objet.

- [ ] **L-02 · Ligne de vue**
  - Geste : tourner autour d'un mur pour passer derrière ; viser un objet de l'autre côté.
  - Attendu : pas de ramassage à travers la pierre ; du bon côté, ramassage immédiat.
  - Constat : `audittest` le mesure ; à l'œil, l'objet reste au sol tant qu'on est derrière.

- [ ] **L-03 · Caisse**
  - Geste : s'approcher à ≈ 1,85 m d'une caisse.
  - Attendu : ouverture **automatique**, sans touche ; 1 à 4 objets (arme rare, 10 %) ; popup « Caisse ouverte ».
  - Constat : le contenu tombe autour et se ramasse en marchant ; la caisse vidée s'enfonce.

- [ ] **L-04 · Coffre**
  - Geste : ouvrir un coffre.
  - Attendu : 3 à 7 objets, cachet thématique (armurerie, soins, sacristie, reliques, pillage),
    rareté affichée (commun / rare / très rare) ; popup listant **tout** le contenu.
  - Constat : renouveler sur 4 ou 5 coffres : les contenus ne se répètent pas à l'identique.

- [ ] **L-05 · Coffre verrouillé**
  - Geste : s'approcher d'un coffre sans clé, puis avec une clé en poche.
  - Attendu : sans clé, message indiquant la clé de la sacristie et le coffre reste fermé ;
    avec une clé, ouverture immédiate et **une clé consommée**.
  - Constat : compteur de clés dans le HUD et dans la pause ; le coffre ne s'ouvre pas deux fois.

- [ ] **L-06 · Disparition des caisses vidées**
  - Geste : vider une caisse puis reculer et revenir.
  - Attendu : la caisse s'enfonce et disparaît ; aucun coffre ouvert ne traîne.
  - Constat : plus de halo, plus de collision visuelle, plus de popup.

- [ ] **L-07 · Popup non écrasé**
  - Geste : ouvrir un coffre puis marcher sur des munitions dans les 2 s.
  - Attendu : le popup du coffre reste affiché (fenêtre de calme de 1,6 s) ; les munitions
    ordinaires ne le remplacent pas.
  - Constat : le titre « Coffre ouvert » et sa liste restent lisibles.

- [ ] **L-08 · Tombes destructibles**
  - Geste : tirer deux balles dans une stèle (ou un coup de lame).
  - Attendu : la tombe se brise ; soit butin rare (~42 % : .308, clé, fiole, 5,56), soit
    « 1 hôte de moins à la prochaine vague ». Le compteur apparaît dans la pause et dans
    l'annonce de vague.
  - Constat : toast explicite ; le nombre d'hôtes annoncés à la vague suivante est réduit.

- [ ] **L-09 · Variété des coffres**
  - Geste : ouvrir 5 coffres de suite et noter cachet, ordre et contenu.
  - Attendu : 3 à 7 objets par coffre, au moins 4 combinaisons différentes ; le premier objet
    change ; aucun objet n'est garanti à chaque fois.
  - Constat : `loottest` mesure ces bornes sur 600 tirages (une fois son bug corrigé).

- [ ] **L-10 · Paliers d'armes**
  - Geste : noter les armes trouvées par vague (butin, caisses, coffres, récompense de vague).
  - Attendu : palier 1 (pompe, revolver) possible dès la vague I en coffre ; palier 2 (PM,
    machette) à partir de la III ; palier 3 (fusil d'assaut) à partir de la V ; palier 4
    (carabine) à partir de la VIII. Sur les morts : 0 % à la vague I, puis 3 %, 4,5 %, 7 %,
    9,5 % ; les colosses ont 2,3 fois plus de chances d'en lâcher une.
  - Constat : tenir le tableau § 5.4 ; une arme de palier 4 à la vague II est un défaut.

### 4.5 Vagues et boss

- [ ] **V-01 · Première vague**
  - Geste : laisser la veille démarrer, observer l'annonce et l'émergence.
  - Attendu : « Vague I · Les errants », 6 hôtes, 100 % ; une main perce le sol, puis le corps
    se hisse (monticule, mottes, poussière, secousse, grognement) ; invulnérable pendant
    l'émergence, aucune attaque.
  - Constat : les tirs pendant la hisse ne font pas de dégâts.

- [ ] **V-02 · Composition des plans**
  - Geste : jouer jusqu'à la vague IV au moins, noter les types.
  - Attendu : vague II majorité de coureurs ; vague III premiers colosses ; vague IV premiers
    zélateurs (ils gardent leurs distances et lancent une flamme noire télégraphiée par un
    brûle-parfum qui s'embrase) ; vague V le boss, vague VI la horde.
  - Constat : le zélateur tourne autour du joueur ; sa flamme voyage à ≈ 11,5 m/s, se brise
    sur les murs et frappe pour 55 % de ses dégâts.

- [ ] **V-03 · Fin de vague et bénédiction**
  - Geste : nettoyer une vague.
  - Attendu : « Vague nettoyée · +12 PV », trois cartes de bénédiction, partie **figée** ;
    `1`/`2`/`3` ou clic pour choisir, `Échap` pour refuser ; reprise sans pause parasite.
  - Constat : l'effet de la bénédiction est visible (dégâts, cadence, PV max, rechargement,
    tête, vitesse, défense, mêlée, munitions, fiole).

- [ ] **V-04 · Montée de difficulté**
  - Geste : comparer les annonces de vague.
  - Attendu : +7,2 % par vague (plafond ×2,8), taille annoncée conforme au tableau § 5.1 ;
    les hôtes frappent plus fort et certains plans les rendent plus rapides.
  Constat : noter le pourcentage annoncé ; il doit suivre 100, 107, 114, 122, 129…

- [ ] **V-05 · Plafonds de population**
  - Geste : compter les morts debout au pic d'une horde, puis les colosses.
  - Attendu : 24 vivants au plus (28 seulement pour un plan de taille ≥ 1,4, donc après la
    vague XII) ; **deux colosses vivants au maximum**, plafond relevé à quatre à partir de la
    vague IX (`bruteCap` dans `src/game/game.js`) ; plus de mur de cinq gros (plafond porté à 4 colosses simultanés en fin de veille).
  - Constat : radar « debout » et comptage visuel ; un troisième colosse avant la IX est un défaut.

- [ ] **V-06 · Boss de la vague V**
  - Geste : atteindre la vague V.
  - Attendu : cloche, annonce, **révélation cinématique** (fondu, caméra dans la nef, titre),
    sceau au sol animé, chape d'épaules, crosse à cierge, aura ; barre dédiée
    « L'Officiant · Phase I ».
  - Constat : à la vague V l'annonce dit « L'Officiant » et le boss apparaît immédiatement ;
    le nom du plan et le boss doivent coïncider.

- [ ] **V-07 · Phases du boss**
  - Geste : descendre la barre à 50 %, puis à 25 %.
  - Attendu : phase II à 50 % (annonce « tombe le masque », 3 coureurs en renfort) ; phase III
    à 25 % (rugissement, 4 renforts, cadence accrue, colonne de lumière du vitrail).
  - Constat : nom et phase dans la barre ; `__diag().boss.phase` suit.

- [ ] **V-08 · Six attaques télégraphiées**
  - Geste : laisser le boss attaquer, noter chaque attaque.
  - Attendu : frappe au sol, onde de choc, charge, colonne de lumière, éventail de flammes,
    grand revers ; chacune est annoncée au sol ou par un arc/ligne avant de frapper.
  - Constat : cocher les six au fil du combat ; une attaque non télégraphiée est un défaut
    de lisibilité (§ 5.5).

- [ ] **V-09 · Le boss ne sort plus le joueur de l'église**
  - Geste : se placer dos à l'abside, encaisser une frappe ou une charge.
  - Attendu : le joueur reste dans la nef (paroi `keepIn`), aucun recul forcé ne l'éjecte.
  - Constat : on ne se retrouve jamais dehors, ni dans la pierre.

- [ ] **V-10 · Mort du boss**
  - Geste : achever le boss.
  - Attendu : mort en trois temps, extinction des cierges, barre masquée, objectif redevenu
    « Tenir jusqu'à l'aube », `bossesKilled` incrémenté ; une arme peut être lâchée.
  - Constat : la nef reste jouable après la mort ; les vagues reprennent.

- [ ] **V-11 · Boss suivants**
  - Geste : si la veille dure, atteindre la vague X puis XV.
  - Attendu : **Le Diacre** (+60 % PV, plus grand) à la X, **L'Abbé noir** (+120 % PV) à la XV ;
    mêmes six attaques, PV accrus.
  - Constat : `__diag().bossVariant` et le nom dans la barre.

- [ ] **V-12 · Aube**
  - Geste : atteindre 06:00.
  - Attendu : ciel, brume et étalonnage se réchauffent, cloches, musique d'aube ; si le boss
    est mort (ou n'a jamais été déclenché), victoire ; s'il est encore debout, défaite.
  - Constat : `__diag().dawn`, `.clock`, `.victory` ; l'écran de fin doit correspondre.

- [ ] **V-13 · Au-delà de douze assauts**
  - Geste : continuer après la vague XII (nuit longue ou `?night=600`).
  - Attendu : « La nuit s'acharne », plus de plan nommé, composition mixte et dense.
  - Constat : l'annonce change ; le jeu ne plante pas.

### 4.6 HUD et radar

- [ ] **H-01 · PV**
  - Geste : encaisser un coup.
  - Attendu : chiffre et barre baissent, flash rouge/vignette, indicateur de direction.
  - Constat : `__diag().hp` concorde avec le chiffre affiché.

- [ ] **H-02 · Endurance**
  - Geste : sprinter puis s'arrêter.
  - Attendu : barre dédiée qui se vide et se remplit, sans clignotement erratique.
  - Constat : cohérence avec D-05.

- [ ] **H-03 · Vague et hôtes restants**
  - Geste : tuer des morts.
  - Attendu : « Vague III · 8 hôtes » diminue à chaque mort, passe au plan suivant à la clôture.
  - Constat : le compteur ne reste pas bloqué, ne descend pas sous zéro.

- [ ] **H-04 · Horloge et office**
  - Geste : observer le bloc horaire pendant une nuit accélérée (`?night=120`).
  - Attendu : 22:00 → 06:00, Vêpres → Matines → Laudes, cloches aux heures, jauge vers l'aube.
  - Constat : le temps de jeu est cohérent avec `nightT / nightDur` ; pas de saut d'heure.

- [ ] **H-05 · Objectif**
  - Geste : lire la ligne « Objectif » avant et pendant le boss.
  - Attendu : « Tenir jusqu'à l'aube », puis « Abattre L'Officiant dans la nef ».
  - Constat : la pause reprend le même objectif.

- [ ] **H-06 · Munitions**
  - Geste : tirer, recharger, changer d'arme.
  - Attendu : compteur `chargeur / réserve`, pips, nombre de chargeurs, calibre ; alerte
    « chargeur vide · R » sous le réticule ; état `low` quand la réserve est basse.
  - Constat : `#ammo`, `#ammo-res`, `#ammo-pips`, `#ammo-mags`, `#ammo-alert`.

- [ ] **H-07 · Radar**
  - Geste : tourner sur place avec des morts devant, derrière, à gauche, à droite.
  - Attendu : cadran de 132 × 154 sous le bloc de vague, sans chevauchement ; un mort devant
    est **en haut**, derrière **en bas**, à droite **à droite** ; quatre classes de points
    (rodeur, coureur, colosse, zélateur) ; « à portée » compte les morts ≤ 34 m, « debout »
    tous les vivants ; au-delà de 34 m le point reste collé au bord et s'estompe ; le `N`
    tourne avec le regard.
  - Constat : `hudtest` mesure la géométrie et les quatre directions ; à l'œil, le point
    devant soi doit être au-dessus du centre.

- [ ] **H-08 · Dégâts directionnels**
  - Geste : être frappé de dos, de flanc, de face.
  - Attendu : indicateur orienté vers la source, secousse brève, pas de flash permanent.
  - Constat : l'orientation correspond au mort qui frappe.

- [ ] **H-09 · Annonces, toasts, succès**
  - Geste : provoquer une annonce de vague, un toast de butin, un succès.
  - Attendu : annonce centrée lisible, toast discret, bandeau doré pour un succès ; rien ne
    se superpose au réticule.
  - Constat : les textes ne se chevauchent pas ; ils disparaissent seuls.

- [ ] **H-10 · Fioles et objet actif**
  - Geste : ramasser une fiole, choisir un objet actif.
  - Attendu : compteur de fioles visible ; ligne « Objet · nom · clic droit » sous le nom
    de l'arme.
  - Constat : l'objet actif survit au changement d'arme ; « aucun » masque la ligne.

- [ ] **H-11 · Barre de boss**
  - Geste : pendant le combat.
  - Attendu : nom, phase, barre qui descend ; masquée à la mort.
  - Constat : la barre ne reste pas vide à l'écran après la victoire.

### 4.7 Pause et inventaire

- [ ] **P-01 · Pause (`Échap`)**
  - Geste : `Échap` en pleine vague.
  - Attendu : monde figé (morts immobiles, horloge arrêtée), panneau de pause, pointeur libéré.
  - Constat : attendre 5 s : aucun mort ne bouge, aucun dégât n'est encaissé.

- [ ] **P-02 · Objectifs de la pause**
  - Geste : lire le panneau.
  - Attendu : six lignes — Objectif, Vague, Hôtes, Boss, Clés, Tombes brisées — avec les
    valeurs courantes (hôtes debout + en attente, prochain boss, clés en poche, hôtes épargnés).
  - Constat : les valeurs concordent avec le HUD et l'inventaire.

- [ ] **P-03 · Réglages et sortie de pause**
  - Geste : modifier un réglage dans la pause, « Reprendre la veille » ; puis « Quitter vers le menu ».
  - Attendu : réglage appliqué immédiatement ; reprise sans perte d'état ; retour au menu propre.
  - Constat : « Réinitialiser » remet les valeurs par défaut.

- [ ] **P-04 · Inventaire (`I`)**
  - Geste : `I` en jeu.
  - Attendu : écran d'inventaire, veille en pause, objets avec quantités, objet actif,
    « Armes disponibles » avec une fiche par arme possédée, note « N armes encore à trouver ».
  - Constat : `#inventory` visible, `#inv-list`, `#inv-weapons`, `#inv-weapons-note` renseignés.

- [ ] **P-05 · Équiper une arme depuis l'inventaire**
  - Geste : cliquer une fiche d'arme.
  - Attendu : l'arme s'équipe, la fiche active change, l'inventaire reste ouvert.
  - Constat : le nom d'arme et les munitions du HUD sont à jour en fermant.

- [ ] **P-06 · Objet actif au clic droit**
  - Geste : choisir trousse, fiole, lanterne, clé ; fermer `I` ; clic droit.
  - Attendu : trousse +55 PV, fiole +35 PV, lanterne 30 s de lumière large, clé ouvre un coffre
    verrouillé ; l'objet est consommé et le compteur baisse.
  - Constat : PV, lumière ou coffre changent ; pas d'effet si l'objet est à zéro.

- [ ] **P-07 · Repli du clic droit**
  - Geste : objet actif « aucun », être blessé, clic droit ; puis avec la carabine.
  - Attendu : boit une fiole si blessé ; sinon arme la lunette ; avec la carabine, la lunette
    est prioritaire.
  - Constat : le HUD indique l'objet actif ; aucune consommation sans blessure.

- [ ] **P-08 · Reprise sans pause parasite**
  - Geste : fermer l'inventaire (`I` ou `✕`), puis bouger et tirer dans les 2 s.
  - Attendu : la veille reprend, ne se remet pas en pause à cause de la libération du pointeur.
  - Constat : pas de retour au panneau de pause après la fermeture.

- [ ] **P-09 · Capture du pointeur**
  - Geste : `Échap` (libère), cliquer dans la vue.
  - Attendu : invite « Cliquez pour capturer la souris » quand le pointeur est libre ; clic =
    capture ; la visée reprend.
  - Constat : le réticule ne bouge plus avec le bureau.

### 4.8 Réglages et audio

- [ ] **R-01 · Panneau Réglages**
  - Geste : menu → « Réglages ».
  - Attendu : cinq lignes — Sensibilité (0,25–2,2), Volume (0–1), Champ de vision (60–95),
    Qualité (Basse/Moyenne/Haute), Inverser l'axe vertical (Non/Oui) — et « Valeurs par défaut ».
  - Constat : `uiaudit` compte 5 lignes et vérifie qu'elles tiennent dans l'écran.

- [ ] **R-02 · Sensibilité**
  - Geste : régler au minimum puis au maximum, faire le même geste de souris.
  - Attendu : rotation nettement plus lente puis plus rapide, sans à-coup.
  - Constat : appliqué immédiatement, sans redémarrage.

- [ ] **R-03 · Volume**
  - Geste : son activé (`M`), baisser le volume à 0 puis remonter.
  - Attendu : extinction puis retour progressif ; le bouton 🔊/🔇 reste cohérent.
  - Constat : pas de saturation ; le volume 0 équivaut au silence.

- [ ] **R-04 · Champ de vision**
  - Geste : FOV 60 puis 95.
  - Attendu : vue resserrée puis large, HUD inchangé, arme toujours alignée.
  - Constat : le réticule reste au centre ; pas de déformation du view-model.

- [ ] **R-05 · Qualité**
  - Geste : Basse, Moyenne, Haute.
  - Attendu : Basse coupe le bloom et réduit la résolution interne (0,78) ; Moyenne = 1 ;
    Haute = jusqu'à 1,5 et ombres 2048 ; le jeu reste jouable dans les trois.
  - Constat : comparer netteté, halos et fps (§ 4.10) ; aucune scène blanche ou noire.

- [ ] **R-06 · Inversion verticale**
  - Geste : « Oui », puis bouger la souris vers le haut.
  - Attendu : la vue descend ; « Non » rétablit le comportement standard.
  - Constat : appliqué immédiatement.

- [ ] **R-07 · Persistance des réglages**
  - Geste : modifier sensibilité, FOV et qualité, recharger `F5`.
  - Attendu : valeurs conservées (`vigile.settings.v2`) ; le menu s'ouvre avec ces valeurs.
  - Constat : `localStorage.getItem('vigile.settings.v2')` contient les valeurs choisies.

- [ ] **R-08 · Silence au démarrage**
  - Geste : ouvrir le jeu sans toucher à rien.
  - Attendu : **aucun son** ; bouton 🔇 ; `__diag().audio` n'est pas `running`.
  - Constat : `!document.getElementById('btn-sound').getAttribute('aria-pressed')` au départ.

- [ ] **R-09 · Touche `M` et bouton son**
  - Geste : `M`, puis clic sur 🔊/🔇, puis `F5`.
  - Attendu : `M` active/coupe tout ; le bouton reflète l'état (`aria-pressed`) ; la préférence
    survit au rechargement (`vigile.audio.muted`).
  - Constat : le son ne revient pas tout seul après un rechargement si on l'avait coupé.

- [ ] **R-10 · Musique et offices**
  - Geste : écouter menu, nuit, assaut, boss, aube (si `assets/music/*.ogg` est présent).
  - Attendu : Deus Culpa (menu), Morthond (nuit), The Death Song (assaut), War Eternal (boss),
    Excelsis (aube) ; fondus de 2,2 s ; sans fichiers, repli silencieux sans erreur.
  - Constat : le changement de piste suit l'état (assaut/accalmie) ; `M` coupe aussi la musique.

### 4.9 Fin de partie

- [ ] **F-01 · Mort du joueur**
  - Geste : se laisser tuer.
  - Attendu : écran « LA NUIT », raison, citation, statistiques, boutons ; le HUD disparaît.
  - Constat : `#end` visible, `#end-verdict` = « LA NUIT ».

- [ ] **F-02 · Aube sans boss**
  - Geste : `?night=60`, ne pas atteindre la vague V, tenir jusqu'au bout.
  - Attendu : « L'AUBE » (aucun boss déclenché) ; cas de la passe accélérée uniquement.
  - Constat : `__diag().bossSpawned` = false, `.victory` = true.

- [ ] **F-03 · Aube avec boss mort**
  - Geste : tuer le boss puis tenir jusqu'à 06:00.
  - Attendu : « L'AUBE », raison « L'aube s'est levée sur un Vigile encore debout. ».
  - Constat : `bossesKilled` = 1 (ou plus) dans les statistiques.

- [ ] **F-04 · Aube avec boss vivant**
  - Geste : laisser le boss en vie jusqu'à 06:00.
  - Attendu : « LA NUIT », raison « Le jour se lève. L'Officiant est toujours dans la nef. ».
  - Constat : la barre de boss est encore là au moment de l'écran de fin.

- [ ] **F-05 · Statistiques**
  - Geste : lire les lignes de fin.
  - Attendu : Temps tenu, Vague atteinte, Morts abattus, Précision, Tirs à la tête, Dégâts
    encaissés, Boss, Tombes brisées, Fioles bues, Bénédictions, Tirs tirés, Succès — soit
    12 lignes avec la ligne Succès.
  - Constat : `#end-stats .stat` ; `uiaudit` en attend 12, toutes dans l'écran.

- [ ] **F-06 · Relancer**
  - Geste : « Veiller encore », puis « Retour au menu ».
  - Attendu : nouvelle veille remise à zéro (vague I, PV 100, arsenal de départ) ; retour au
    menu sans état résiduel.
  - Constat : les compteurs repartent de zéro ; aucun mort ne réapparaît.

- [ ] **F-07 · Succès persistants**
  - Geste : débloquer un succès, revenir au menu, ouvrir « Succès », recharger `F5`.
  - Attendu : bandeau doré en jeu ; panneau avec progression (bronze/argent/or) ; total 18 ;
    persistance (`vigile.succes.v1`).
  - Constat : le badge du menu passe de `0/18` à `1/18` et le reste après rechargement.

- [ ] **F-08 · Absence de sauvegarde de veille**
  - Geste : `F5` en pleine veille.
  - Attendu : retour au menu, veille perdue — comportement assumé (pas de sauvegarde).
  - Constat : à noter comme limite, pas comme régression.

### 4.10 Performances

Mesurer avec la fenêtre en 1600 × 900, qualité Haute, sur la machine de référence
(RTX 3080 via ANGLE/D3D11). Relever `__diag().fps`, `.fpsMin`, `.drawCalls`, `.triangles`.
Les valeurs varient de ±30 % avec la charge : comparer, ne pas conclure sur un seul échantillon.

| Scène | Commande / URL | Référence i/s moyen | Référence i/s min | Draw calls | Triangles |
|---|---|---:|---:|---:|---:|
| Menu | `?snap=menu` | 245 | 103 | 327 | 76 290 |
| Vague III (HUD, 10 morts + zélateur) | `?snap=wave3` | 125 | 78 | 421 | 297 196 |
| Boss (HUD, phase II) | `?snap=boss` | 158 | 94 | 472 | 165 938 |
| Nef sans HUD | `?snap=nave` | 250 | 133 | 374 | 141 257 |
| Aube | `?snap=dawn` | 244 | 159 | 380 | 97 906 |
| Perf, 26 morts | `?snap=perf` | 112 | 73 | 531 | 815 180 |

- [ ] **X-01 · Menu**
  - Geste : `?snap=menu`, attendre 3 s, lire `__diag()`.
  - Attendu : moyenne ≥ 60 i/s ; décor vivant ; pas d'erreur.
  - Constat : noter moyenne, min, draws, triangles.

- [ ] **X-02 · Vague III**
  - Geste : `?snap=wave3`, attendre 3 s.
  - Attendu : moyenne ≥ 60 i/s, HUD complet, 10 morts + zélateur visibles.
  - Constat : comparer aux 125 i/s de référence.

- [ ] **X-03 · Boss**
  - Geste : `?snap=boss`, attendre 3 s.
  - Attendu : moyenne ≥ 60 i/s, barre de boss, phase II.
  - Constat : les attaques du boss ne doivent pas faire chuter durablement les fps.

- [ ] **X-04 · Charge maximale (26 morts)**
  - Geste : `?snap=perf`, attendre 7 s.
  - Attendu : moyenne ≥ 60 i/s (référence 112, min 73) ; pas de famine mémoire ni d'erreur.
  - Constat : si la moyenne tombe sous 60 sur la machine de référence, c'est un défaut ;
    sur une autre machine, noter la valeur et la comparer.

- [ ] **X-05 · Effet de la qualité**
  - Geste : rejouer X-02 en `?q=low`.
  - Attendu : fps supérieurs ou égaux, bloom absent, image plus molle, jeu toujours jouable.
  - Constat : `__diag().quality` = `low` ; pas de scène blanche.

- [ ] **X-06 · Stabilité**
  - Geste : jouer 2 minutes d'affilée, puis vérifier la console.
  - Attendu : `window.__errors` vide, aucune erreur console, pas de fuite de fps continue.
  - Constat : `__diag().fps` reste dans la même enveloppe ; pas de saccade périodique.

- [ ] **X-07 · Captures**
  - Geste : relire les captures de `shots/` produites par la passe.
  - Attendu : images non retouchées, lisibles, HUD net ; crops natifs pour les détails.
  - Constat : `vision_analyze` sur les crops ; jamais une capture upscalée.

## 5. Grille de notation de difficulté

### 5.1 Valeurs de référence des vagues

Taille = `round(clamp(round(5 + (n−1) × 1,6), 1, 32) × facteur du plan)`. Difficulté =
`1 + (n−1) × 0,072`, plafond ×2,8. **Instantané du code au 22/10/2026** : si `WAVE_PLANS`
change dans `src/game/game.js`, recalculer la colonne « Hôtes » avant de noter la grille.

| Vague | Plan | Hôtes | Difficulté | Particularité |
|---|---|---:|---:|---|
| I | Les errants | 6 | 1,00 | rodeurs seuls |
| II | La meute | 7 | 1,07 | 45 % de coureurs, +5 % vitesse |
| III | L'ossuaire | 8 | 1,14 | premiers colosses (12 %) |
| IV | La procession | 11 | 1,22 | premiers zélateurs (30 %) |
| V | L'Officiant | 8 | 1,29 | **boss : L'Officiant** |
| VI | La horde | 16 | 1,36 | 25 % plus nombreux, apparition 0,42 |
| VII | La traque | 17 | 1,43 | coureurs/zélateurs, +12 % vitesse, apparition 0,42 |
| VIII | Le siège | 17 | 1,50 | colosses 18 %, +10 % dégâts |
| IX | L'office noir | 22 | 1,58 | quatre types, 4 colosses possibles dès ici |
| X | La marée | 25 | 1,65 | 50 % coureurs, +18 % vitesse, apparition 0,38 — **boss : Le Diacre** |
| XI | Le chevalet | 22 | 1,72 | colosses 20 %, +15 % dégâts |
| XII | La dernière veille | 29 | 1,79 | mix complet, +10 % vitesse, +20 % dégâts |
| XIII+ | La nuit s'acharne | 34+ | ≥ 1,86 | composition fixe, plus de nom de plan ; plafond ×2,8 |

### 5.2 Ce qu'on relève à chaque vague

À remplir **pendant** la vague, pas de mémoire :

1. **Horloge de début et de fin** (HUD) et durée réelle au chronomètre.
2. **Hôtes annoncés** (annonce de vague) et **pic simultané** (radar « debout », ou comptage visuel).
3. **Composition observée** : rodeurs / coureurs / colosses / zélateurs, et nombre de colosses au pic.
4. **PV au début et à la fin** (pause ou `__diag().hp`), donc PV perdus.
5. **Munitions dépensées** : réserve par calibre avant/après (HUD ou pause).
6. **Fioles bues**, **trousses utilisées**, **morts du joueur** (0 ou 1).
7. **Bénédiction choisie** (ou refusée) et son effet.
8. **Incident** : mort coincé, attaque illisible, chute de fps, chevauchement de HUD, coffre
   inaccessible.
9. **Notes 1–5** de pression et de lisibilité (§ 5.3).

### 5.3 Barème

**Pression ressentie (1–5)** — à quel point la vague menace la survie :

| Note | Ancre |
|---:|---|
| 1 | Aucune menace : on peut rester immobile, aucun dégât. |
| 2 | Pression diffuse : quelques contacts, PV perdus < 10 %. |
| 3 | Pression réelle : il faut reculer, recharger, soigner ; 1 fiole buse, 10–30 % de PV perdus. |
| 4 | Tension : plusieurs fronts, 2 fioles, 30–60 % de PV perdus, un mort évité de peu. |
| 5 | Survie en jeu : mort probable sans bénédiction ni terrain, > 60 % de PV perdus. |

**Lisibilité (1–5)** — peut-on lire la menace et réagir :

| Note | Ancre |
|---:|---|
| 1 | Menace invisible ou instantanée : on meurt sans comprendre. |
| 2 | Télégraphes confus, silhouettes indistinctes, HUD saturé. |
| 3 | Lisible avec effort : quelques attaques surprennent. |
| 4 | Claire : chaque type se distingue, les attaques s'annoncent. |
| 5 | Exemplaire : on pourrait expliquer chaque mort à voix haute. |

**Verdict de vague** : `trop facile` (pression ≤ 2 et zéro mort sur deux passes), `juste`
(pression 3–4, 0–1 mort, 1–2 fioles), `trop dur` (pression 5 ou ≥ 2 morts, ou vague non
terminée). Cible de la veille : majorité de `juste`, aucun `trop dur` avant la vague VIII.

### 5.4 Grille à remplir

| V | Plan | Hôtes ann. | Pic debout | Types vus | Durée | PV perdus | Munitions | Fioles | Morts | Pression /5 | Lisibilité /5 | Verdict |
|---|---|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---|
| I |  |  |  |  |  |  |  |  |  |  |  |  |
| II |  |  |  |  |  |  |  |  |  |  |  |  |
| III |  |  |  |  |  |  |  |  |  |  |  |  |
| IV |  |  |  |  |  |  |  |  |  |  |  |  |
| V |  |  |  |  |  |  |  |  |  |  |  |  |
| VI |  |  |  |  |  |  |  |  |  |  |  |  |
| VII |  |  |  |  |  |  |  |  |  |  |  |  |
| VIII |  |  |  |  |  |  |  |  |  |  |  |  |
| IX |  |  |  |  |  |  |  |  |  |  |  |  |
| X |  |  |  |  |  |  |  |  |  |  |  |  |
| XI |  |  |  |  |  |  |  |  |  |  |  |  |
| XII |  |  |  |  |  |  |  |  |  |  |  |  |

Armes trouvées, vague par vague (palier attendu § 4.3 / L-10) :

| V | Arme trouvée | Source (mort / caisse / coffre / récompense) | Palier attendu | Conforme |
|---|---|---|---|---|
| I |  |  | palier 1 possible en coffre (pompe, revolver) |  |
| II |  |  | palier 1 |  |
| III |  |  | + palier 2 (PM) |  |
| IV |  |  | + palier 2 (machette) |  |
| V |  |  | + palier 3 (fusil d'assaut) et récompense de boss |  |
| VI–IX |  |  | palier 3 |  |
| X–XII |  |  | + palier 4 (carabine, dès la VIII) |  |

### 5.5 Boss

| Boss | Vague | PV max affichés | Phase II atteinte à | Phase III atteinte à | Attaques vues (1–6) | Temps de kill | PV perdus | Fioles | Morts | Lisibilité /5 |
|---|---:|---:|---|---|---|---:|---:|---:|---:|---:|
| L'Officiant | V |  |  |  |  |  |  |  |  |  |
| Le Diacre | X |  |  |  |  |  |  |  |  |  |
| L'Abbé noir | XV |  |  |  |  |  |  |  |  |  |

PV max = `1200 × difficulté × (1 + 0,6 × (variante − 1))` ; variante 1, 2, 3.
Cocher les six attaques : frappe au sol · onde de choc · charge · colonne de lumière ·
éventail de flammes · grand revers. Une attaque non télégraphiée fait tomber la lisibilité à 2.

### 5.6 Synthèse de la veille

| Indicateur | Valeur |
|---|---|
| Vague atteinte / 12 |  |
| Durée réelle |  |
| Morts abattus |  |
| Précision |  |
| Tirs à la tête |  |
| Dégâts encaissés |  |
| Boss vaincus |  |
| Tombes brisées |  |
| Fioles bues |  |
| Bénédictions |  |
| Pression moyenne (vagues jouées) |  |
| Nombre de `trop dur` |  |
| Verdict global |  |

Règle de décision : une veille est **calibrée** si la pression moyenne est comprise entre 2,8
et 4,0, si aucun `trop dur` n'apparaît avant la vague VIII et si le boss de la vague V tombe
en 60 à 150 s avec 1 à 3 fioles. En dehors de ces bornes, ouvrir un ticket de réglage
(taille, cadence, dégâts, vitesse) plutôt que « durcir » à l'aveugle.

## 6. Reproductibilité

### 6.1 Cadre fixe

| Paramètre | Valeur de recette |
|---|---|
| Résolution | 1600 × 900, `deviceScaleFactor: 1` |
| Fenêtre | `--window-size=1600,900` |
| Mode headless | `--headless=new` pour **tous** les scripts |
| GPU | `--use-angle=d3d11 --enable-gpu --ignore-gpu-blocklist` |
| Audio | `--mute-audio` (scripts) ; manuel : muet au démarrage |
| Horloge | `--disable-background-timer-throttling --disable-renderer-backgrounding` |
| Navigateur | Chrome stable ; noter la version (`chrome://version`) |
| Machine | noter CPU, GPU, RAM, charge ; les fps varient de ±30 % |

Les scripts fixent déjà tout cela dans `tools/cdp.mjs`. Pour une passe manuelle, utiliser la
même taille de fenêtre et le même facteur d'échelle (100 % dans Windows), sinon les mesures
de HUD et de fps ne sont pas comparables.

### 6.2 Scènes et paramètres d'URL

| Paramètre | Effet | Usage |
|---|---|---|
| `?snap=menu` | menu figé, décor vivant | captures, comparaison visuelle |
| `?snap=wave3` | vague III (morts + zélateur) | HUD, fps, lisibilité |
| `?snap=emerge` | émergence | contrôle des poses |
| `?snap=boss` | boss en phase II | barre, fps, attaques |
| `?snap=bossclose` | gros plan du boss | portrait, anatomie |
| `?snap=nave` | nef seule | éclairage, « pas de scène blanche » |
| `?snap=dawn` | aube | étalonnage, HUD, victoire |
| `?snap=perf` | 26 morts | charge maximale |
| `?night=120` | nuit de 2 minutes | passe rapide, boss difficile à atteindre |
| `?q=low|medium|high` | qualité forcée | mesures comparatives |

Les scènes figées servent à **comparer deux versions** : même URL, même taille, même qualité,
puis différence visuelle et `__diag()`.

### 6.3 Graine et variabilité

Le monde utilise un RNG déterministe initialisé à `20261102` (`makeRng`). Une **page rechargée**
repart de la même séquence ; en revanche, chaque action du joueur consomme des tirages
(butin, spawns, tombes), donc deux parties humaines ne sont jamais identiques. Conséquences :

- un **script** qui rejoue les mêmes entrées dans le même ordre obtient les mêmes tirages ;
- une **passe humaine** est reproductible dans ses *conditions*, pas dans ses *contenus* ;
- pour comparer deux builds sur le butin, utiliser `loottest` (600 tirages, graines fixes) ou
  `deeptest` avec les mêmes options, pas deux parties à la main.

### 6.4 Rejeu en trois niveaux

1. **Scène** (30 s) : `node tools/smoke.mjs wave3` ou `?snap=…` — vérifie un rendu, une erreur,
   une capture. Idéal pour un correctif visuel.
2. **Système** (1–2 min) : le script dédié (`bosstest`, `weaponstest`, `audittest`, `hudtest`…)
   — vérifie une mécanique isolée, avec ses mesures.
3. **Veille** (8–10 min) : `deeptest` — vérifie l'enchaînement réel, l'économie, les vagues, le HUD.

```bash
# rejeu de référence, options figées
node tools/deeptest.mjs --name=expert --skill=0.92 --turn=8 --head=0.95 --night=480

# comparaison de deux builds : mêmes options, deux rapports
node tools/deeptest.mjs --name=avant --skill=0.62 --turn=4.2 --head=0.6 --night=180
node tools/deeptest.mjs --name=apres --skill=0.62 --turn=4.2 --head=0.6 --night=180
```

Comparer ensuite, dans `tools/reports/deep-avant.json` et `deep-apres.json` : `result.wave`,
`result.kills`, `result.accuracy`, `result.hp`, `diag.bossesKilled`, `hud.radarBad`,
`hud.ammoBad`, `errors`. Un écart de vague ou de précision de plus de 10 % entre deux runs
identiques signale soit un changement de gameplay, soit une instabilité à instruire.

### 6.5 Preuves et nommage

- Captures : `shots/` uniquement, produites par les scripts ou par la passe manuelle ; jamais
  retouchées, jamais upscalées.
- Nommer une capture manuelle `shots/manuel-<ID>-<contexte>.png` (ex. `manuel-L-04-coffre.png`).
- Pour un défaut visuel : capture pleine + crop natif (`vision_analyze` avec `region`).
- Conserver le rapport JSON de `deeptest` avec la fiche de relevé.

### 6.6 Fiche d'anomalie

À recopier pour chaque échec :

```text
ID :                     (ex. T-05)
Date / version :         (git rev-parse --short HEAD)
Scène / URL :            (ex. ?snap=wave3 ou partie manuelle, vague III)
Attendu :                (copié du protocole)
Observé :                (factuel, mesuré)
Reproductible :          oui / non — nombre d'essais
Preuves :                capture(s) + __diag() + erreurs console
Gravité :                bloquant / majeur / mineur / cosmétique
```

Gravités : **bloquant** = empêche de jouer ou de finir une veille ; **majeur** = mécanique
centrale fausse (munitions, butin, boss, collision) ; **mineur** = gêne locale sans perte de
contrôle ; **cosmétique** = texte, alignement, couleur.

## 7. Critères d'acceptation de la passe

La passe est **verte** si et seulement si :

1. tous les scripts du § 3.2 terminent avec leur critère de réussite (code 0, compte complet,
   `failures: 0`), y compris `deeptest` avec `hud.radarBad = 0` et `hud.ammoBad = 0` ;
2. aucun point manuel **bloquant** ou **majeur** n'est ouvert ;
3. les points `M`, `D-07`, `D-08`, `T-05`, `A-01`, `A-06`, `L-05`, `V-06`, `V-10`, `H-07`,
   `P-04`, `F-05`, `X-04` sont explicitement cochés — ce sont les garde-fous du gameplay ;
4. la grille § 5 est remplie pour au moins les vagues I à V et le boss de la vague V ;
5. la fiche de relevé porte la version, la machine, la résolution et les captures.

Un point non testé n'est pas un point réussi : il se note « non couvert » et bloque la
conclusion, sauf s'il est explicitement déclaré hors périmètre pour la passe.
