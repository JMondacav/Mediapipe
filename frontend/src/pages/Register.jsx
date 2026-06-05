import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { registerUser } from "../services/api";
import "../App.css";

function Register() {
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();

    try {
      await registerUser(username, email, password);
      setMessage("Cuenta creada correctamente");
      navigate("/menu");
    } catch (error) {
        console.error(error);
        setMessage(error.message);
        }
  };

  return (
    <main className="app-container">
      <section className="phone-frame auth-frame">
        <header className="app-header">
          <h1>EnseñaVos</h1>
          <p>Crear cuenta</p>
        </header>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label>Usuario</label>
          <input
            type="text"
            placeholder="Crea un usuario"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />

          <label>Correo</label>
          <input
            type="email"
            placeholder="correo@ejemplo.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <label>Contraseña</label>
          <input
            type="password"
            placeholder="Mínimo 6 caracteres"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          <button type="submit">Registrarme</button>
        </form>

        <p className="auth-link">
          ¿Ya tienes cuenta? <Link to="/login">Iniciar sesión</Link>
        </p>

        {message && <p className="message">{message}</p>}
      </section>
    </main>
  );
}

export default Register;