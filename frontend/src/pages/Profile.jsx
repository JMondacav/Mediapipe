import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Notice, RoleCard, Screen, Segmented, SettingRow } from "../components/ui";
import { useAuth } from "../context/auth";
import { useSettings } from "../context/settings";
import { getStats } from "../services/api";

function Profile() {
  const navigate = useNavigate();
  const { user, role, setRole, signOut } = useAuth();
  const { settings, update } = useSettings();
  const [stats, setStats] = useState(null);

  useEffect(() => {
    getStats()
      .then(setStats)
      .catch((error) => {
        console.error(error);
        setStats(null);
      });
  }, []);

  const logout = () => {
    signOut();
    navigate("/access", { replace: true });
  };

  return (
    <Screen>
      <h1 className="t-h1">Perfil</h1>

      <div className="card">
        <p className="t-h3">{user?.username || "Mi cuenta"}</p>
        <p className="t-body t-muted">{user?.email || "Sin correo"}</p>
      </div>

      <h2 className="t-h2">Cómo me comunico</h2>
      <RoleCard
        compact
        icon="hand"
        title="Uso señas"
        subtitle="Modo Señas"
        selected={role === "signer"}
        onClick={() => setRole("signer")}
      />
      <RoleCard
        compact
        icon="mic"
        title="Hablo y escucho"
        subtitle="Modo Voz"
        tone="accent"
        selected={role === "hearing"}
        onClick={() => setRole("hearing")}
      />

      <h2 className="t-h2">Accesibilidad</h2>
      <p className="t-label">Tamaño del texto</p>
      <Segmented
        label="Tamaño del texto"
        value={settings.textScale}
        onChange={(value) => update({ textScale: value })}
        options={[
          { value: 1, label: "Normal" },
          { value: 1.15, label: "Grande" },
          { value: 1.3, label: "Muy grande" },
        ]}
      />
      <p className="t-label">Tema</p>
      <Segmented
        label="Tema de colores"
        value={settings.themeMode}
        onChange={(value) => update({ themeMode: value })}
        options={[
          { value: "system", label: "Automático" },
          { value: "light", label: "Claro" },
          { value: "dark", label: "Oscuro" },
        ]}
      />
      <SettingRow
        icon="eye"
        label="Íconos y poca lectura"
        description="Pictogramas más grandes y menos texto."
        value={settings.lowReading}
        onChange={(value) => update({ lowReading: value })}
      />
      <SettingRow
        icon="phone"
        label="Vibración"
        description="Vibra cuando cambia el estado (grabando, listo, error). En iPhone el navegador no lo permite."
        value={settings.haptics}
        onChange={(value) => update({ haptics: value })}
      />
      <SettingRow
        icon="speaker"
        label="Leer en voz alta mis señas"
        description="Cuando traduzco señas, el teléfono dice el texto para que la otra persona lo escuche."
        value={settings.autoSpeak}
        onChange={(value) => update({ autoSpeak: value })}
      />

      <h2 className="t-h2">Mi uso</h2>
      <div className="card stat-list">
        <p className="t-body">Conversaciones: {stats?.total_sessions ?? "—"}</p>
        <p className="t-body">Señas traducidas: {stats?.total_translations ?? "—"}</p>
        <p className="t-body">
          Valoración promedio: {stats?.total_feedbacks ? `${stats.average_rating} de 5` : "—"}
        </p>
      </div>

      <h2 className="t-h2">Privacidad</h2>
      <Notice icon="lock">
        La cámara y el micrófono solo se activan en Traducir y en Grabar señas. Al servidor solo
        viajan números (los puntos de las manos y de la cara), nunca la imagen. Guardamos el texto
        del resultado, no videos ni audios.
      </Notice>

      <Button label="Cerrar sesión" variant="secondary" icon="logout" onClick={logout} />
    </Screen>
  );
}

export default Profile;
