import { useState } from "react";
import { useNavigate } from "react-router-dom";
import TopBar from "../components/TopBar";
import { Button, Field, Notice, Screen } from "../components/ui";
import { useAuth } from "../context/auth";

function Register() {
  const navigate = useNavigate();
  const { signUp } = useAuth();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();

    if (username.trim().length < 3) {
      setError("El usuario debe tener al menos 3 caracteres.");
      return;
    }

    if (email && !email.includes("@")) {
      setError("Revisa que el correo esté bien escrito.");
      return;
    }

    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }

    setBusy(true);
    setError("");

    try {
      await signUp(username, email, password);
      navigate("/home", { replace: true });
    } catch (err) {
      console.error(err);
      setError(err.message || "No pudimos crear la cuenta. Inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <TopBar title="Crear cuenta" />
      <Screen tabs={false}>
        <form className="stack stack--lg" onSubmit={submit} noValidate>
          <Field
            label="Usuario (como quieres que te llamemos)"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            maxLength={80}
          />
          <Field
            label="Correo (opcional)"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            placeholder="nombre@correo.cl"
          />
          <Field
            label="Contraseña (mínimo 6 caracteres)"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
          />

          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}

          <Button label="Crear cuenta" type="submit" size="lg" loading={busy} />
          <Notice icon="lock">
            Solo guardamos tu usuario, tu correo y los textos de tus traducciones. Nunca videos ni
            audios.
          </Notice>
        </form>
      </Screen>
    </>
  );
}

export default Register;
