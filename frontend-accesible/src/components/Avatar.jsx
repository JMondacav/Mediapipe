import Icon from "./Icon";

// Avatar de animal con su color; sin avatar, el ícono de persona.
function Avatar({ avatar, size = "" }) {
  const style = avatar
    ? { "--avatar-color": avatar.color, "--avatar-soft": avatar.soft }
    : undefined;

  return (
    <span className={`a-avatar ${size ? `a-avatar--${size}` : ""}`} style={style}>
      {avatar ? avatar.emoji : <Icon name="user" />}
    </span>
  );
}

export default Avatar;
