interface Props {
  onClick: () => void;
}

export const WordQuestBackButton = ({ onClick }: Props) => (
  <button type="button" className="wordquest-back-btn" onClick={onClick}>
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
      <path
        d="M19 12H5M12 5l-7 7 7 7"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
    Go back
  </button>
);