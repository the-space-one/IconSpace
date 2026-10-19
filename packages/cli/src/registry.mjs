// The icon registry: JSON that the IconSpace site serves at /r (built from
// the site's own icon files by scripts/build-registry.mjs in the landing repo).
//   /r/index.json   the catalog: id, name, component, keywords, dependencies
//   /r/<id>.json    one icon, with the source of every file it needs

export const DEFAULT_REGISTRY = "https://iconspace.dev/r";

/** An expected failure: printed as a message, no stack trace. */
export class CliError extends Error {}

export const registryUrl = (flag) => (flag || process.env.ICONSPACE_REGISTRY || DEFAULT_REGISTRY).replace(/\/+$/, "");

async function getJson(url) {
  let response;
  try {
    response = await fetch(url, { headers: { accept: "application/json" } });
  } catch (error) {
    throw new CliError(`Couldn't reach ${url} (${error.cause?.code ?? error.message}). Check your connection and try again.`);
  }
  if (!response.ok) throw new CliError(`${url} answered ${response.status} ${response.statusText}.`);
  try {
    return await response.json();
  } catch {
    throw new CliError(`${url} didn't send valid JSON. Is --registry pointing at an IconSpace registry?`);
  }
}

export async function fetchCatalog(base) {
  const index = await getJson(`${base}/index.json`);
  if (!Array.isArray(index?.icons)) throw new CliError(`${base}/index.json isn't an IconSpace registry.`);
  return index.icons;
}

export const fetchIcon = (base, id) => getJson(`${base}/${encodeURIComponent(id)}.json`);

// "CartIcon", "cart icon" and "Cart" all mean "cart".
const normalise = (name) =>
  name
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase()
    .replace(/[-\s_]*icon$/, "")
    .replace(/[\s_]+/g, "-");

export function findIcon(catalog, name) {
  const key = normalise(name);
  return catalog.find(
    (icon) => icon.id === key || normalise(icon.component) === key || normalise(icon.name) === key,
  );
}

/** Close matches for a name that isn't in the catalog. */
export function suggest(catalog, name, count = 3) {
  const key = normalise(name);
  return catalog
    .map((icon) => {
      const words = [icon.id, icon.name.toLowerCase(), ...icon.keywords];
      const score = words.reduce((best, word) => {
        if (word === key) return Math.max(best, 3);
        // Short words ("art") would match half the catalog the other way round.
        if (word.startsWith(key) || (word.length > 3 && key.startsWith(word))) return Math.max(best, 2);
        if (word.includes(key) || (word.length > 3 && key.includes(word))) return Math.max(best, 1);
        return best;
      }, 0);
      return { id: icon.id, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, count)
    .map(({ id }) => id);
}
