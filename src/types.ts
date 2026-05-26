export type GameStatus = 'backlog' | 'playing' | 'played' | 'completed'

export interface GameEntry {
  id: string
  title: string
  coverUrl: string
  status: GameStatus
  source: string
  externalId: string
  createdAt?: number
}

export interface SearchResult {
  source: string
  externalId: string
  title: string
  coverUrl: string
  subtitle?: string
  score: number
}

