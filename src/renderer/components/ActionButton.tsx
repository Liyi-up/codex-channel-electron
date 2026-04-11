type ActionButtonProps = {
  className: string;
  label: string;
  busyText: string;
  loading: boolean;
  disabled?: boolean;
  onClick: () => void;
};

function ActionButton(props: ActionButtonProps) {
  const { className, label, busyText, loading, disabled, onClick } = props;

  return (
    <button className={className} type="button" disabled={disabled || loading} onClick={onClick}>
      <span className={`spinner ${loading ? '' : 'hidden'}`} aria-hidden="true" />
      <span className="label">{loading ? busyText : label}</span>
    </button>
  );
}

export default ActionButton;
