// Dibuja el esqueleto de "huesos reales" estilo radiografia (blanco con
// contorno negro marcado, sin sombreado suave) sobre las manos detectadas
// -- traducido de la logica en Python del juego de escritorio
// (game.py: draw_bone_segment / draw_carpal_cluster / draw_bone_skeleton).
export const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

const JOINT_SCALE = {
  0: 1.5, 1: 1.0, 5: 1.0, 9: 1.0, 13: 1.0, 17: 1.0,
  4: 0.55, 8: 0.55, 12: 0.55, 16: 0.55, 20: 0.55,
};

function jointRadius(idx, baseR) {
  const scale = JOINT_SCALE[idx] ?? 0.75;
  return baseR * scale;
}

function fillPoly(ctx, pts, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.fill();
}

function drawBoneSegment(ctx, p1, p2, r1, r2, fillColor, outlineColor, outlinePad) {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.hypot(dx, dy);

  if (len < 1) {
    const r = Math.max(r1, r2);
    ctx.fillStyle = outlineColor;
    ctx.beginPath(); ctx.arc(p1.x, p1.y, r + outlinePad, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = fillColor;
    ctx.beginPath(); ctx.arc(p1.x, p1.y, r, 0, Math.PI * 2); ctx.fill();
    return;
  }

  const ux = dx / len;
  const uy = dy / len;
  const px = -uy;
  const py = ux;
  const shaftHalf = Math.max(2, Math.min(r1, r2) * 0.42);
  const inset1 = Math.min(r1 * 0.6, len * 0.35);
  const inset2 = Math.min(r2 * 0.6, len * 0.35);
  const ax = p1.x + ux * inset1;
  const ay = p1.y + uy * inset1;
  const bx = p2.x - ux * inset2;
  const by = p2.y - uy * inset2;

  function poly(pad) {
    return [
      { x: ax + px * (shaftHalf + pad), y: ay + py * (shaftHalf + pad) },
      { x: bx + px * (shaftHalf + pad), y: by + py * (shaftHalf + pad) },
      { x: bx - px * (shaftHalf + pad), y: by - py * (shaftHalf + pad) },
      { x: ax - px * (shaftHalf + pad), y: ay - py * (shaftHalf + pad) },
    ];
  }

  // contorno negro marcado (estilo radiografia), dibujado primero
  fillPoly(ctx, poly(outlinePad), outlineColor);
  ctx.fillStyle = outlineColor;
  ctx.beginPath(); ctx.arc(p1.x, p1.y, r1 + outlinePad, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(p2.x, p2.y, r2 + outlinePad, 0, Math.PI * 2); ctx.fill();

  // relleno blanco plano encima
  fillPoly(ctx, poly(0), fillColor);
  ctx.fillStyle = fillColor;
  ctx.beginPath(); ctx.arc(p1.x, p1.y, r1, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(p2.x, p2.y, r2, 0, Math.PI * 2); ctx.fill();
}

function drawCarpalCluster(ctx, wrist, awayDir, fillColor, outlineColor) {
  const ax = awayDir.x;
  const ay = awayDir.y;
  const px = -ay;
  const py = ax;
  const offsets = [
    [0.55, 0, 7], [0.85, 0.42, 6], [0.85, -0.42, 6],
    [1.25, 0.2, 6], [1.25, -0.22, 5], [1.05, 0, 5],
  ];
  for (const [along, side, r] of offsets) {
    const cx = wrist.x + ax * along * 14 + px * side * 14;
    const cy = wrist.y + ay * along * 14 + py * side * 14;
    ctx.fillStyle = outlineColor;
    ctx.beginPath(); ctx.arc(cx, cy, r + 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = fillColor;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  }
}

// landmarksPx: array de 21 puntos {x, y} ya en pixeles de canvas.
// handednessLabel: "Left" / "Right" (de MediaPipe) o null.
export function drawBoneSkeleton(ctx, landmarksPx, canvasWidth, handednessLabel) {
  const FILL = "#f5f8fa";
  const OUTLINE = "#0c0a0a";
  const baseR = Math.max(6, Math.round(canvasWidth * 0.012));

  for (const [a, b] of HAND_CONNECTIONS) {
    const p1 = landmarksPx[a];
    const p2 = landmarksPx[b];
    if (!p1 || !p2) continue;
    drawBoneSegment(ctx, p1, p2, jointRadius(a, baseR), jointRadius(b, baseR), FILL, OUTLINE, 3);
  }

  for (let i = 0; i < landmarksPx.length; i++) {
    const p = landmarksPx[i];
    if (!p) continue;
    const r = jointRadius(i, baseR);
    ctx.fillStyle = OUTLINE;
    ctx.beginPath(); ctx.arc(p.x, p.y, r + 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = FILL;
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
  }

  const wrist = landmarksPx[0];
  const palmBase = landmarksPx[9];
  if (wrist && palmBase) {
    let ax = wrist.x - palmBase.x;
    let ay = wrist.y - palmBase.y;
    const len = Math.hypot(ax, ay) || 1;
    ax /= len;
    ay /= len;
    drawCarpalCluster(ctx, wrist, { x: ax, y: ay }, FILL, OUTLINE);

    if (handednessLabel) {
      const label = handednessLabel.toLowerCase().startsWith("r") ? "D" : "I";
      const lx = wrist.x + ax * 46;
      const ly = wrist.y + ay * 46;
      ctx.font = `bold ${Math.round(baseR * 2.2)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 4;
      ctx.strokeStyle = OUTLINE;
      ctx.strokeText(label, lx, ly);
      ctx.fillStyle = "#ffce6b";
      ctx.fillText(label, lx, ly);
    }
  }
}

// Puntos "de agarre" (palma + puntas de los dedos) usados para detectar
// si una mano toca un objeto que cae -- en modo solo localmente, y en
// modo multijugador se mandan al servidor en coordenadas normalizadas.
const CATCH_LANDMARK_IDX = [0, 4, 8, 12, 16, 20, 9];

export function catchPointsFromLandmarks(landmarksPx) {
  return CATCH_LANDMARK_IDX.map((i) => landmarksPx[i]).filter(Boolean);
}

export function catchPointsNormalized(landmarksNorm) {
  return CATCH_LANDMARK_IDX.map((i) => landmarksNorm[i]).filter(Boolean);
}
