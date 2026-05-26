import { useEffect, useMemo, useState } from 'react'
import {
  addGameToCollection,
  subscribeToGames,
  updateGameStatus,
} from './firebase'
import { searchGames } from './services/gameSearch'
import type { GameEntry, GameStatus, SearchResult } from './types'
import './App.css'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

const statusMeta: Record<
  GameStatus,
  {
    label: string
    icon: string
    color: string
  }
> = {
  completed: { label: 'Completed', icon: '[OK]', color: 'status-completed' },
  played: { label: 'Played & Put Away', icon: '[PA]', color: 'status-played' },
  backlog: { label: 'Backlog', icon: '[BL]', color: 'status-backlog' },
  playing: { label: 'Playing Now', icon: '[NOW]', color: 'status-playing' },
}

const filters: Array<{ id: 'all' | GameStatus; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'completed', label: 'Completed' },
  { id: 'backlog', label: 'Backlog' },
  { id: 'played', label: 'Played & Put Away' },
  { id: 'playing', label: 'Playing Now' },
]

function App() {
  const [games, setGames] = useState<GameEntry[]>([])
  const [activeFilter, setActiveFilter] = useState<'all' | GameStatus>('all')
  const [searchInput, setSearchInput] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [firebaseError, setFirebaseError] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [deferredInstallPrompt, setDeferredInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null)
  const trimmedSearch = searchInput.trim()

  useEffect(() => {
    const unsubscribe = subscribeToGames(
      (entries) => {
        setGames(entries)
        setFirebaseError(null)
      },
      () => {
        setFirebaseError(
          'Firebase access is blocked. Check Firestore rules and hosting domain permissions.',
        )
      },
    )

    return () => unsubscribe()
  }, [])

  useEffect(() => {
    const onBeforeInstall = (event: Event) => {
      event.preventDefault()
      setDeferredInstallPrompt(event as BeforeInstallPromptEvent)
    }

    const onInstalled = () => {
      setDeferredInstallPrompt(null)
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  useEffect(() => {
    if (trimmedSearch.length < 2) {
      return
    }

    let cancelled = false
    const timer = window.setTimeout(async () => {
      setSearchLoading(true)
      setSearchError(null)
      try {
        const results = await searchGames(trimmedSearch)
        if (!cancelled) {
          setSearchResults(results)
        }
      } catch {
        if (!cancelled) {
          setSearchError('Could not search game APIs right now. Try again in a moment.')
        }
      } finally {
        if (!cancelled) {
          setSearchLoading(false)
        }
      }
    }, 350)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [trimmedSearch])

  const gameIds = useMemo(
    () =>
      new Set(
        games.map((entry) => `${entry.source.toLowerCase()}::${entry.externalId}`),
      ),
    [games],
  )

  const filteredGames = useMemo(() => {
    if (activeFilter === 'all') return games
    return games.filter((game) => game.status === activeFilter)
  }, [activeFilter, games])

  const handleInstall = async () => {
    if (!deferredInstallPrompt) return

    await deferredInstallPrompt.prompt()
    await deferredInstallPrompt.userChoice
    setDeferredInstallPrompt(null)
  }

  const handleAddGame = async (game: SearchResult) => {
    setPendingId(`${game.source}:${game.externalId}`)
    setFirebaseError(null)

    try {
      await addGameToCollection({
        title: game.title,
        coverUrl: game.coverUrl,
        source: game.source,
        externalId: game.externalId,
      })
    } catch {
      setFirebaseError(
        'Could not save this game to Firebase. Verify Firestore rules allow writes.',
      )
    } finally {
      setPendingId(null)
    }
  }

  const handleStatusChange = async (id: string, status: GameStatus) => {
    setPendingId(id)
    setFirebaseError(null)

    try {
      await updateGameStatus(id, status)
    } catch {
      setFirebaseError('Could not update game status in Firebase.')
    } finally {
      setPendingId(null)
    }
  }

  const isIosStandalone =
    typeof navigator !== 'undefined' &&
    'standalone' in navigator &&
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone)

  return (
    <main className="app-shell">
      <div className="hero-gradient" aria-hidden="true" />
      <header className="topbar">
        <div>
          <p className="kicker">Game Backlog Tracker</p>
          <h1>Track what you finish, shelve, and tackle next.</h1>
        </div>
        {deferredInstallPrompt && (
          <button className="install-btn" onClick={handleInstall} type="button">
            Install App
          </button>
        )}
        {!deferredInstallPrompt && isIosStandalone && (
          <span className="installed-pill">Installed</span>
        )}
      </header>

      <section className="search-panel">
        <label htmlFor="game-search">Find games from public catalogs</label>
        <input
          id="game-search"
          type="search"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder="Search full or partial title (e.g. cyberpunk, mario, witcher)..."
        />
        {trimmedSearch.length >= 2 && searchLoading && (
          <p className="meta">Searching game sources...</p>
        )}
        {trimmedSearch.length >= 2 && searchError && (
          <p className="error">{searchError}</p>
        )}
        <p className="meta">
          Search sources:{' '}
          <a href="https://www.cheapshark.com" target="_blank" rel="noreferrer">
            CheapShark
          </a>{' '}
          +{' '}
          <a href="https://www.freetogame.com" target="_blank" rel="noreferrer">
            FreeToGame
          </a>
        </p>

        {trimmedSearch.length >= 2 && searchResults.length > 0 && (
          <div className="search-grid">
            {searchResults.map((result) => {
              const collectionKey = `${result.source.toLowerCase()}::${result.externalId}`
              const added = gameIds.has(collectionKey)
              const actionKey = `${result.source}:${result.externalId}`

              return (
                <article key={actionKey} className="search-card">
                  <img src={result.coverUrl} alt={`${result.title} cover`} loading="lazy" />
                  <div className="search-card-info">
                    <h3>{result.title}</h3>
                    {result.subtitle && <p>{result.subtitle}</p>}
                    <div className="search-actions">
                      <span className="source-pill">{result.source}</span>
                      <button
                        type="button"
                        disabled={added || pendingId === actionKey}
                        onClick={() => handleAddGame(result)}
                      >
                        {added ? 'Added' : pendingId === actionKey ? 'Adding...' : 'Add'}
                      </button>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>

      <section className="collection-panel">
        <div className="collection-header">
          <h2>Your collection</h2>
          <div className="filters">
            {filters.map((filter) => (
              <button
                key={filter.id}
                className={activeFilter === filter.id ? 'active' : ''}
                onClick={() => setActiveFilter(filter.id)}
                type="button"
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        {firebaseError && <p className="error">{firebaseError}</p>}

        {filteredGames.length === 0 ? (
          <p className="empty">
            {games.length === 0
              ? 'Search for games above and add your first one to the backlog.'
              : 'No games match this filter yet.'}
          </p>
        ) : (
          <div className="collection-grid">
            {filteredGames.map((game) => {
              const status = statusMeta[game.status]
              return (
                <article className="game-card" key={game.id}>
                  <img src={game.coverUrl} alt={`${game.title} cover`} loading="lazy" />
                  <div className="game-info">
                    <h3>{game.title}</h3>
                    <span className={`status-pill ${status.color}`}>
                      {status.icon} {status.label}
                    </span>
                    <select
                      value={game.status}
                      onChange={(event) =>
                        handleStatusChange(game.id, event.target.value as GameStatus)
                      }
                      disabled={pendingId === game.id}
                    >
                      {Object.entries(statusMeta).map(([id, value]) => (
                        <option key={id} value={id}>
                          {value.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>
    </main>
  )
}

export default App

