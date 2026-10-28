# Crédits des modèles 3D — Vigile v2

Les morts de Vigile v2 sont des modèles **GLB riggés** (squelette + clips
d'animation), pas des mannequins procéduraux. Ils sont servis localement depuis
`assets/zombies/` : aucun accès réseau au chargement, aucun CDN.

| fichier | modèle | auteur | licence | source |
|---|---|---|---|---|
| `z_walker.glb` | Zombie (Rodeur) | Quaternius | **CC0 1.0** | https://poly.pizza |
| `z_runner.glb` | Zombie (Coureur) | Quaternius | **CC0 1.0** | https://poly.pizza |
| `z_brute.glb` | Zombie (Colosse) | Quaternius | **CC0 1.0** | https://poly.pizza |

CC0 1.0 : usage commercial et non commercial libre, sans attribution
obligatoire. L'attribution est conservée ici par courtoisie.

## Traitement appliqué (dans le projet `Vigile-assets-v3`)

- export GLB avec un seul matériau `Atlas` (texture PNG embarquée) ;
- squelettes normalisés et clips renommés en français d'usage interne :
  `Emerge`, `Idle`, `Walk`, `Run`, `Attack`, `Hit`, `Death` ;
- hauteurs mesurées : Rodeur 1,82 m — Coureur 1,76 m — Colosse 2,34 m.

## Retouche en jeu (`src/entities/zombie_glb.js`)

- atlas désaturé et assombri une fois au chargement (`CanvasTexture`) pour
  rentrer dans la palette nocturne ;
- teinte propre à chaque type, rugosité 0,86, métal 0 ;
- clones indépendants (`SkeletonUtils.clone`) : chaque mort a son squelette et
  son `AnimationMixer`.

## Armes et butin

Les view-models d'armes et tous les objets de butin restent **procéduraux**
(générés par `src/entities/weapons.js` et `src/entities/loot.js`) : aucune
ressource externe pour eux.
