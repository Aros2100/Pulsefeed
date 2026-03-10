"use client";

interface VersionOption {
  version: string;
  active: boolean;
}

interface Props {
  versions: VersionOption[];
  selected: string | null;
}

export default function VersionSelector({ versions, selected }: Props) {
  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const v = e.target.value;
    const url = new URL(window.location.href);
    url.searchParams.set("version", v);
    window.location.href = url.toString();
  }

  return (
    <select
      value={selected ?? ""}
      onChange={handleChange}
      style={{
        fontSize: "12px",
        padding: "5px 10px",
        border: "1px solid #dde3ed",
        borderRadius: "6px",
        background: "#fff",
        color: "#1a1a1a",
        cursor: "pointer",
        outline: "none",
      }}
    >
      {versions.map((v, i) => (
        <option key={`${v.version}-${i}`} value={v.version}>
          {v.version}{v.active ? " (aktiv)" : ""}
        </option>
      ))}
    </select>
  );
}
