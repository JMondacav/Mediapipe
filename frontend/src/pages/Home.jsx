import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "../components/Icon";
import { Button, Field, Logo, Notice, PhraseCard, Screen } from "../components/ui";
import { useAuth } from "../context/auth";
import { useShow } from "../context/show";
import { PHRASES, QUICK_PHRASE_IDS, QUICK_SIGN_PHRASE_IDS } from "../data/phrases";
import useMyPhrases from "../hooks/useMyPhrases";

const byId = (id) => PHRASES.find((phrase) => phrase.id === id);
const QUICK = QUICK_PHRASE_IDS.map(byId);
const QUICK_SIGNS = QUICK_SIGN_PHRASE_IDS.map(byId);

function LearnLink({ icon, title, text, onClick }) {
  return (
    <button type="button" className="learn-card" onClick={onClick}>
      <span className="picto" style={{ "--size": "52px" }} aria-hidden="true">
        <Icon name={icon} />
      </span>
      <span>
        <span className="t-label">{title}</span>
        <span className="t-caption t-muted">{text}</span>
      </span>
      <Icon name="chevron" className="chev" />
    </button>
  );
}

// Frases propias (por ejemplo la dirección o una alergia), para mostrarlas
// escritas en grande a la persona oyente.
function MyPhrases({ onShow }) {
  const myPhrases = useMyPhrases();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");

  const save = () => {
    myPhrases.add(draft);
    setDraft("");
    setAdding(false);
  };

  return (
    <>
      <h2 className="t-h2">Mis frases</h2>
      <p className="t-body t-muted">
        Guarda frases que usas seguido, por ejemplo tu dirección o una alergia.
      </p>
      <div className="stack">
        {myPhrases.phrases.map((phrase) => (
          <div key={phrase.id} className="stack">
            <PhraseCard
              text={phrase.text}
              icon="bookmark"
              hint="Mostrar a la otra persona"
              onClick={() => onShow(phrase.text, "bookmark")}
            />
            <Button
              label="Borrar esta frase"
              ariaLabel={`Borrar frase: ${phrase.text}`}
              variant="ghost"
              size="sm"
              icon="trash"
              onClick={() => myPhrases.remove(phrase.id)}
            />
          </div>
        ))}
      </div>

      {adding ? (
        <>
          <Field
            label="Nueva frase"
            multiline
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Ej.: Mi dirección es…"
            maxLength={200}
          />
          <div className="btn-row">
            <Button label="Guardar frase" icon="bookmark" disabled={!draft.trim()} onClick={save} />
            <Button label="Cancelar" variant="secondary" onClick={() => setAdding(false)} />
          </div>
        </>
      ) : (
        <Button
          label="Agregar una frase"
          icon="bookmark"
          variant="secondary"
          onClick={() => setAdding(true)}
        />
      )}
    </>
  );
}

function Home() {
  const navigate = useNavigate();
  const showMessage = useShow();
  const { user, role, setRole } = useAuth();
  const [message, setMessage] = useState("");
  const isSigner = role !== "hearing";

  const show = (text, icon) => showMessage({ text, icon });

  return (
    <Screen>
      <div className="home-head fade-in">
        <Logo size={64} />
        <div>
          <h1 className="t-h2">{user?.username ? `Hola, ${user.username}` : "Hola"}</h1>
          <p className="t-body t-muted">{isSigner ? "Modo Señas" : "Modo Voz"}</p>
        </div>
      </div>
      <Button
        label={isSigner ? "Cambiar a modo Voz" : "Cambiar a modo Señas"}
        variant="ghost"
        size="sm"
        icon="swap"
        onClick={() => setRole(isSigner ? "hearing" : "signer")}
      />

      {isSigner ? (
        <>
          <Button
            label="Señar y traducir"
            icon="video"
            size="hero"
            hint="Abre la cámara cuando tú lo decidas"
            onClick={() => navigate("/translate?modo=senas")}
          />

          <h2 className="t-h2">Aprender</h2>
          <LearnLink
            icon="video"
            title="Aprender señas"
            text="Mira en video cómo se hacen las frases frecuentes"
            onClick={() => navigate("/learn?seccion=aprender")}
          />
          <LearnLink
            icon="record"
            title="Grabar señas (equipo)"
            text="Graba ejemplos de señas para entrenar el modelo"
            onClick={() => navigate("/learn?seccion=grabar")}
          />

          <MyPhrases onShow={show} />

          <h2 className="t-h2">Frases rápidas</h2>
          <p className="t-body t-muted">Toca una frase para mostrarla en pantalla grande.</p>
          <div className="stack">
            {QUICK.map((phrase) => (
              <PhraseCard
                key={phrase.id}
                text={phrase.text}
                icon={phrase.icon}
                hint="Mostrar a la otra persona"
                onClick={() => show(phrase.text, phrase.icon)}
              />
            ))}
          </div>
        </>
      ) : (
        <>
          <Button
            label="Hablar y mostrar texto"
            icon="mic"
            size="hero"
            variant="accent"
            hint="Activa el micrófono cuando tú lo decidas"
            onClick={() => navigate("/translate?modo=voz")}
          />

          <h2 className="t-h2">Frases en señas</h2>
          <p className="t-body t-muted">Toca una frase para mostrarle su seña a la persona sorda.</p>
          <div className="stack">
            {QUICK_SIGNS.map((phrase) => (
              <PhraseCard
                key={phrase.id}
                text={phrase.text}
                icon={phrase.icon}
                hint="Muestra la seña en pantalla completa"
                onClick={() => showMessage({ text: phrase.text, icon: phrase.icon, video: phrase.id })}
              />
            ))}
          </div>
          <Button
            label="Ver todas las frases"
            icon="message-dots"
            variant="secondary"
            onClick={() => navigate("/translate?modo=voz")}
          />

          <h2 className="t-h2">Escribir un mensaje</h2>
          <Field
            label="Mensaje para mostrar"
            multiline
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Escribe aquí…"
          />
          <Button
            label="Mostrar en pantalla grande"
            icon="phone"
            size="lg"
            disabled={!message.trim()}
            onClick={() => show(message.trim())}
          />

          <h2 className="t-h2">Aprender señas básicas</h2>
          <Button
            label="Ver cómo se hacen las señas"
            icon="video"
            variant="secondary"
            onClick={() => navigate("/learn?seccion=aprender")}
          />
        </>
      )}

      <Notice icon="lock">
        La cámara y el micrófono solo se usan cuando tú lo pides. No guardamos videos ni audios.
      </Notice>
    </Screen>
  );
}

export default Home;
