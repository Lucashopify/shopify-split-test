import React from "react";

export type SelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

type SelectProps = {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  name?: string;
  style?: React.CSSProperties;
  placeholder?: string;
};

const CHEVRON = (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
    <path d="M2.5 4.5L6 8l3.5-3.5" stroke="#aaa" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export function Select({ value, onChange, options, name, style, placeholder }: SelectProps) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const selected = options.find((o) => o.value === value);

  return (
    <div ref={ref} style={{ position: "relative", ...style }}>
      {name && <input type="hidden" name={name} value={value} readOnly />}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          padding: "0.5rem 0.75rem",
          border: `1px solid ${open ? "#aaa" : "#e9e9e9"}`,
          borderRadius: 6,
          fontSize: "0.875rem",
          color: selected ? "#111" : "#aaa",
          background: "#fff",
          cursor: "pointer",
          textAlign: "left",
          outline: "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.5rem",
          boxSizing: "border-box",
          transition: "border-color 0.15s",
        }}
      >
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {selected?.label ?? placeholder ?? "Select…"}
        </span>
        {CHEVRON}
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 3px)",
            left: 0,
            right: 0,
            zIndex: 200,
            background: "#fff",
            border: "1px solid #e9e9e9",
            borderRadius: 6,
            boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
            overflow: "hidden",
          }}
        >
          {options.map((opt) => (
            <div
              key={opt.value}
              onMouseDown={(e) => {
                e.preventDefault();
                if (opt.disabled) return;
                onChange(opt.value);
                setOpen(false);
              }}
              style={{
                padding: "0.5rem 0.75rem",
                fontSize: "0.875rem",
                color: opt.disabled ? "#ccc" : opt.value === value ? "#111" : "#444",
                background: opt.value === value ? "#f5f5f5" : "#fff",
                cursor: opt.disabled ? "default" : "pointer",
                userSelect: "none",
              }}
              onMouseEnter={(e) => {
                if (!opt.disabled) (e.currentTarget as HTMLDivElement).style.background = opt.value === value ? "#f0f0f0" : "#fafafa";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLDivElement).style.background = opt.value === value ? "#f5f5f5" : "#fff";
              }}
            >
              {opt.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
