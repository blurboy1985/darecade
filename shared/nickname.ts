/** Nicknames are handles, not a place to share identity or contact details. */
export function nicknameError(value: string): string | null {
  const name = value.normalize("NFKC").trim().replace(/\s+/g, " ");
  if (!/^[\p{L}][\p{L}\p{N}_-]{1,19}$/u.test(name))
    return "Use a 2–20 character nickname without spaces or contact details. Don't use your real name.";
  const plain = name
    .toLowerCase()
    .replace(
      /[013457@$]/g,
      (c) =>
        ({
          "0": "o",
          "1": "i",
          "3": "e",
          "4": "a",
          "5": "s",
          "7": "t",
          "@": "a",
          $: "s",
        })[c] || c,
    )
    .replace(/[_-]/g, "");
  if (
    /\d{4}|(?:gmail|hotmail|outlook|whatsapp|telegram|discord|instagram|snapchat|tiktok|phone|email)/i.test(
      name,
    ) ||
    /(?:fuck|shit|bitch|cunt|nigger|faggot|sex|porn|nazi)/.test(plain)
  )
    return "Choose a friendly nickname without contact details or inappropriate words.";
  if (
    /^(?:mr|mrs|miss|ms|dr)[_-]|^[\p{L}]{2,}[-_][\p{L}]{2,}$/u.test(name) ||
    /^(?:john|jane|james|mary|daniel|david|sarah|michael|siti|muhammad|wei|ming)(?:tan|lim|lee|ng|wong|chen|smith|jones|quek)$/i.test(
      plain,
    )
  )
    return "Don't use your real name. Choose a made-up nickname.";
  return null;
}
