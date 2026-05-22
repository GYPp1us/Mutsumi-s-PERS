interface ActionButtonProps {
  loading: boolean;
  onClick: () => void;
  children: React.ReactNode;
  style?: React.CSSProperties;
  disabled?: boolean;
}

export function ActionButton({ loading, onClick, children, style, disabled }: ActionButtonProps) {
  const disabled_ = disabled || loading;

  const enter = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!disabled_) e.currentTarget.style.filter = "brightness(1.2)";
  };
  const leave = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.filter = "";
    e.currentTarget.style.transform = "";
    e.currentTarget.style.color = "";
  };
  const down = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!disabled_) e.currentTarget.style.transform = "scale(0.97)";
  };
  const up = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!disabled_) e.currentTarget.style.transform = "scale(1.08)";
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled_}
      style={{
        border: "none",
        padding: "6px 14px",
        fontSize: 12,
        cursor: disabled_ ? "default" : "pointer",
        opacity: disabled_ ? 0.5 : 1,
        transition: "all 0.15s ease",
        ...style,
      }}
      className={loading ? "btn-loading" : ""}
      onMouseEnter={enter}
      onMouseLeave={leave}
      onMouseDown={down}
      onMouseUp={up}
    >
      {loading ? "\u00B7 \u00B7 \u00B7" : children}
    </button>
  );
}
