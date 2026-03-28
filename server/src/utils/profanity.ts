// Russian and common English profanity roots
// Checks for substring match after normalization (ё→е, repeated chars, lowercase)
const PROFANE_ROOTS = [
  // Russian mat — base forms
  "хуй", "хую", "хуя", "хуе", "хуё", "хуи", "хуин", "хуйн",
  "пизд", "пёзд",
  "ебат", "ёбат", "ебан", "ёбан", "еблан", "ёблан", "ебл",
  "блять", "блядь", "бляд",
  "манд",
  "залуп",
  "уёбищ", "уебищ",
  "пидор", "пидар", "пиздар",
  "мудак", "мудил", "мудозвон",
  "ёбнут", "ёбнул",
  "выеб", "наеб", "отъеб", "поеб", "проеб", "съеб", "заеб",
  "ёб твою", "еб твою",
  "сука", "суч",
  "шлюх",
  "долбоёб", "долбоеб",
  // English
  "fuck", "shit", "cunt", "nigger", "nigga", "bitch", "asshole", "faggot",
];

function normalize(str: string): string {
  return str
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\wа-яё]/gi, " ") // keep only letters
    .replace(/(.)\1{2,}/g, "$1$1"); // reduce 3+ repeated chars to 2
}

export function containsProfanity(text: string): boolean {
  const normalized = normalize(text);
  return PROFANE_ROOTS.some((root) => normalized.includes(normalize(root)));
}
