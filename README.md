# Juego Halloween — Manos (versión web)

Versión web y multijugador del juego de atrapar calabazas con las manos
(cámara del navegador + [MediaPipe Hands](https://developers.google.com/mediapipe)),
pensada para compartir por link y jugar en vivo desde varias computadoras
a la vez.

Es un proyecto **separado** de la versión de escritorio en Python
(`mo5exe.github.io/halloween-atrapa-calabazas`); no la reemplaza.

## Qué incluye

- **Detección de manos en el navegador** con MediaPipe Hands (hasta 8 manos
  a la vez), dibujadas con el mismo esqueleto de "huesos reales" estilo
  radiografía del juego de escritorio.
- **Modo solo**: nombre de usuario + puntaje guardado en una base de datos,
  para seguir jugando donde lo dejaste la próxima vez que entrás con el
  mismo link.
- **Modo multijugador online**: se crea una sala con un código para
  compartir; todos los que se unen juegan la misma partida en vivo, con
  puntaje compartido y hasta 8 manos en total (el servidor calcula el
  juego para que se vea igual en todas las pantallas).
- **Pantalla horizontal o vertical**, para proyectar.
- **Clima real de Córdoba, Argentina** (vía [Open-Meteo](https://open-meteo.com/),
  sin API key): lluvia, tormenta (con rayos y nubes grises), sol (llamas)
  o viento (los objetos caen más rápido y en diagonal).

## Correrlo localmente

```bash
npm install
npm start
```

Sin una base de datos Postgres configurada, el puntaje del modo solo se
guarda en memoria (se pierde al reiniciar el servidor) — suficiente para
probar. El modo multijugador funciona igual, con o sin base de datos.

Abrí `http://localhost:3000` en el navegador (necesita permiso de cámara).

## Desplegar en Render

Este repo incluye un `render.yaml` (Blueprint) que crea:

1. Una base de datos Postgres gratis (`halloween-manos-db`), usada para el
   puntaje del modo solo.
2. Un servicio web gratis (`halloween-manos-web`) con la variable
   `DATABASE_URL` conectada automáticamente a esa base de datos.

Pasos:

1. Entrá a [Render](https://dashboard.render.com/) → **New** → **Blueprint**.
2. Elegí este repositorio de GitHub (`Mo5exe/halloween-manos-web`).
3. Render va a detectar el `render.yaml` y va a crear la base de datos y
   el servicio web juntos. Confirmá con **Apply**.
4. Cuando termine el deploy, Render te da un link público
   (`https://halloween-manos-web.onrender.com` o similar) — ese es el
   link para compartir.

El plan gratis de Render "duerme" el servicio después de un rato sin uso
(la primera visita después de eso tarda unos segundos en despertar), y la
base de datos Postgres gratis dura 90 días.
