# Vue subjective — rendu des armes GLB (pack Blender v4)

État au 22/10, après réglage du banc `tools/vmbench.mjs`. Les captures sont dans
`shots/vm-<arme>.png` (une par arme) et `shots/vm-ingame.png` (en jeu, HUD).

## Ce qui a changé

- Les GLB du pack Blender remplacent **par défaut** les view-models procéduraux
  des sept armes à feu (`src/entities/player.js`). `?glb=0` revient aux
  primitives ; les armes blanches (hachette, machette) n'ont pas de GLB et
  gardent leur modèle procédural.
- La pose de chaque arme est **une donnée explicite**, plus un calcul d'échelle
  automatique : `src/entities/weapon_poses.js` (position, rotation, échelle,
  bouche, attache des mains). L'ancien calcul normalisait la longueur du GLB sur
  la boîte du modèle procédural *mains comprises* et recentrait verticalement le
  modèle : d'où l'arme trop grosse, décalée vers le haut et sans mains.
- Les mains sont attachées aux armes : main droite seule pour les armes de
  poing, paire `SM_Bras_FPS` pour les armes longues.
- L'éclair de bouche, qui était posé sur les modèles procéduraux, est recréé sur
  la bouche du GLB (sinon le tir n'avait plus de flash).

## Repère

Caméra de vue à l'origine, regard vers **-Z**, **+Y** vers le haut. Le pack est
modélisé à l'échelle réelle, origine à la poignée, canon vers -Z : c'est déjà le
repère des view-models procéduraux. `group` porte la pose animée (repos, recul,
rechargement), `align` porte l'échelle du GLB et les mains — un seul niveau de
plus, sans toucher à la logique de jeu.

## Poses retenues (mesurées, pas estimées)

| Arme | GLB | échelle | position (m) | rotation (rad) | longueur à l'écran | couverture écran | bouche NDC (x, y) |
|---|---|---:|---|---|---:|---:|---|
| Pistolet | W_Pistolet | 1,34 | 0,155 / -0,100 / -0,500 | 0,02 / 0,26 / 0,015 | 0,301 m | 20,97 % | 0,177 / -0,135 |
| Revolver | W_Revolver | 1,08 | 0,155 / -0,100 / -0,500 | 0,02 / 0,28 / 0,02 | 0,316 m | 19,81 % | 0,165 / -0,217 |
| PM | W_PM | 0,72 | 0,175 / -0,115 / -0,500 | 0,02 / 0,18 / 0,02 | 0,457 m | 21,51 % | 0,225 / -0,266 |
| Fusil d'assaut | W_FusilAssaut | 0,60 | 0,185 / -0,120 / -0,560 | 0,02 / 0,17 / 0,015 | 0,502 m | 20,12 % | 0,197 / -0,252 |
| Fusil à pompe | W_FusilPompe | 0,55 | 0,190 / -0,125 / -0,620 | 0,03 / 0,17 / 0,02 | 0,548 m | 17,40 % | 0,154 / -0,215 |
| Carabine | W_Carabine | 0,54 | 0,190 / -0,130 / -0,620 | 0,02 / 0,16 / 0,02 | 0,596 m | 18,66 % | 0,147 / -0,227 |
| Lance-grenades | W_LanceGrenades | 0,73 | 0,200 / -0,140 / -0,600 | 0,02 / 0,14 / 0,02 | 0,423 m | 20,81 % | 0,248 / -0,283 |

Repères de contrôle (1600 × 900, `?snap=nave`) :

- **couverture** 17–22 % : la plage des modèles procéduraux (19–26 %) ;
- **bouche** x ∈ [0,15 ; 0,25] et y ∈ [-0,28 ; -0,13] : le canon pointe vers le
  centre de l'écran, sous le réticule — le tir part de la caméra, la bouche ne
  sert qu'au flash ;
- **longueur** croissante dans l'ordre attendu : pistolet 0,30 m → revolver
  0,32 → lance-grenades 0,42 → PM 0,46 → fusil 0,50 → pompe 0,55 → carabine
  0,60. Le pistolet n'est donc pas plus long qu'un fusil (l'ancien calcul le
  faisait paraître énorme, la boîte incluant le bras).

## Attache des mains

- **Armes de poing** (pistolet, revolver) : `SM_Main_Droite` seule, prise
  pistolet, axe de poing vertical.
- **Armes longues** : paire `SM_Bras_FPS` (main droite sur la poignée, main
  gauche sur le garde-main), validée par le porteur.

Le point de prise est celui du manifeste (`prise_m.gltf`). Vérification
numérique (ajustement de cercle sur les sommets du poing, rayon 27,4 mm) :

| Modèle | centre du poing / point de prise | conclusion |
|---|---|---|
| SM_Main_Droite | 6 mm | la poignée traverse le poing |
| SM_Main_Gauche (miroir) | 6 mm | idem |
| SM_Bras_FPS | 6 mm | idem pour la main droite de la paire |

Un écart de 6 mm sur un poing de 55 mm de large est invisible ; aucune
correction (`handPos`) n'a donc été nécessaire.

## Main gauche (revue du porteur)

La planche `perso_main_gauche` était **à reprendre**. Deux corrections dans la
source Blender (`Vigile-assets-v4/bras.py`) :

1. **La main de la paire** (`build_main_gauche_garde_main`) avait doigts et
   pouce du mauvais côté — une main droite déguisée : le pouce se confondait
   avec les doigts. Doigts passés côté extérieur (+X), pouce en opposition côté
   corps (-X), articulations et éminence thénar ajoutées.
2. **L'asset autonome** `SM_Main_Gauche.glb` est désormais le **miroir exact de
   la main droite validée** (miroir X, faces retournées, recentrage sur le
   poignet miroir). Il conserve donc la qualité validée : doigts individualisés,
   pouce articulé, avant-bras continu. Son point de prise est (0,043 ; 0,05 ;
   -0,072).

Limite assumée : le miroir garde une **prise pistolet** (axe de poing
vertical). Il n'est utilisé par aucune arme en jeu — la main gauche en jeu est
celle de la paire — et son usage futur sur un garde-main demanderait une
rotation de 90°. Les planches `docs/renders/armes-perso_main_gauche.png` et
`armes-perso_bras_fps.png` sont régénérées avec les nouveaux modèles ; c'est au
porteur de trancher sur les images.

## Validation

| Contrôle | Résultat |
|---|---|
| `tools/debugboot.mjs` | 0 erreur (seul un avertissement three.js préexistant : `PCFSoftShadowMap`) |
| `tools/verify.mjs` | 8 scènes, **0 échec**, 0 erreur console |
| `tools/weaponstest.mjs` | **71/71** vérifications arsenal/butin |
| `tools/hudtest.mjs` | **23/23**, 0 erreur |
| `tools/vmbench.mjs --all` | 7 armes, `glb=true`, 0 erreur, bouche et couverture dans les cibles |
| Tir (3 coups, fusil GLB) | flash visible sur la bouche, munitions décrémentées, 0 erreur |

## Limites connues

- Les GLB sont des **maillages uniques** : plus de culasse qui recule, de
  chargeur qui tombe, de pompe qui coulisse ni de chien qui bascule. Le geste de
  rechargement (arme entière) et le recul restent. C'est le prix du pack actuel ;
  il faudrait des nœuds séparés dans les GLB pour retrouver ces animations.
- La lunette de la carabine est un mesh du GLB : en visée, l'arme disparaît
  toujours sous le zoom (`zoomK < 0,55`), donc pas de gêne.
- Le rendu métallique est légèrement éclairci (`metalness ≤ 0,68`, base ×1,7)
  parce que la scène de vue n'a pas d'environnement réfléchissant : sans cela
  l'acier sortait noir.

## Reproduire

```bash
python server.py 8131
node tools/vmbench.mjs --all --out=shots/vm-{}.png      # une capture par arme
node tools/vmbench.mjs --id=rifle --glb=0 --out=shots/ref-rifle.png
node tools/shot.mjs wave3 --out=shots/vm-ingame.png --wait=4
```

Banc d'inspection interactif : `http://127.0.0.1:8131/tools/vmbench.html?id=rifle`
(vue du jeu + orbite, `?hp=`/`?hr=` pour pousser l'attache des mains, `&ghost=1`
pour rendre l'arme translucide).
