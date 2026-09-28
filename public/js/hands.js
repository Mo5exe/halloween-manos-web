// Envoltorio sobre MediaPipe Hands (cargado por CDN como script global,
// ver index.html) para seguimiento de manos en tiempo real dentro del
// navegador, usando la camara del usuario.
export function startHandTracking(videoEl, onResults, onError) {
  if (typeof Hands === "undefined" || typeof Camera === "undefined") {
    onError(new Error("No se pudo cargar MediaPipe Hands (revisa tu conexion a internet)."));
    return { stop: () => {} };
  }

  const hands = new Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
  });
  hands.setOptions({
    // Hasta 8 manos a la vez -- pensado para que varios jugadores jueguen
    // juntos frente a la misma camara/proyeccion. En compus mas lentas
    // puede bajar los cuadros por segundo cuantas mas manos haya.
    maxNumHands: 8,
    modelComplexity: 1,
    minDetectionConfidence: 0.6,
    minTrackingConfidence: 0.5,
  });
  hands.onResults(onResults);

  const camera = new Camera(videoEl, {
    onFrame: async () => {
      try {
        await hands.send({ image: videoEl });
      } catch (err) {
        // frame suelto perdido, no interrumpe el juego
      }
    },
    width: 1280,
    height: 720,
  });

  camera.start().catch((err) => onError(err));

  return {
    stop: () => {
      try { camera.stop(); } catch (_e) {}
      try { hands.close(); } catch (_e) {}
    },
  };
}
