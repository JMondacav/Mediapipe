import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Avatar from "../components/Avatar";
import HelpButton from "../components/HelpButton";
import Icon from "../components/Icon";
import PinPad from "../components/PinPad";
import { loginUser, registerUser } from "../services/api";
import { vibrate } from "../utils/feedback";
import {
  AVATARS,
  getAvatar,
  newUsername,
  pinToPassword,
  readProfiles,
  saveProfile,
  setCurrentProfile,
} from "../utils/profiles";

const HELP_STEPS = [
  { icon: "user", color: "blue" },
  { icon: "lock", color: "purple" },
  { icon: "check", color: "green" },
];

// Entrada sin leer ni escribir: tocar tu animal y marcar tu PIN.
//   pick -> pin                      (perfil ya creado en este dispositivo)
//   create-avatar -> create-pin -> confirm-pin   (perfil nuevo)
function Welcome() {
  const navigate = useNavigate();
  const [profiles] = useState(() => readProfiles());
  const [view, setView] = useState("pick");
  const [profile, setProfile] = useState(null);
  const [avatarId, setAvatarId] = useState(null);
  const [firstPin, setFirstPin] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  const showError = () => {
    vibrate([80, 60, 80]);
    setError(true);
    window.setTimeout(() => setError(false), 650);
  };

  const enter = (username) => {
    setCurrentProfile(username);
    vibrate(60);
    navigate("/menu");
  };

  const login = async (pin) => {
    setBusy(true);

    try {
      await loginUser(profile.username, pinToPassword(pin));
      enter(profile.username);
    } catch (err) {
      console.error(err);
      showError();
    } finally {
      setBusy(false);
    }
  };

  const createAccount = async (pin) => {
    if (pin !== firstPin) {
      showError();
      setFirstPin("");
      setView("create-pin");
      return;
    }

    setBusy(true);

    // El usuario se genera solo; si justo existe, se prueba con otro número.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const username = newUsername(avatarId);

      try {
        await registerUser(username, "", pinToPassword(pin));
        saveProfile({ username, avatarId });
        setBusy(false);
        enter(username);
        return;
      } catch (err) {
        console.error(err);

        if (!String(err.message).toLowerCase().includes("existe")) {
          break;
        }
      }
    }

    setBusy(false);
    showError();
  };

  const goBack = () => {
    setError(false);
    setFirstPin("");
    setView(view === "confirm-pin" ? "create-pin" : view === "create-pin" ? "create-avatar" : "pick");
  };

  const selectedAvatar = view === "pin" ? getAvatar(profile?.avatarId) : getAvatar(avatarId);

  return (
    <main className="a-screen">
      <header className="a-topbar">
        {view === "pick" ? (
          <span className="a-screen-icon a-c-blue">
            <Icon name="hand" />
          </span>
        ) : (
          <button className="a-icon-btn" onClick={goBack} aria-label="Volver">
            <Icon name="back" />
          </button>
        )}

        <HelpButton videoId="ayuda-inicio" steps={HELP_STEPS} />
      </header>

      {view === "pick" && (
        <section className="a-center">
          <div className="a-avatar-grid">
            {profiles.map((item) => (
              <button
                key={item.username}
                className="a-avatar-btn"
                onClick={() => {
                  setProfile(item);
                  setView("pin");
                }}
                aria-label={`Entrar como ${item.username}`}
              >
                <Avatar avatar={getAvatar(item.avatarId)} />
              </button>
            ))}

            <button
              className="a-avatar-btn"
              onClick={() => setView("create-avatar")}
              aria-label="Crear perfil"
            >
              <span className="a-avatar a-c-green" style={{ "--avatar-color": "var(--a-green)", "--avatar-soft": "var(--a-green-soft)" }}>
                <Icon name="user-plus" />
              </span>
            </button>
          </div>

          <button
            className="a-icon-btn a-icon-btn--sm"
            onClick={() => navigate("/login-texto")}
            aria-label="Entrar con usuario y contraseña"
          >
            <Icon name="keyboard" />
          </button>
        </section>
      )}

      {view === "pin" && (
        <section className="a-center">
          <Avatar avatar={selectedAvatar} size="lg" />
          <PinPad onComplete={login} error={error} disabled={busy} />
        </section>
      )}

      {view === "create-avatar" && (
        <section className="a-avatar-grid">
          {AVATARS.map((avatar) => (
            <button
              key={avatar.id}
              className="a-avatar-btn"
              onClick={() => {
                setAvatarId(avatar.id);
                setView("create-pin");
              }}
              aria-label={avatar.id}
            >
              <Avatar avatar={avatar} />
            </button>
          ))}
        </section>
      )}

      {view === "create-pin" && (
        <section className="a-center">
          <Avatar avatar={selectedAvatar} size="lg" />
          <span className="a-step-badge">
            <Icon name="lock" />
          </span>
          <PinPad
            onComplete={(pin) => {
              setFirstPin(pin);
              setView("confirm-pin");
            }}
            error={error}
          />
        </section>
      )}

      {view === "confirm-pin" && (
        <section className="a-center">
          <Avatar avatar={selectedAvatar} size="lg" />
          <span className="a-step-badge">
            <Icon name="lock" />
            <Icon name="repeat" />
          </span>
          <PinPad onComplete={createAccount} error={error} disabled={busy} />
        </section>
      )}
    </main>
  );
}

export default Welcome;
