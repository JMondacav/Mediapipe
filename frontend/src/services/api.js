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
    const errorMessage =
      data.username?.[0] ||
      data.email?.[0] ||
      data.password?.[0] ||
      "Error al registrar usuario";

    throw new Error(errorMessage);
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
    throw new Error(data.error || "Credenciales incorrectas");
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
    throw new Error(data?.detail || `Error al crear la sesión (${response.status})`);
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

  if (!response.ok) {
    throw new Error("Error al guardar la traducción");
  }

  return await response.json();
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

  if (!response.ok) {
    throw new Error("Error al guardar el feedback");
  }

  return await response.json();
}

export async function getSessions() {
  const response = await fetch(`${API_URL}/sessions/`, {
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error("Error al obtener historial");
  }

  return await response.json();
}

export async function getTranslations() {
  const response = await fetch(`${API_URL}/translations/`, {
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error("Error al obtener traducciones");
  }

  return await response.json();
}

export async function getFeedback() {
  const response = await fetch(`${API_URL}/feedback/`, {
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error("Error al obtener feedback");
  }

  return await response.json();
}

export async function getStats() {
  const response = await fetch(`${API_URL}/stats/`, {
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error("Error al obtener estadísticas");
  }

  return await response.json();
}

export async function updateSession(sessionId, data) {
  const response = await fetch(`${API_URL}/sessions/${sessionId}/`, {
    method: "PATCH",
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error("Error al actualizar la sesión");
  }

  return await response.json();
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
    throw new Error(data?.error || "Error al predecir la seña");
  }

  return data;
}
