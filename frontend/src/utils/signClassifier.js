function isFingerExtended(landmarks, tipIndex, pipIndex) {
  return landmarks[tipIndex].y < landmarks[pipIndex].y;
}

function isFingerClosed(landmarks, tipIndex, pipIndex) {
  return landmarks[tipIndex].y > landmarks[pipIndex].y;
}

function isThumbOpen(landmarks) {
  const thumbTip = landmarks[4];
  const indexBase = landmarks[5];

  return Math.abs(thumbTip.x - indexBase.x) > 0.12;
}

export function classifyHandLandmarks(landmarks) {
  if (!landmarks || landmarks.length < 21) {
    return null;
  }

  const indexExtended = isFingerExtended(landmarks, 8, 6);
  const middleExtended = isFingerExtended(landmarks, 12, 10);
  const ringExtended = isFingerExtended(landmarks, 16, 14);
  const pinkyExtended = isFingerExtended(landmarks, 20, 18);

  const indexClosed = isFingerClosed(landmarks, 8, 6);
  const middleClosed = isFingerClosed(landmarks, 12, 10);
  const ringClosed = isFingerClosed(landmarks, 16, 14);
  const pinkyClosed = isFingerClosed(landmarks, 20, 18);

  const thumbOpen = isThumbOpen(landmarks);

  // Mano abierta: parecido a B o palma abierta
  if (
    indexExtended &&
    middleExtended &&
    ringExtended &&
    pinkyExtended
  ) {
    return {
      label: "B",
      confidence: 0.95,
    };
  }

  // Puño cerrado: lo usaremos como A para el prototipo
  if (
    indexClosed &&
    middleClosed &&
    ringClosed &&
    pinkyClosed
  ) {
    return {
      label: "A",
      confidence: 0.9,
    };
  }

  // Forma de L: índice extendido, otros cerrados y pulgar abierto
  if (
    indexExtended &&
    middleClosed &&
    ringClosed &&
    pinkyClosed &&
    thumbOpen
  ) {
    return {
      label: "L",
      confidence: 0.88,
    };
  }

  return null;
}