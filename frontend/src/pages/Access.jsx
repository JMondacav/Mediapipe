import { useNavigate } from "react-router-dom";
import TopBar from "../components/TopBar";
import { Button, Logo, Notice, Screen } from "../components/ui";

// La traducción corre en el servidor del proyecto y guarda cada conversación
// en la cuenta: por eso se entra con usuario (no hay modo sin cuenta).
function Access() {
  const navigate = useNavigate();

  return (
    <>
      <TopBar title="Cómo quieres entrar" backTo="/welcome" />
      <Screen tabs={false}>
        <div className="center">
          <Logo size={96} />
        </div>
        <h1 className="t-h1 t-center">¿Cómo quieres entrar?</h1>

        <Button label="Entrar" icon="login" size="lg" onClick={() => navigate("/login")} />
        <Button
          label="Crear cuenta"
          icon="user-plus"
          size="lg"
          variant="secondary"
          onClick={() => navigate("/register")}
        />

        <Notice icon="lock">
          Con tu cuenta, tus conversaciones y estadísticas quedan guardadas. Nunca se guardan videos
          ni audios: solo el texto del resultado.
        </Notice>

        <Button
          label="Cambiar cómo me comunico"
          variant="ghost"
          size="sm"
          onClick={() => navigate("/welcome", { replace: true })}
        />
      </Screen>
    </>
  );
}

export default Access;
