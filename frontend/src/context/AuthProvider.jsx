import { useCallback, useMemo, useState } from "react";
import { getLocalUser, getToken, loginUser, logoutUser, registerUser } from "../services/api";
import { AuthContext } from "./auth";

const ROLE_KEY = "ensenas.role";

function readRole() {
  try {
    const role = localStorage.getItem(ROLE_KEY);
    return role === "signer" || role === "hearing" ? role : null;
  } catch {
    return null;
  }
}

// Sesión (cuenta del backend FastAPI) y rol: "signer" (uso señas) o
// "hearing" (hablo y escucho). El rol describe cómo se comunica la persona
// en esta conversación y se puede cambiar siempre.
function AuthProvider({ children }) {
  const [role, setRoleState] = useState(readRole);
  const [token, setToken] = useState(getToken);
  const [user, setUser] = useState(getLocalUser);

  const setRole = useCallback((next) => {
    setRoleState(next);

    try {
      localStorage.setItem(ROLE_KEY, next);
    } catch {
      // Sin almacenamiento: el rol dura esta visita.
    }
  }, []);

  const signIn = useCallback(async (username, password) => {
    const data = await loginUser(username, password);
    setUser(data.user);
    setToken(data.token);
  }, []);

  const signUp = useCallback(async (username, email, password) => {
    const data = await registerUser(username, email, password);
    setUser(data.user);
    setToken(data.token);
  }, []);

  const signOut = useCallback(() => {
    logoutUser();
    setUser(null);
    setToken(null);
  }, []);

  const value = useMemo(
    () => ({
      status: token ? "signedIn" : "signedOut",
      user,
      role,
      setRole,
      signIn,
      signUp,
      signOut,
    }),
    [token, user, role, setRole, signIn, signUp, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export default AuthProvider;
