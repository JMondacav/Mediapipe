import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { getToken, syncPendingFeedbacks } from "./services/api";

import Login from "./pages/Login";
import Register from "./pages/Register";
import Menu from "./pages/Menu";
import Translator from "./pages/Translator";
import History from "./pages/History";
import Stats from "./pages/Stats";

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

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={<Navigate to={getToken() ? "/menu" : "/login"} replace />}
        />

        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        <Route
          path="/menu"
          element={
            <ProtectedRoute>
              <Menu />
            </ProtectedRoute>
          }
        />

        <Route
          path="/translator"
          element={
            <ProtectedRoute>
              <Translator />
            </ProtectedRoute>
          }
        />

        <Route
          path="/history"
          element={
            <ProtectedRoute>
              <History />
            </ProtectedRoute>
          }
        />

        <Route
          path="/stats"
          element={
            <ProtectedRoute>
              <Stats />
            </ProtectedRoute>
          }
        />

        <Route
          path="*"
          element={<Navigate to={getToken() ? "/menu" : "/login"} replace />}
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
