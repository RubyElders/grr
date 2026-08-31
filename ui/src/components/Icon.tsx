interface IconProps {
  name: "chevron" | "file" | "folder" | "comment" | "search" | "close" | "arrow-left" | "arrow-right";
  size?: number;
}

export function Icon({ name, size = 16 }: IconProps) {
  const paths = {
    chevron: <path d="m6 9 6 6 6-6" />,
    file: <path d="M6 2h8l4 4v16H6zM14 2v5h5" />,
    folder: <path d="M3 5h7l2 2h9v13H3z" />,
    comment: <path d="M4 4h16v12H9l-5 4z" />,
    search: <path d="m20 20-4.2-4.2m1.2-5.3a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Z" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    "arrow-left": <path d="m15 18-6-6 6-6" />,
    "arrow-right": <path d="m9 6 6 6-6 6" />,
  };
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  );
}
