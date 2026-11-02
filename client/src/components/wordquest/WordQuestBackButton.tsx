interface Props {
  onClick: () => void;
  label?: string;
}

export const WordQuestBackButton = ({ onClick, label = "Go back" }: Props) => (
  <button type="button" className="wordquest-back-btn" onClick={onClick}>
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <path
        d="M19 12H5M12 5l-7 7 7 7"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
    {label}
  </button>
);