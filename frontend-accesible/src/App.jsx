import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { getToken, syncPendingFeedbacks } from "./services/api";

import Welcome from "./pages/Welcome";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Menu from "./pages/Menu";
import Translator from "./pages/Translator";
import History from "./pages/History";
import Stats from "./pages/Stats";
import Tutorial from "./pages/Tutorial";
import DynamicRecorder from "./pages/DynamicRecorder";

import ProtectedRoute from "./components/ProtectedRoute";

function App() {
  useEffect(() => {
    syncPendingFeedbacks().catch(console.error);

    const handleOnline = () => {
      syncPendingFeedbacks().catch(console.error);
    };

    window.addEventListener("online", handleOnline);

    return () => window.removeEventListener("online", handleOnline);
  }, []);

  const protectedPage = (page) => <ProtectedRoute>{page}</ProtectedRoute>;

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={<Navigate to={getToken() ? "/menu" : "/login"} replace />}
        />

        {/* Entrada accesible: animal + PIN */}
        <Route path="/login" element={<Welcome />} />
        {/* Entrada clásica con usuario y contraseña (cuentas existentes) */}
        <Route path="/login-texto" element={<Login />} />
        <Route path="/register" element={<Register />} />

        <Route path="/menu" element={protectedPage(<Menu />)} />
        <Route path="/translator" element={protectedPage(<Translator />)} />
        <Route path="/tutorial" element={protectedPage(<Tutorial />)} />
        <Route path="/history" element={protectedPage(<History />)} />

        {/* Herramientas del equipo (con texto, fuera de la portada) */}
        <Route path="/stats" element={protectedPage(<Stats />)} />
        <Route path="/dynamic-recorder" element={protectedPage(<DynamicRecorder />)} />

        <Route
          path="*"
          element={<Navigate to={getToken() ? "/menu" : "/login"} replace />}
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
