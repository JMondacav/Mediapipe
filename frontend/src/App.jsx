import { useEffect } from "react";
import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";
import TabBar from "./components/TabBar";
import { useAuth } from "./context/auth";
import { syncPendingFeedbacks } from "./services/api";

import Access from "./pages/Access";
import History from "./pages/History";
import Home from "./pages/Home";
import Learn from "./pages/Learn";
import Login from "./pages/Login";
import Profile from "./pages/Profile";
import Register from "./pages/Register";
import Translate from "./pages/Translate";
import Welcome from "./pages/Welcome";

// Puerta de entrada: primero cómo se comunica la persona, después la cuenta.
function Entry() {
  const { status, role } = useAuth();

  if (!role) {
    return <Navigate to="/welcome" replace />;
  }

  return <Navigate to={status === "signedIn" ? "/home" : "/access"} replace />;
}

// Las 5 pestañas: Inicio · Traducir · Aprender · Historial · Perfil.
function TabsLayout() {
  const { status, role } = useAuth();

  if (!role) {
    return <Navigate to="/welcome" replace />;
  }

  if (status !== "signedIn") {
    return <Navigate to="/access" replace />;
  }

  return (
    <>
      <Outlet />
      <TabBar />
    </>
  );
}

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
        <Route path="/" element={<Entry />} />
        <Route path="/welcome" element={<Welcome />} />
        <Route path="/access" element={<Access />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        <Route element={<TabsLayout />}>
          <Route path="/home" element={<Home />} />
          <Route path="/translate" element={<Translate />} />
          <Route path="/learn" element={<Learn />} />
          <Route path="/history" element={<History />} />
          <Route path="/profile" element={<Profile />} />
        </Route>

        {/* Rutas de la versión anterior */}
        <Route path="/menu" element={<Navigate to="/home" replace />} />
        <Route path="/translator" element={<Navigate to="/translate" replace />} />
        <Route path="/tutorial" element={<Navigate to="/learn" replace />} />
        <Route path="/dynamic-recorder" element={<Navigate to="/learn" replace />} />
        <Route path="/stats" element={<Navigate to="/profile" replace />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
