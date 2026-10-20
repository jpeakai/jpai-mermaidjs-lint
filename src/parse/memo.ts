// A parse result depends only on its source, and a split plan measures the
// same candidate diagram many times over, so each source is parsed once. Every
// caller gets its own copy, so no caller can change what another reads.

const LIMIT = 512;

export const memoBySource = <T>(read: (source: string) => Promise<T>): ((source: string) => Promise<T>) => {
  const cache = new Map<string, Promise<T>>();
  return async (source) => {
    let hit = cache.get(source);
    if (!hit) {
      hit = read(source);
      cache.set(source, hit);
      const oldest = cache.keys().next().value;
      if (cache.size > LIMIT && oldest !== undefined) cache.delete(oldest);
    }
    return structuredClone(await hit);
  };
};
