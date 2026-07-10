// Shared name-normalisation + fuzzy matching for the data pipeline.
// `normalize` is lifted verbatim from scripts/update-squads.mjs so squad data,
// rating backfill, and historical matching all key names the exact same way.

export function normalize(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’‘`´]/g, "'")
    .replace(/["“”]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

// Tokens worth matching on — drop 1-char initials so "K. Mbappe" still hits
// "Kylian Mbappe" (the initial "k" is not required, the surname carries it).
export function nameTokens(value) {
  return normalize(value)
    .split(" ")
    .filter((token) => token.length > 1);
}

// True when every meaningful token of `shortName` appears in `fullName`
// (order-independent). This is the token-containment rule already used to
// reconcile shirt names against full names in update-squads.mjs.
export function tokensContained(shortName, fullName) {
  const full = normalize(fullName);
  const tokens = nameTokens(shortName);
  if (tokens.length === 0) return false;
  return tokens.every((token) => full.includes(token));
}

// Symmetric fuzzy name match: exact, or either name's tokens contained in the
// other. Surname-only overlap alone is intentionally NOT enough (too many
// shared surnames) — we require the shorter name's tokens to all be present.
export function namesMatch(a, b) {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  return tokensContained(a, b) || tokensContained(b, a);
}

// Match a clean "First Last" (our data) against a fuller "First Middle Last"
// (the FIFA long name). The SURNAME (last token) must appear exactly, and every
// other token must be an exact token or a prefix of one (so "Gio" hits
// "Giovanni", "Chris" hits "Christopher"). This accepts nicknames while
// rejecting surname-only collisions: "Miles Robinson" ≠ "Antonee Robinson"
// because "miles" is neither a token nor a prefix of "antonee".
export function matchFullName(cleanName, fullName) {
  const tokens = nameTokens(cleanName);
  const longTokens = nameTokens(fullName);
  if (tokens.length === 0 || longTokens.length === 0) return false;
  const surname = tokens[tokens.length - 1];
  if (surname.length < 3 || !longTokens.includes(surname)) return false;
  for (let i = 0; i < tokens.length - 1; i += 1) {
    const t = tokens[i];
    const ok = longTokens.some((lt) => lt === t || (t.length >= 3 && lt.startsWith(t)));
    if (!ok) return false;
  }
  return true;
}
