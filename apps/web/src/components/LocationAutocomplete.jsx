import { useEffect, useRef, useState } from "react";

const SUGGESTION_DEBOUNCE_MS = 300;
const MAX_SUGGESTIONS = 8;

// Strips Vietnamese diacritics so "da lat" matches "Đà Lạt".
function normalize(str) {
  return String(str)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase();
}

// Free-text location search with debounced, accent-insensitive suggestions.
// The full location list is fetched once by the caller (small enough — a few
// hundred rows — to filter client-side); typing doesn't hit the network, it
// just re-filters that cached list, debounced so fast typing doesn't
// recompute/re-render the dropdown on every keystroke.
//
// `variant`: "light" (default) is the original styling for the public,
// white-background pages (Booking/MyBookings). "dark" swaps in the admin
// navy/gold tokens so this can be reused on dark admin pages (e.g. Calendar)
// without hardcoded light-theme text being unreadable there.
const VARIANT_COLORS = {
  light: {
    text: "#002366",
    clear: "#94a3b8",
    dropdownBg: "#fff",
    dropdownBorder: "#e2e8f0",
    dropdownShadow: "0 12px 32px rgba(0,0,0,0.18)",
    optionText: "#1A1C1E",
    optionBorder: "#f1f5f9",
    optionHoverBg: "#f8fafc",
  },
  dark: {
    text: "var(--color-text-primary)",
    clear: "var(--color-text-muted)",
    dropdownBg: "var(--color-navy-800)",
    dropdownBorder: "var(--color-border-soft)",
    dropdownShadow: "var(--shadow-card-hover)",
    optionText: "var(--color-text-primary)",
    optionBorder: "var(--color-border-soft)",
    optionHoverBg: "var(--color-navy-900)",
  },
};

export default function LocationAutocomplete({
  value,
  onChange,
  options,
  placeholder = "Nhập địa điểm...",
  style,
  variant = "light",
}) {
  const colors = VARIANT_COLORS[variant] || VARIANT_COLORS.light;
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const containerRef = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      if (!value.trim()) {
        setSuggestions([]);
        return;
      }
      const query = normalize(value);
      const matches = options
        .filter((opt) => normalize(opt).includes(query))
        .slice(0, MAX_SUGGESTIONS);
      setSuggestions(matches);
    }, SUGGESTION_DEBOUNCE_MS);

    return () => clearTimeout(debounceRef.current);
  }, [value, options]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} style={{ position: "relative", width: "100%", ...style }}>
      <div style={{ display: "flex", alignItems: "center" }}>
        <input
          type="text"
          value={value}
          placeholder={placeholder}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
            if (e.key === "Enter") setOpen(false);
          }}
          style={{
            width: "100%",
            border: "none",
            outline: "none",
            background: "transparent",
            color: colors.text,
            fontWeight: 500,
            fontSize: 14,
            paddingRight: value ? 20 : 0,
          }}
        />
        {value && (
          <button
            type="button"
            onClick={() => {
              onChange("");
              setSuggestions([]);
              setOpen(false);
            }}
            aria-label="Xóa địa điểm"
            style={{
              position: "absolute",
              right: 0,
              background: "none",
              border: "none",
              color: colors.clear,
              cursor: "pointer",
              fontSize: 16,
              lineHeight: 1,
              padding: 0,
            }}
          >
            ×
          </button>
        )}
      </div>

      {open && suggestions.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            left: 0,
            right: 0,
            minWidth: 240,
            background: colors.dropdownBg,
            borderRadius: 8,
            boxShadow: colors.dropdownShadow,
            border: `1px solid ${colors.dropdownBorder}`,
            zIndex: 50,
            maxHeight: 260,
            overflowY: "auto",
          }}
        >
          {suggestions.map((opt) => (
            <button
              type="button"
              key={opt}
              onClick={() => {
                onChange(opt);
                setSuggestions([]);
                setOpen(false);
              }}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "10px 14px",
                background: "transparent",
                border: "none",
                borderBottom: `1px solid ${colors.optionBorder}`,
                color: colors.optionText,
                fontSize: 13,
                cursor: "pointer",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = colors.optionHoverBg)}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
