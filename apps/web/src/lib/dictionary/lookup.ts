import Redis from "ioredis";

export type DictSense = {
  pos: string;
  en: string;
  zh: string;
};

export type DictResult = {
  query: string;
  phonetic: string | null;
  senses: DictSense[];
  note?: string;
};

const MAX_QUERY_LEN = 64;
const CACHE_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days
const FREE_DICT_BASE = "https://api.dictionaryapi.dev/api/v2/entries/en";
const MYMEMORY_BASE = "https://api.mymemory.translated.net/get";

const memoryCache = new Map<string, { expiresAt: number; value: DictResult }>();

let redisClient: Redis | null | undefined;

function getOptionalRedis(): Redis | null {
  if (redisClient !== undefined) return redisClient;
  const url = process.env.REDIS_URL;
  if (!url) {
    redisClient = null;
    return null;
  }
  try {
    redisClient = new Redis(url, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: false,
      lazyConnect: true,
      connectTimeout: 2000,
    });
    redisClient.on("error", () => {
      /* swallow; memory cache is the fallback */
    });
    return redisClient;
  } catch {
    redisClient = null;
    return null;
  }
}

/** Normalize to letters/spaces only, collapse whitespace, max 64 chars. */
export function normalizeQuery(raw: string): string {
  return raw
    .normalize("NFKC")
    .replace(/[^a-zA-Z\s'-]/g, " ")
    .replace(/['-]+/g, (m) => m[0] ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_QUERY_LEN)
    .toLowerCase();
}

function cacheKey(q: string): string {
  return `dict:${q}`;
}

async function cacheGet(q: string): Promise<DictResult | null> {
  const key = cacheKey(q);
  const mem = memoryCache.get(key);
  if (mem && mem.expiresAt > Date.now()) {
    return mem.value;
  }
  if (mem) memoryCache.delete(key);

  const redis = getOptionalRedis();
  if (!redis) return null;
  try {
    if (redis.status !== "ready") {
      await redis.connect().catch(() => null);
    }
    const raw = await redis.get(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DictResult;
    memoryCache.set(key, {
      expiresAt: Date.now() + CACHE_TTL_SECONDS * 1000,
      value: parsed,
    });
    return parsed;
  } catch {
    return null;
  }
}

async function cacheSet(q: string, value: DictResult): Promise<void> {
  const key = cacheKey(q);
  memoryCache.set(key, {
    expiresAt: Date.now() + CACHE_TTL_SECONDS * 1000,
    value,
  });
  const redis = getOptionalRedis();
  if (!redis) return;
  try {
    if (redis.status !== "ready") {
      await redis.connect().catch(() => null);
    }
    await redis.set(key, JSON.stringify(value), "EX", CACHE_TTL_SECONDS);
  } catch {
    /* memory already set */
  }
}

type FreeDictMeaning = {
  partOfSpeech?: string;
  definitions?: Array<{ definition?: string }>;
};

type FreeDictEntry = {
  word?: string;
  phonetic?: string;
  phonetics?: Array<{ text?: string }>;
  meanings?: FreeDictMeaning[];
};

function extractPhonetic(entry: FreeDictEntry): string | null {
  if (entry.phonetic && entry.phonetic.trim()) return entry.phonetic.trim();
  for (const p of entry.phonetics ?? []) {
    if (p.text && p.text.trim()) return p.text.trim();
  }
  return null;
}

function mapEnSenses(entries: FreeDictEntry[]): DictSense[] {
  const senses: DictSense[] = [];
  for (const entry of entries) {
    for (const meaning of entry.meanings ?? []) {
      const pos = (meaning.partOfSpeech ?? "").trim() || "—";
      for (const def of meaning.definitions ?? []) {
        const en = (def.definition ?? "").trim();
        if (!en) continue;
        senses.push({ pos, en, zh: "" });
        if (senses.length >= 8) return senses;
      }
    }
  }
  return senses;
}

async function fetchFreeDictionary(word: string): Promise<{
  phonetic: string | null;
  senses: DictSense[];
} | null> {
  const url = `${FREE_DICT_BASE}/${encodeURIComponent(word)}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
  }).catch(() => null);

  if (!res || !res.ok) return null;
  const data = (await res.json().catch(() => null)) as FreeDictEntry[] | null;
  if (!Array.isArray(data) || data.length === 0) return null;

  return {
    phonetic: extractPhonetic(data[0]!),
    senses: mapEnSenses(data),
  };
}

async function fetchZhGloss(text: string): Promise<string | null> {
  const q = text.slice(0, 200);
  if (!q) return null;
  const url = `${MYMEMORY_BASE}?q=${encodeURIComponent(q)}&langpair=en|zh-CN`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(6000),
    cache: "no-store",
  }).catch(() => null);

  if (!res || !res.ok) return null;
  const data = (await res.json().catch(() => null)) as {
    responseData?: { translatedText?: string };
    responseStatus?: number;
  } | null;
  const translated = data?.responseData?.translatedText?.trim();
  if (!translated) return null;
  // MyMemory sometimes echoes the source on failure
  if (translated.toLowerCase() === q.toLowerCase()) return null;
  return translated;
}

/**
 * Bilingual lookup: EN senses from Free Dictionary API;
 * ZH gloss for the headword from MyMemory (best-effort, rate-limited).
 */
export async function lookupWord(rawQuery: string): Promise<DictResult | null> {
  const query = normalizeQuery(rawQuery);
  if (!query) return null;

  const cached = await cacheGet(query);
  if (cached) return cached;

  const en = await fetchFreeDictionary(query);
  let senses = en?.senses ?? [];
  let phonetic = en?.phonetic ?? null;
  let note: string | undefined;

  // Headword ZH gloss (single short phrase for bilingual requirement)
  const headZh = await fetchZhGloss(query);

  if (senses.length === 0) {
    // No Free Dictionary entry — still try to return a minimal bilingual row
    if (headZh) {
      senses = [{ pos: "—", en: query, zh: headZh }];
      note = "未找到完整英文释义，仅提供译文";
    } else {
      const result: DictResult = {
        query,
        phonetic: null,
        senses: [],
        note: "未找到释义",
      };
      await cacheSet(query, result);
      return result;
    }
  } else if (headZh) {
    // Apply headword ZH as primary gloss; try one short definition translation if empty
    senses = senses.map((s, i) =>
      i === 0 ? { ...s, zh: headZh } : s,
    );
    // Best-effort: translate first short definition if headword gloss is too generic
    const first = senses[0];
    if (first && !first.zh && first.en.length <= 120) {
      const defZh = await fetchZhGloss(first.en);
      if (defZh) first.zh = defZh;
    }
  } else {
    note = "中文释义暂不可用（外部翻译服务限流或失败）";
  }

  const result: DictResult = {
    query,
    phonetic,
    senses,
    ...(note ? { note } : {}),
  };
  await cacheSet(query, result);
  return result;
}
