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
