/**
 * Rules for the single name a pilot picks: it is both their display name and
 * the handle they sign in with, so it has to be unique, reasonably shaped, and
 * free of slurs and profanity.
 *
 * The word lists below are deliberately split. Long, unambiguous terms are
 * matched anywhere inside the name, because padding and separators are the
 * usual way people sneak them past a filter. Short terms are matched only as
 * standalone words, because as substrings they collide with ordinary
 * words and names — "class" contains one, "raccoon" and "spicy" contain
 * others. Neither list tries to be exhaustive; extend as needed.
 */

const SUBSTRING_TERMS = [
  "fuck", "shit", "bitch", "bastard", "asshole", "dickhead", "motherfucker",
  "cunt", "whore", "slut", "nigger", "nigga", "faggot", "kike", "wetback",
  "tranny", "shemale", "retard", "rapist", "molester", "nazi", "hitler",
  "gook", "raghead", "towelhead",
];

// Terms that are also ordinary given names or surnames are deliberately absent
// — "Dick", "Van Dyke", "Coon" and "Hoe" are real names, and wrongly rejecting
// someone's own name is worse here than letting a mild word through. The
// compound forms that are unambiguously abusive ("dickhead") are caught above.
const WORD_TERMS = [
  "ass", "arse", "damn", "crap", "cock", "piss", "twat", "wank",
  "fag", "jap", "spic", "paki", "chink", "kkk", "tard", "bollocks",
];

/**
 * Ordinary words that happen to contain a banned substring. They're removed
 * before scanning, so "Scunthorpe" passes while a bare "c.u.n.t" still doesn't.
 */
const ALLOWED_WORDS = [
  "scunthorpe", "penistone", "shiitake", "gobbledygook",
  "nazir", "nazim", "nazia", "shitake",
];

// Characters commonly swapped in to disguise a word.
const LEET: Record<string, string> = {
  "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b",
  "@": "a", "$": "s", "!": "i", "|": "l", "+": "t",
};

/** Lowercase, undo leet substitutions, drop everything that isn't a letter. */
function canonical(value: string): string {
  return value
    .toLowerCase()
    .split("")
    .map((c) => LEET[c] ?? c)
    .filter((c) => c >= "a" && c <= "z")
    .join("");
}

/** Collapse runs of the same letter, so "fuuuuck" reads as "fuck". */
function collapse(value: string): string {
  return value.replace(/(.)\1+/g, "$1");
}

export function containsBannedWord(value: string): boolean {
  let flat = collapse(canonical(value));
  for (const allowed of ALLOWED_WORDS) {
    flat = flat.split(collapse(canonical(allowed))).join("");
  }
  if (SUBSTRING_TERMS.some((term) => flat.includes(collapse(term)))) return true;

  // Split on separators and camelCase boundaries to find standalone words.
  const words = value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .map((w) => canonical(w))
    .filter(Boolean);
  return words.some((w) => WORD_TERMS.includes(w) || WORD_TERMS.includes(collapse(w)));
}

export const NAME_MIN = 2;
export const NAME_MAX = 30;

/**
 * Validate a chosen name. Returns an error message, or null when it's fine.
 * Uniqueness is checked separately against the database.
 */
export function nameError(value: string): string | null {
  const name = value.trim();
  if (name.length < NAME_MIN || name.length > NAME_MAX) {
    return `Name must be between ${NAME_MIN} and ${NAME_MAX} characters.`;
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9 ._'-]*[A-Za-z0-9]$/.test(name)) {
    return "Name can use letters, numbers, spaces, and . _ ' - and must start and end with a letter or number.";
  }
  if (/ {2,}/.test(name)) return "Name can't contain double spaces.";
  if (!/[A-Za-z]/.test(name)) return "Name needs at least one letter.";
  if (containsBannedWord(name)) return "Please choose a different name.";
  return null;
}
