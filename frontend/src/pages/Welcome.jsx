import { useNavigate } from "react-router-dom";
import { Logo, RoleCard, Screen, SettingRow } from "../components/ui";
import { useAuth } from "../context/auth";
import { useSettings } from "../context/settings";

// Primer inicio: dos entradas con pictogramas grandes y poco texto. El rol
// describe cómo se comunica la persona en esta conversación y se puede
// cambiar siempre.
function Welcome() {
  const navigate = useNavigate();
  const { status, setRole } = useAuth();
  const { settings, update } = useSettings();

  const choose = (role) => {
    setRole(role);
    navigate(status === "signedIn" ? "/home" : "/access", { replace: true });
  };

  return (
    <Screen tabs={false}>
      <div className="center">
        <Logo size={112} />
      </div>
      <h1 className="t-h1 t-center">EnSeñas</h1>
      <p className="t-body t-center t-muted">Comunicación entre personas sordas y oyentes</p>

      <h2 className="t-h2 t-center" style={{ marginTop: 8 }}>
        ¿Cómo te comunicas?
      </h2>

      <RoleCard
        icon="hand"
        title="Uso señas"
        subtitle="Lengua de Señas Chilena"
        hint="Entrar en modo señas"
        onClick={() => choose("signer")}
      />
      <RoleCard
        icon="mic"
        title="Hablo y escucho"
        subtitle="Voz y texto"
        tone="accent"
        hint="Entrar en modo voz"
        onClick={() => choose("hearing")}
      />

      <SettingRow
        icon="eye"
        label="Prefiero íconos y poca lectura"
        description="Pictogramas más grandes y menos texto."
        value={settings.lowReading}
        onChange={(value) => update({ lowReading: value })}
      />

      <p className="t-caption t-center t-muted">Puedes cambiar esto cuando quieras en Perfil.</p>
    </Screen>
  );
}

export default Welcome;
