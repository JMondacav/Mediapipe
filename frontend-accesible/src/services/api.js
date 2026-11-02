const API_URL = import.meta.env.VITE_API_URL || "/api";

export function getToken() {
  return localStorage.getItem("token");
}

export function getAuthHeaders() {
  const token = getToken();

  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Token ${token}` } : {}),
  };
}

async function readJsonResponse(response, fallbackMessage) {
  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await response.json()
    : { detail: fallbackMessage };

  return data;
}

function getApiError(data, fallbackMessage) {
  if (typeof data?.detail === "string") return data.detail;
  if (typeof data?.error === "string") return data.error;
  if (Array.isArray(data?.detail) && data.detail[0]?.msg) {
    return data.detail[0].msg;
  }

  return fallbackMessage;
}

export async function registerUser(username, email, password) {
  const response = await fetch(`${API_URL}/auth/register/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      username,
      email,
      password,
    }),
  });

  const data = await readJsonResponse(
    response,
    `Error del servidor (${response.status})`
  );

  if (!response.ok) {
    throw new Error(getApiError(data, "Error al registrar usuario"));
  }

  localStorage.setItem("token", data.token);
  localStorage.setItem("user", JSON.stringify(data.user));

  return data;
}

export async function loginUser(username, password) {
  const response = await fetch(`${API_URL}/auth/login/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      username,
      password,
    }),
  });

  const data = await readJsonResponse(
    response,
    `Error del servidor (${response.status})`
  );

  if (!response.ok) {
    throw new Error(getApiError(data, "Credenciales incorrectas"));
  }

  localStorage.setItem("token", data.token);
  localStorage.setItem("user", JSON.stringify(data.user));

  return data;
}

export function logoutUser() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
}

export function getLocalUser() {
  const user = localStorage.getItem("user");
  return user ? JSON.parse(user) : null;
}

export async function createSession() {
  const response = await fetch(`${API_URL}/sessions/`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({
      duration_seconds: 0,
      translations_count: 0,
    }),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(getApiError(data, `Error al crear la sesion (${response.status})`));
  }

  return data;
}

export async function saveTranslation(sessionId, text, confidence = 1) {
  const response = await fetch(`${API_URL}/translations/`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({
      session: sessionId,
      text,
      confidence,
    }),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(getApiError(data, "Error al guardar la traduccion"));
  }

  return data;
}

export async function saveFeedback(sessionId, rating) {
  const response = await fetch(`${API_URL}/feedback/`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({
      session: sessionId,
      rating,
    }),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(getApiError(data, "Error al guardar el feedback"));
  }

  return data;
}

export async function getSessions() {
  const response = await fetch(`${API_URL}/sessions/`, {
    headers: getAuthHeaders(),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(getApiError(data, "Error al obtener historial"));
  }

  return data;
}

export async function getTranslations() {
  const response = await fetch(`${API_URL}/translations/`, {
    headers: getAuthHeaders(),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(getApiError(data, "Error al obtener traducciones"));
  }

  return data;
}

export async function getFeedback() {
  const response = await fetch(`${API_URL}/feedback/`, {
    headers: getAuthHeaders(),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(getApiError(data, "Error al obtener feedback"));
  }

  return data;
}

export async function getStats() {
  const response = await fetch(`${API_URL}/stats/`, {
    headers: getAuthHeaders(),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(getApiError(data, "Error al obtener estadisticas"));
  }

  return data;
}

export async function updateSession(sessionId, data) {
  const response = await fetch(`${API_URL}/sessions/${sessionId}/`, {
    method: "PATCH",
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });

  const responseData = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(getApiError(responseData, "Error al actualizar la sesion"));
  }

  return responseData;
}

export function savePendingFeedbackLocally(feedbackData) {
  const pending = JSON.parse(localStorage.getItem("pendingFeedbacks") || "[]");

  pending.push({
    ...feedbackData,
    saved_at: new Date().toISOString(),
  });

  localStorage.setItem("pendingFeedbacks", JSON.stringify(pending));
}

export async function syncPendingFeedbacks() {
  const pending = JSON.parse(localStorage.getItem("pendingFeedbacks") || "[]");

  if (pending.length === 0 || !getToken()) {
    return;
  }

  const remaining = [];

  for (const item of pending) {
    try {
      if (item.sessionId) {
        await updateSession(item.sessionId, {
          duration_seconds: item.duration_seconds,
          translations_count: item.translations_count,
        });

        await saveFeedback(item.sessionId, item.rating);
      }
    } catch {
      remaining.push(item);
    }
  }

  localStorage.setItem("pendingFeedbacks", JSON.stringify(remaining));
}

export async function predictSign(landmarks) {
  const flatLandmarks = landmarks.flatMap((point) => [
    point.x,
    point.y,
    point.z,
  ]);

  const response = await fetch(`${API_URL}/predict/`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({
      landmarks: flatLandmarks,
    }),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(getApiError(data, "Error al predecir la sena"));
  }

  return data;
}

export async function getDynamicStatus() {
  const response = await fetch(`${API_URL}/dynamic/status/`, {
    headers: getAuthHeaders(),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(getApiError(data, "Error al consultar el modelo dinamico"));
  }

  return data;
}

// Los envíos grandes (grabaciones) se comprimen con gzip: los números en JSON
// quedan ~4 veces más livianos, y en el celular subir datos es lo que más
// demora. Si el navegador no puede comprimir, se envían igual.
async function jsonRequest(data) {
  const text = JSON.stringify(data);

  if (text.length < 4096 || typeof CompressionStream === "undefined") {
    return { body: text, headers: getAuthHeaders() };
  }

  try {
    const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
    const body = await new Response(stream).arrayBuffer();
    return { body, headers: { ...getAuthHeaders(), "Content-Encoding": "gzip" } };
  } catch {
    return { body: text, headers: getAuthHeaders() };
  }
}

// Mientras se graba: analiza un trozo (lo nuevo más los 1,8 s anteriores).
// Devuelve { steps, expression_steps, until }.
export async function translateRecordingPartial(frames, aspectRatio, startT, afterT) {
  const { body, headers } = await jsonRequest({
    frames,
    aspect_ratio: aspectRatio,
    start_t: startT,
    after_t: afterT,
  });
  const response = await fetch(`${API_URL}/translate/recording/partial/`, {
    method: "POST",
    headers,
    body,
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(getApiError(data, "Error al analizar la grabacion"));
  }

  return data;
}

// Grabar primero, traducir después: recibe las señas reconocidas, en el orden
// en que salieron. Con `stream` (lo ya analizado mientras se grababa) solo se
// envía el último trozo; sin él, la grabación completa.
export async function translateRecording(frames, aspectRatio, stream = null) {
  const { body, headers } = await jsonRequest({
    frames,
    aspect_ratio: aspectRatio,
    ...(stream
      ? {
          start_t: stream.startT,
          after_t: stream.afterT,
          end_t: stream.endT,
          steps: stream.steps,
          expression_steps: stream.expressionSteps,
        }
      : {}),
  });
  const response = await fetch(`${API_URL}/translate/recording/`, {
    method: "POST",
    headers,
    body,
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(getApiError(data, "Error al traducir la grabacion"));
  }

  return data;
}

// kind: "sign" (seña con movimiento) o "expression" (expresión facial).
export async function saveDynamicSample(label, frames, aspectRatio, kind = "sign") {
  const { body, headers } = await jsonRequest({
    label,
    kind,
    frames,
    aspect_ratio: aspectRatio,
  });
  const response = await fetch(`${API_URL}/dynamic/samples/`, {
    method: "POST",
    headers,
    body,
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(getApiError(data, "Error al guardar la muestra"));
  }

  return data;
}

export async function deleteDynamicSample(label, file, kind = "sign") {
  const response = await fetch(
    `${API_URL}/dynamic/samples/${encodeURIComponent(label)}/${encodeURIComponent(file)}/?kind=${kind}`,
    {
      method: "DELETE",
      headers: getAuthHeaders(),
    }
  );

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(getApiError(data, "Error al borrar la muestra"));
  }

  return data;
}
