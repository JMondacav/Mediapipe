import { useState } from "react";
import { useNavigate } from "react-router-dom";
import TopBar from "../components/TopBar";
import { Button, Field, Screen } from "../components/ui";
import { useAuth } from "../context/auth";

function Login() {
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();

    if (!username.trim() || !password) {
      setError("Escribe tu usuario y tu contraseña.");
      return;
    }

    setBusy(true);
    setError("");

    try {
      await signIn(username, password);
      navigate("/home", { replace: true });
    } catch (err) {
      console.error(err);
      setError("Usuario o contraseña incorrectos.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <TopBar title="Entrar con mi cuenta" />
      <Screen tabs={false}>
        <form className="stack stack--lg" onSubmit={submit} noValidate>
          <Field
            label="Usuario"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            autoCapitalize="none"
          />
          <Field
            label="Contraseña"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
          />

          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}

          <Button label="Entrar" type="submit" size="lg" loading={busy} />
          <Button
            label="No tengo cuenta"
            variant="ghost"
            onClick={() => navigate("/register", { replace: true })}
          />
        </form>
      </Screen>
    </>
  );
}

export default Login;
