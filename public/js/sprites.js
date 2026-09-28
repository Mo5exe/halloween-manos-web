// Carga las secuencias de sprites (12 cuadros cada una) usadas por los
// objetos que caen -- las mismas imagenes del juego de escritorio.
const TYPES = ["pumpkin", "vampire", "ghost", "witch_hat"];
const FRAME_COUNT = 12;

export async function loadSprites() {
  const sheets = {};
  await Promise.all(
    TYPES.map(async (type) => {
      const frames = await Promise.all(
        Array.from({ length: FRAME_COUNT }, (_, i) => {
          const n = String(i).padStart(2, "0");
          return loadImage(`/assets/sprites/${type}/${n}.png`);
        })
      );
      sheets[type] = frames;
    })
  );
  return sheets;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`No se pudo cargar ${src}`));
    img.src = src;
  });
}
