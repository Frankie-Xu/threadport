import type { SVGProps } from "react";

export type IconName =
  | "activity"
  | "archive"
  | "arrow-up-right"
  | "bolt"
  | "box"
  | "check"
  | "chevron-right"
  | "clock"
  | "copy"
  | "folder"
  | "history"
  | "inbox"
  | "layers"
  | "link"
  | "plus"
  | "search"
  | "settings"
  | "spark"
  | "terminal";

const paths: Record<IconName, string> = {
  activity: "M3 12h4l2-7 4 14 2-7h6",
  archive: "M4 7h16v13H4z M3 4h18v3H3z M9 11h6",
  "arrow-up-right": "M7 17 17 7 M8 7h9v9",
  bolt: "m13 2-9 12h7l-1 8 9-12h-7z",
  box: "m12 3 8 4.5v9L12 21l-8-4.5v-9z M4 7.5 12 12l8-4.5 M12 12v9",
  check: "m5 12 4 4L19 6",
  "chevron-right": "m9 5 7 7-7 7",
  clock: "M12 7v5l3 2 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  copy: "M8 8h11v11H8z M5 16H4V4h12v1",
  folder: "M3 6h6l2 2h10v10H3z",
  history: "M3 12a9 9 0 1 0 3-6.7 M3 4v5h5 M12 7v5l3 2",
  inbox: "M4 5h16v14H4z M4 14h4l2 3h4l2-3h4",
  layers: "m12 3 9 5-9 5-9-5z M3 12l9 5 9-5 M3 16l9 5 9-5",
  link: "M10 13a5 5 0 0 0 7.5.4l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1 M14 11a5 5 0 0 0-7.5-.4l-2 2a5 5 0 0 0 7.1 7.1l1.1-1.1",
  plus: "M12 5v14 M5 12h14",
  search: "m20 20-4.5-4.5 M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z",
  settings: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z M4.9 4.9l1.4 1.4 M17.7 17.7l1.4 1.4 M4 12H2 M22 12h-2 M4.9 19.1l1.4-1.4 M17.7 6.3l1.4-1.4 M12 4V2 M12 22v-2",
  spark: "m12 3 1.4 5.6L19 10l-5.6 1.4L12 17l-1.4-5.6L5 10l5.6-1.4z",
  terminal: "M4 5h16v14H4z M8 10l2 2-2 2 M12 14h4",
};

export function Icon({
  name,
  size = 18,
  strokeWidth = 1.75,
  ...props
}: { name: IconName; size?: number; strokeWidth?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth}
      {...props}
    >
      <path d={paths[name]} />
    </svg>
  );
}
