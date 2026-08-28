import slugify from 'slugify';

export function toSlug(value: string): string {
  return slugify(value, { lower: true, strict: true, trim: true, locale: 'pt' });
}

/**
 * Garante um slug unico consultando o banco atraves de um callback.
 * Ex.: nome-do-produto, nome-do-produto-2, nome-do-produto-3...
 */
export async function uniqueSlug(
  base: string,
  exists: (slug: string) => Promise<boolean>,
): Promise<string> {
  const root = toSlug(base) || 'item';
  let candidate = root;
  let counter = 2;

  while (await exists(candidate)) {
    candidate = `${root}-${counter}`;
    counter += 1;
    if (counter > 500) {
      candidate = `${root}-${Date.now()}`;
      break;
    }
  }

  return candidate;
}
