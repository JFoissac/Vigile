// weapon_poses.js — pose des view-models GLB du pack Blender (v4).
//
// Chaque entrée décrit la transformation COMPLÈTE de l'arme dans le repère de
// la vue (caméra à l'origine, regard vers -Z), pas un écart :
//   pos    mètres, position de la poignée (origine du GLB)
//   rot    radians XYZ, correction d'orientation du GLB
//   scale  échelle absolue appliquée au GLB (1 = taille réelle du modèle)
//   hand   attache des mains : "right" (pistolet), "pair" (deux mains), "none"
//   handPos/handRot/handScale  réglage fin de l'attache (repère du modèle, mètres)
//
// Les armes blanches (hachette, machette) n'ont pas de GLB : elles gardent leur
// view-model procédural. Les valeurs sont mesurées avec tools/vmbench.mjs et
// commentées dans docs/VIEW-MODEL.md.

/** Point de prise des mains, repère du modèle (manifeste, prise_m.gltf). */
export const HAND_GRIP = {
  right: [-0.043, 0.05, -0.072],
  left: [0.05, 0.048, -0.076],
  pair: [-0.043, 0.05, -0.072],
};

export const HAND_FILE = {
  right: "SM_Main_Droite",
  left: "SM_Main_Gauche",
  pair: "SM_Bras_FPS",
};

export const GLB_POSES = {
  // pistolet : une main, arme haute et proche, canon vers le centre
  pistol: {
    file: "W_Pistolet", muzzle: [0, 0.04, -0.16],
    scale: 1.34, pos: [0.155, -0.100, -0.500], rot: [0.02, 0.26, 0.015],
    hand: "right", handPos: [0, 0, 0], handRot: [0, 0, 0], handScale: 1,
  },
  revolver: {
    file: "W_Revolver", muzzle: [0, 0.025, -0.2055],
    scale: 1.08, pos: [0.155, -0.100, -0.500], rot: [0.02, 0.28, 0.02],
    hand: "right", handPos: [0, 0, 0], handRot: [0, 0, 0], handScale: 1,
  },
  smg: {
    file: "W_PM", muzzle: [0, 0.032, -0.336],
    scale: 0.72, pos: [0.175, -0.115, -0.500], rot: [0.02, 0.18, 0.02],
    hand: "pair", handPos: [0, 0, 0], handRot: [0, 0, 0], handScale: 1,
  },
  rifle: {
    file: "W_FusilAssaut", muzzle: [0, 0.03, -0.502],
    scale: 0.60, pos: [0.185, -0.120, -0.560], rot: [0.02, 0.17, 0.015],
    hand: "pair", handPos: [0, 0, 0], handRot: [0, 0, 0], handScale: 1,
  },
  shotgun: {
    file: "W_FusilPompe", muzzle: [0, 0.03, -0.72],
    scale: 0.55, pos: [0.190, -0.125, -0.620], rot: [0.03, 0.17, 0.02],
    hand: "pair", handPos: [0, 0, 0], handRot: [0, 0, 0], handScale: 1,
  },
  sniper: {
    file: "W_Carabine", muzzle: [0, 0.03, -0.7925],
    scale: 0.54, pos: [0.190, -0.130, -0.620], rot: [0.02, 0.16, 0.02],
    hand: "pair", handPos: [0, 0, 0], handRot: [0, 0, 0], handScale: 1,
  },
  launcher: {
    file: "W_LanceGrenades", muzzle: [0, 0.04, -0.336],
    scale: 0.73, pos: [0.200, -0.140, -0.600], rot: [0.02, 0.14, 0.02],
    hand: "pair", handPos: [0, 0, 0], handRot: [0, 0, 0], handScale: 1,
  },
};
