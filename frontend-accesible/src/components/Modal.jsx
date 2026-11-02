import Icon from "./Icon";

function Modal({ onClose, label, children }) {
  return (
    <div className="a-modal-backdrop" role="dialog" aria-modal="true" aria-label={label}>
      <div className="a-modal">
        <button
          className="a-icon-btn a-icon-btn--sm a-modal-close"
          onClick={onClose}
          aria-label="Cerrar"
        >
          <Icon name="close" />
        </button>
        {children}
      </div>
    </div>
  );
}

export default Modal;
