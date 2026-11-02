// "TE_QUIERO" / "te-quiero" -> "TE QUIERO"
export function normalizeLabel(label) {
  const normalized = String(label || "")
    .trim()
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\s+/g, " ")
    .toUpperCase();

  if (normalized === "TEQUIERO") return "TE QUIERO";
  return normalized;
}
