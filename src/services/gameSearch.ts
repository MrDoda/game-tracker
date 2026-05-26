import type { SearchResult } from '../types'

interface FreeToGameItem {
  id: number
  title: string
  thumbnail: string
  genre: string
  platform: string
}

interface CheapSharkItem {
  gameID: string
  steamAppID: string | null
  external: string
  thumb: string
  cheapest: string
}

interface SteamStoreSearchResponse {
  items: SteamStoreItem[]
}

interface SteamStoreItem {
  type: string
  id: number
  name: string
  tiny_image: string
  price?: {
    currency: string
    final: number
  }
}

const cheapSharkBase = import.meta.env.DEV
  ? '/api/cheapshark/api/1.0'
  : 'https://www.cheapshark.com/api/1.0'

const freeToGameBase = import.meta.env.DEV
  ? '/api/freetogame/api'
  : 'https://www.freetogame.com/api'

const steamSearchBase = import.meta.env.DEV
  ? '/api/steam/api'
  : 'https://store.steampowered.com/api'

let freeToGameCache: FreeToGameItem[] | null = null
let freeToGameRequest: Promise<FreeToGameItem[]> | null = null

const normalize = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const bigrams = (value: string) => {
  const normalized = normalize(value)
  if (normalized.length < 2) {
    return new Set([normalized])
  }

  const pairs: string[] = []
  for (let i = 0; i < normalized.length - 1; i += 1) {
    pairs.push(normalized.slice(i, i + 2))
  }
  return new Set(pairs)
}

const similarity = (query: string, title: string) => {
  const left = normalize(query)
  const right = normalize(title)

  if (!left || !right) return 0
  if (left === right) return 1
  if (right.includes(left)) return 0.94

  const qTokens = left.split(' ')
  const tokenCoverage = qTokens.filter((token) => right.includes(token)).length
  const tokenScore = tokenCoverage / qTokens.length

  const leftBigrams = bigrams(left)
  const rightBigrams = bigrams(right)
  let overlap = 0
  leftBigrams.forEach((entry) => {
    if (rightBigrams.has(entry)) overlap += 1
  })

  const dice = (2 * overlap) / (leftBigrams.size + rightBigrams.size)
  return Math.max(tokenScore * 0.9, dice)
}

const placeholderCover = (title: string) =>
  `https://placehold.co/420x560/111827/f8fafc?text=${encodeURIComponent(title)}`

const digitToRoman: Record<string, string> = {
  '1': 'i',
  '2': 'ii',
  '3': 'iii',
  '4': 'iv',
  '5': 'v',
  '6': 'vi',
  '7': 'vii',
  '8': 'viii',
  '9': 'ix',
}

const romanToDigit: Record<string, string> = Object.entries(digitToRoman).reduce(
  (acc, [digit, roman]) => {
    acc[roman] = digit
    return acc
  },
  {} as Record<string, string>,
)

const queryVariants = (query: string) => {
  const base = normalize(query)
  const variants = new Set([base])

  variants.add(base.replace(/\b([1-9])\b/g, (_, n: string) => digitToRoman[n] ?? n))
  variants.add(
    base.replace(/\b(i|ii|iii|iv|v|vi|vii|viii|ix)\b/g, (_, roman: string) => {
      return romanToDigit[roman] ?? roman
    }),
  )

  return [...variants].filter((entry) => entry.length >= 2).slice(0, 3)
}

