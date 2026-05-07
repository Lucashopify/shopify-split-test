import React from "react";

export type SelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
  badge?: string;
  iconUrl?: string;
  iconInitial?: string;
  iconColor?: string;
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
        {selected?.iconUrl || selected?.iconInitial ? (
          <span style={{ flexShrink: 0, width: 24, height: 24, borderRadius: 4, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", background: selected.iconColor ?? "#e9e9e9", fontSize: "0.65rem", fontWeight: 700, color: "#fff" }}>
            {selected.iconUrl
              ? <img src={selected.iconUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              : selected.iconInitial}
          </span>
        ) : null}
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
                color: opt.disabled ? "#bbb" : opt.value === value ? "#111" : "#444",
                background: opt.value === value ? "#f5f5f5" : "#fff",
                cursor: opt.disabled ? "default" : "pointer",
                userSelect: "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "0.5rem",
              }}
              onMouseEnter={(e) => {
                if (!opt.disabled) (e.currentTarget as HTMLDivElement).style.background = opt.value === value ? "#f0f0f0" : "#fafafa";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLDivElement).style.background = opt.value === value ? "#f5f5f5" : "#fff";
              }}
            >
              {opt.iconUrl || opt.iconInitial ? (
                <span style={{ flexShrink: 0, width: 48, height: 36, borderRadius: 4, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", background: opt.iconColor ?? "#e9e9e9", fontSize: "0.65rem", fontWeight: 700, color: "#fff" }}>
                  {opt.iconUrl
                    ? <img src={opt.iconUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    : opt.iconInitial}
                </span>
              ) : null}
              <span>{opt.label}</span>
              {opt.badge && (
                <span style={{
                  fontSize: "0.65rem",
                  fontWeight: 600,
                  color: "#aaa",
                  background: "#f3f3f3",
                  borderRadius: 4,
                  padding: "0.1rem 0.4rem",
                  letterSpacing: "0.03em",
                  flexShrink: 0,
                }}>
                  {opt.badge}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
