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
  title: string
  thumb: string
  cheapest: string
}

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
  if (right.includes(left)) return 0.92

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
  return Math.max(tokenScore * 0.8, dice)
}

const placeholderCover = (title: string) =>
  `https://placehold.co/420x560/143042/f9f8f2?text=${encodeURIComponent(title)}`

const fetchCheapShark = async (query: string): Promise<SearchResult[]> => {
  const response = await fetch(
    `https://www.cheapshark.com/api/1.0/games?title=${encodeURIComponent(query)}&limit=30`,
  )

  if (!response.ok) {
    throw new Error('CheapShark search failed')
  }

  const data = (await response.json()) as CheapSharkItem[]
  return data.map((item) => ({
    source: 'cheapshark',
    externalId: item.gameID,
    title: item.title,
    coverUrl: item.thumb || placeholderCover(item.title),
    subtitle: `Cheapest: $${item.cheapest}`,
    score: similarity(query, item.title),
  }))
}

const loadFreeToGameCatalog = async () => {
  if (freeToGameCache) {
    return freeToGameCache
  }

  if (!freeToGameRequest) {
    freeToGameRequest = fetch('https://www.freetogame.com/api/games')
      .then(async (response) => {
        if (!response.ok) {
          throw new Error('FreeToGame catalog failed')
        }
        return (await response.json()) as FreeToGameItem[]
      })
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
    .filter((entry) => entry.score >= 0.3)
    .sort((a, b) => b.score - a.score)
    .slice(0, 40)
}

export const searchGames = async (query: string): Promise<SearchResult[]> => {
  const trimmed = query.trim()
  if (trimmed.length < 2) return []

  const [cheap, free] = await Promise.allSettled([
    fetchCheapShark(trimmed),
    fetchFreeToGame(trimmed),
  ])

  const merged = [
    ...(cheap.status === 'fulfilled' ? cheap.value : []),
    ...(free.status === 'fulfilled' ? free.value : []),
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
    .slice(0, 24)
}

