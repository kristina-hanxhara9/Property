// Defensive renderer for any value that might come from an external API.
// Many UK government APIs return wrapped { code, description } / { value }
// objects. Trying to render those directly throws React error #31.
//
// safeText() always returns a string suitable for use as JSX text.
export function safeText(value, fallback = '—') {
  if (value == null) return fallback;
  if (typeof value === 'string') return value || fallback;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) {
    return value.map((v) => safeText(v, '')).filter(Boolean).join(', ') || fallback;
  }
  if (typeof value === 'object') {
    return (
      value.description ||
      value.name ||
      value.label ||
      value.value ||
      value.title ||
      value.text ||
      JSON.stringify(value)
    );
  }
  return String(value);
}

// Convenience for inline rendering in JSX.
export function T({ value, fallback = '—' }) {
  return safeText(value, fallback);
}
