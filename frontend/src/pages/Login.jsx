import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { loginUser } from "../services/api";
import "../App.css";

function Login() {
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();

    try {
      await loginUser(username, password);
      setMessage("Inicio de sesión correcto");
      navigate("/menu");
    } catch (error) {
      console.error(error);
      setMessage("Usuario o contraseña incorrectos");
    }
  };

  return (
    <main className="app-container">
      <section className="phone-frame auth-frame">
        <header className="app-header">
          <h1>EnseñaVos</h1>
          <p>Iniciar sesión</p>
        </header>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label>Usuario</label>
          <input
            type="text"
            placeholder="Ingresa tu usuario"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />

          <label>Contraseña</label>
          <input
            type="password"
            placeholder="Ingresa tu contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          <button type="submit">Ingresar</button>
        </form>

        <p className="auth-link">
          ¿No tienes cuenta? <Link to="/register">Crear cuenta</Link>
        </p>

        {message && <p className="message">{message}</p>}
      </section>
    </main>
  );
}

export default Login;