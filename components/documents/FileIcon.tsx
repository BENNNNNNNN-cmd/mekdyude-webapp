"use client";

function getIconProps(mimeType: string): { paths: string[]; color: string } {
  if (mimeType === "application/pdf") {
    return {
      color: "#A32D2D",
      paths: [
        "M7 2h7l5 5v13a2 2 0 01-2 2H7a2 2 0 01-2-2V4a2 2 0 012-2z",
        "M14 2v5h5",
        "M9 13h6",
        "M9 17h4",
        "M9 9h1",
      ],
    };
  }

  if (
    mimeType.includes("spreadsheet") ||
    mimeType.includes("excel") ||
    mimeType === "text/csv"
  ) {
    return {
      color: "#3B6D11",
      paths: [
        "M7 2h7l5 5v13a2 2 0 01-2 2H7a2 2 0 01-2-2V4a2 2 0 012-2z",
        "M14 2v5h5",
        "M8 12h8M8 16h8M8 12v8M12 12v8M16 12v8",
      ],
    };
  }

  if (mimeType.startsWith("image/")) {
    return {
      color: "#854F0B",
      paths: [
        "M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z",
        "M8.5 10a1.5 1.5 0 100-3 1.5 1.5 0 000 3z",
        "M21 15l-5-5L5 21",
      ],
    };
  }

  if (mimeType === "application/zip") {
    return {
      color: "#5F5E5A",
      paths: [
        "M7 2h7l5 5v13a2 2 0 01-2 2H7a2 2 0 01-2-2V4a2 2 0 012-2z",
        "M14 2v5h5",
        "M10 12h4v4h-4v-4z",
        "M12 8v4",
      ],
    };
  }

  // Generic document
  return {
    color: "#5F5E5A",
    paths: [
      "M7 2h7l5 5v13a2 2 0 01-2 2H7a2 2 0 01-2-2V4a2 2 0 012-2z",
      "M14 2v5h5",
      "M9 13h6",
      "M9 17h4",
    ],
  };
}

export default function FileIcon({
  mimeType,
  size = 24,
}: {
  mimeType: string;
  size?: number;
}) {
  const { paths, color } = getIconProps(mimeType);

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}
