// Llamadas al backend: login (buscar/crear usuario) y guardado de puntaje.
export async function loginPlayer(username) {
  const res = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "No se pudo iniciar sesion");
  }
  return res.json();
}

export async function saveScore(username, score, misses) {
  try {
    const res = await fetch("/api/score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, score, misses }),
    });
    return res.ok;
  } catch (err) {
    // si falla la red, no interrumpe el juego -- se reintenta en el
    // proximo guardado periodico
    console.warn("No se pudo guardar el puntaje:", err);
    return false;
  }
}