const fetchJson = async <T>(url: string): Promise<T> => {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`)
  }

  return (await response.json()) as T
}

const fetchCheapShark = async (query: string): Promise<SearchResult[]> => {
  const variants = queryVariants(query)

  const responseList = await Promise.allSettled(
    variants.map((variant) =>
      fetchJson<CheapSharkItem[]>(
        `${cheapSharkBase}/games?title=${encodeURIComponent(variant)}&limit=60`,
      ),
    ),
  )

  const merged = responseList
    .filter((entry): entry is PromiseFulfilledResult<CheapSharkItem[]> => {
      return entry.status === 'fulfilled'
    })
    .flatMap((entry) => entry.value)

  const dedupedById = new Map<string, CheapSharkItem>()
  merged.forEach((item) => {
    dedupedById.set(item.gameID, item)
  })

  return [...dedupedById.values()]
    .map((item) => {
      const title = item.external
      return {
        source: 'cheapshark',
        externalId: item.gameID,
        title,
        coverUrl: item.thumb || placeholderCover(title),
        steamAppId: item.steamAppID ?? undefined,
        subtitle: `Cheapest: $${item.cheapest}`,
        score: similarity(query, title) + 0.08,
      }
    })
    .filter((entry) => entry.score >= 0.26)
}

const loadFreeToGameCatalog = async () => {
  if (freeToGameCache) {
    return freeToGameCache
  }

  if (!freeToGameRequest) {
    freeToGameRequest = fetchJson<FreeToGameItem[]>(`${freeToGameBase}/games`)
      .then((list) => {
        freeToGameCache = list
        return list
      })
      .finally(() => {
        freeToGameRequest = null
      })
  }

  return freeToGameRequest
}

const fetchFreeToGame = async (query: string): Promise<SearchResult[]> => {
  const list = await loadFreeToGameCatalog()

  return list
    .map((item) => ({
      source: 'freetogame',
      externalId: item.id.toString(),
      title: item.title,
      coverUrl: item.thumbnail || placeholderCover(item.title),
      subtitle: `${item.genre} | ${item.platform}`,
      score: similarity(query, item.title),
    }))
    .filter((entry) => entry.score >= 0.26)
    .sort((a, b) => b.score - a.score)
    .slice(0, 48)
}

const formatSteamPrice = (item: SteamStoreItem) => {
  if (!item.price) return 'No listed price'
  if (item.price.final === 0) return 'Free to play'
  return `${item.price.currency} ${(item.price.final / 100).toFixed(2)}`
}

const fetchSteamSearch = async (query: string): Promise<SearchResult[]> => {
  const variants = queryVariants(query)
  const responseList = await Promise.allSettled(
    variants.map((variant) =>
      fetchJson<SteamStoreSearchResponse>(
        `${steamSearchBase}/storesearch/?term=${encodeURIComponent(variant)}&l=en&cc=us`,
      ),
    ),
  )

  const merged = responseList
    .filter((entry): entry is PromiseFulfilledResult<SteamStoreSearchResponse> => {
      return entry.status === 'fulfilled'
    })
    .flatMap((entry) => entry.value.items)
    .filter((item) => item.type === 'app')

  const dedupedById = new Map<number, SteamStoreItem>()
  merged.forEach((item) => {
    dedupedById.set(item.id, item)
  })

  return [...dedupedById.values()]
    .map((item) => ({
      source: 'steam',
      externalId: item.id.toString(),
      title: item.name,
      coverUrl: item.tiny_image || placeholderCover(item.name),
      steamAppId: item.id.toString(),
      subtitle: `Steam | ${formatSteamPrice(item)}`,
      score: similarity(query, item.name) + 0.04,
    }))
    .filter((entry) => entry.score >= 0.24)
}

export const searchGames = async (query: string): Promise<SearchResult[]> => {
  const trimmed = query.trim()
  if (trimmed.length < 2) return []

  const [cheap, free, steam] = await Promise.allSettled([
    fetchCheapShark(trimmed),
    fetchFreeToGame(trimmed),
    fetchSteamSearch(trimmed),
  ])

  const merged = [
    ...(cheap.status === 'fulfilled' ? cheap.value : []),
    ...(free.status === 'fulfilled' ? free.value : []),
    ...(steam.status === 'fulfilled' ? steam.value : []),
  ]

  const deduped = new Map<string, SearchResult>()
  merged.forEach((game) => {
    const key = normalize(game.title)
    const existing = deduped.get(key)

    if (!existing || game.score > existing.score) {
      deduped.set(key, game)
    }
  })

  return [...deduped.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, 32)
}
