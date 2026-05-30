import { type FormEvent, useEffect, useMemo, useState } from 'react'
import {
  addGameToCollection,
  removeGameFromCollection,
  subscribeToGames,
  updateGameDetails,
  updateGameStatus,
  updateGameWorthReplay,
} from './firebase'
import { GameCover } from './components/GameCover'
import { searchGames } from './services/gameSearch'
import type { GameEntry, GameStatus, SearchResult } from './types'
import './App.css'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

const COLLECTION_STORAGE_KEY = 'game-tracker-collection-password'
const MOBILE_COLUMNS_STORAGE_KEY = 'game-tracker-mobile-columns'
const DESKTOP_COLUMNS_STORAGE_KEY = 'game-tracker-desktop-columns'
const SORT_MODE_STORAGE_KEY = 'game-tracker-sort-mode'
const allowedCollectionPasswords = ['doda', 'lurson'] as const

type CollectionPassword = (typeof allowedCollectionPasswords)[number]
type SortMode = 'date' | 'alphabet'
type CollectionFilter = 'all' | GameStatus | 'worthreplay'

const isCollectionPassword = (value: string): value is CollectionPassword =>
  allowedCollectionPasswords.includes(value as CollectionPassword)

const readStoredCollectionPassword = (): CollectionPassword | null => {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(COLLECTION_STORAGE_KEY)
  if (!raw) return null
  return isCollectionPassword(raw) ? raw : null
}

const readStoredColumnValue = <T extends number>(
  key: string,
  allowed: readonly T[],
  fallback: T,
): T => {
  if (typeof window === 'undefined') return fallback
  const raw = window.localStorage.getItem(key)
  if (!raw) return fallback

  const parsed = Number(raw)
  return allowed.includes(parsed as T) ? (parsed as T) : fallback
}

const readStoredSortMode = (): SortMode => {
  if (typeof window === 'undefined') return 'date'
  const raw = window.localStorage.getItem(SORT_MODE_STORAGE_KEY)
  return raw === 'alphabet' ? 'alphabet' : 'date'
}

const statusMeta: Record<
  GameStatus,
  {
    label: string
    icon: string
    color: string
  }
> = {
  perfect: { label: '100%', icon: '[100]', color: 'status-perfect' },
  completed: { label: 'Completed', icon: '[OK]', color: 'status-completed' },
  playnext: { label: 'Play Next', icon: '[NEXT]', color: 'status-playnext' },
  played: { label: 'Played & Put Away', icon: '[PA]', color: 'status-played' },
  backlog: { label: 'Backlog', icon: '[BL]', color: 'status-backlog' },
  playing: { label: 'Playing Now', icon: '[NOW]', color: 'status-playing' },
}

const filters: CollectionFilter[] = [
  'all',
  'playnext',
  'perfect',
  'completed',
  'worthreplay',
  'backlog',
  'played',
  'playing',
]

const filterLabelMap: Record<CollectionFilter, string> = {
  all: 'All',
  playnext: 'Play Next',
  perfect: '100%',
  completed: 'Completed',
  worthreplay: 'Worth Replay',
  backlog: 'Backlog',
  played: 'Played & Put Away',
  playing: 'Playing Now',
}

const mobileColumnOptions = [2, 3] as const
const desktopColumnOptions = [4, 5, 7, 10] as const
function App() {
  const [collectionPassword, setCollectionPassword] = useState<CollectionPassword | null>(
    readStoredCollectionPassword,
  )
  const [loginPasswordInput, setLoginPasswordInput] = useState('')
  const [loginError, setLoginError] = useState<string | null>(null)
  const [isScopeManagerOpen, setIsScopeManagerOpen] = useState(false)
  const [switchPasswordInput, setSwitchPasswordInput] = useState('')
  const [switchError, setSwitchError] = useState<string | null>(null)

  const [games, setGames] = useState<GameEntry[]>([])
  const [activeFilter, setActiveFilter] = useState<CollectionFilter>('all')
  const [isMobileLayout, setIsMobileLayout] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(max-width: 720px)').matches,
  )
  const [mobileColumns, setMobileColumns] = useState<2 | 3>(() =>
    readStoredColumnValue(MOBILE_COLUMNS_STORAGE_KEY, mobileColumnOptions, 3),
  )
  const [desktopColumns, setDesktopColumns] = useState<4 | 5 | 7 | 10>(() =>
    readStoredColumnValue(DESKTOP_COLUMNS_STORAGE_KEY, desktopColumnOptions, 7),
  )
  const [sortMode, setSortMode] = useState<SortMode>(readStoredSortMode)
  const [searchInput, setSearchInput] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [firebaseError, setFirebaseError] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [mobileActionGame, setMobileActionGame] = useState<GameEntry | null>(null)
  const [gamePendingRemoval, setGamePendingRemoval] = useState<GameEntry | null>(null)
  const [isAddGameOpen, setIsAddGameOpen] = useState(false)
  const [gamePendingEdit, setGamePendingEdit] = useState<GameEntry | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editCoverUrl, setEditCoverUrl] = useState('')
  const [editError, setEditError] = useState<string | null>(null)
  const [newGameTitle, setNewGameTitle] = useState('')
  const [newGameCoverUrl, setNewGameCoverUrl] = useState('')
  const [newGameError, setNewGameError] = useState<string | null>(null)
  const [deferredInstallPrompt, setDeferredInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null)
  const trimmedSearch = searchInput.trim()

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 720px)')
    const applyMatch = () => {
      setIsMobileLayout(mediaQuery.matches)
    }

    applyMatch()
    mediaQuery.addEventListener('change', applyMatch)

    return () => {
      mediaQuery.removeEventListener('change', applyMatch)
    }
  }, [])

  useEffect(() => {
    if (!collectionPassword) {
      return
    }

    const unsubscribe = subscribeToGames(
      collectionPassword,
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
  }, [collectionPassword])

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
    if (!collectionPassword || trimmedSearch.length < 2) {
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
  }, [collectionPassword, trimmedSearch])

  const gameIds = useMemo(
    () =>
      new Set(
        games.map((entry) => `${entry.source.toLowerCase()}::${entry.externalId}`),
      ),
    [games],
  )

  const filteredGames = useMemo(() => {
    if (activeFilter === 'all') return games
    if (activeFilter === 'worthreplay') {
      return games.filter((game) => game.status === 'completed' && game.worthReplay)
    }
    return games.filter((game) => game.status === activeFilter)
  }, [activeFilter, games])

  const sortedGames = useMemo(() => {
    const items = [...filteredGames]
    if (sortMode === 'alphabet') {
      return items.sort((a, b) => a.title.localeCompare(b.title))
    }

    return items.sort((a, b) => {
      const right = b.createdAt ?? 0
      const left = a.createdAt ?? 0
      if (right !== left) return right - left
      return a.title.localeCompare(b.title)
    })
  }, [filteredGames, sortMode])

  const filterCounts = useMemo(() => {
    const counts: Record<CollectionFilter, number> = {
      all: games.length,
      perfect: 0,
      completed: 0,
      playnext: 0,
      worthreplay: 0,
      backlog: 0,
      played: 0,
      playing: 0,
    }

    games.forEach((game) => {
      counts[game.status] += 1
      if (game.status === 'completed' && game.worthReplay) {
        counts.worthreplay += 1
      }
    })

    return counts
  }, [games])

  const activeColumnOptions = isMobileLayout
    ? mobileColumnOptions
    : desktopColumnOptions
  const activeColumns = isMobileLayout ? mobileColumns : desktopColumns
  const isDenseCollection =
    (isMobileLayout && activeColumns === 3) ||
    (!isMobileLayout && (activeColumns === 7 || activeColumns === 10))

  const handleInstall = async () => {
    if (!deferredInstallPrompt) return

    await deferredInstallPrompt.prompt()
    await deferredInstallPrompt.userChoice
    setDeferredInstallPrompt(null)
  }

  const handleAuthenticate = (event: FormEvent) => {
    event.preventDefault()

    const normalized = loginPasswordInput.trim().toLowerCase()
    if (!isCollectionPassword(normalized)) {
      setLoginError('Invalid password.')
      return
    }

    setCollectionPassword(normalized)
    window.localStorage.setItem(COLLECTION_STORAGE_KEY, normalized)
    setLoginPasswordInput('')
    setLoginError(null)
    setSearchInput('')
    setSearchResults([])
  }

  const handleSwitchCollection = () => {
    const normalized = switchPasswordInput.trim().toLowerCase()
    if (!isCollectionPassword(normalized)) {
      setSwitchError('Invalid password.')
      return
    }

    setCollectionPassword(normalized)
    window.localStorage.setItem(COLLECTION_STORAGE_KEY, normalized)
    setSwitchPasswordInput('')
    setSwitchError(null)
    setSearchInput('')
    setSearchResults([])
    setIsScopeManagerOpen(false)
  }

  const handleLogout = () => {
    window.localStorage.removeItem(COLLECTION_STORAGE_KEY)
    setCollectionPassword(null)
    setSwitchPasswordInput('')
    setSwitchError(null)
    setSearchInput('')
    setSearchResults([])
    setMobileActionGame(null)
    setIsAddGameOpen(false)
    setIsScopeManagerOpen(false)
  }

  const handleSortChange = (mode: SortMode) => {
    setSortMode(mode)
    window.localStorage.setItem(SORT_MODE_STORAGE_KEY, mode)
  }

  const handleHideSearchResults = () => {
    setSearchInput('')
    setSearchResults([])
    setSearchError(null)
  }

  const handleAddGame = async (game: SearchResult) => {
    if (!collectionPassword) return

    setPendingId(`${game.source}:${game.externalId}`)
    setFirebaseError(null)

    try {
      await addGameToCollection(collectionPassword, {
        title: game.title,
        coverUrl: game.coverUrl,
        steamAppId: game.steamAppId,
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

  const openCreateGameDialog = () => {
    setNewGameTitle('')
    setNewGameCoverUrl('')
    setNewGameError(null)
    setIsAddGameOpen(true)
  }

  const handleCreateManualGame = async () => {
    if (!collectionPassword) return

    const title = newGameTitle.trim()
    const coverUrl = newGameCoverUrl.trim()

    if (!title) {
      setNewGameError('Game name cannot be empty.')
      return
    }

    if (!coverUrl) {
      setNewGameError('Cover URL cannot be empty.')
      return
    }

    try {
      new URL(coverUrl)
    } catch {
      setNewGameError('Please enter a valid image URL (https://...).')
      return
    }

    const safeTitle = title.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    const externalId = `${safeTitle}-${Date.now()}`

    setPendingId('create:manual')
    setNewGameError(null)
    setFirebaseError(null)

    try {
      await addGameToCollection(collectionPassword, {
        title,
        coverUrl,
        source: 'manual',
        externalId,
        customCover: true,
      })
      setIsAddGameOpen(false)
    } catch {
      setNewGameError('Could not create game in Firebase.')
    } finally {
      setPendingId(null)
    }
  }

  const handleStatusChange = async (id: string, status: GameStatus) => {
    if (!collectionPassword) return

    setPendingId(id)
    setFirebaseError(null)

    try {
      await updateGameStatus(collectionPassword, id, status)
      return true
    } catch {
      setFirebaseError('Could not update game status in Firebase.')
      return false
    } finally {
      setPendingId(null)
    }
  }

  const handleWorthReplayChange = async (id: string, worthReplay: boolean) => {
    if (!collectionPassword) return false

    setPendingId(`worthreplay:${id}`)
    setFirebaseError(null)

    try {
      await updateGameWorthReplay(collectionPassword, id, worthReplay)
      return true
    } catch {
      setFirebaseError('Could not update Worth Replay in Firebase.')
      return false
    } finally {
      setPendingId(null)
    }
  }

  const handleMobileStatusChange = async (game: GameEntry, status: GameStatus) => {
    if (status === game.status) return
    const ok = await handleStatusChange(game.id, status)
    if (ok) {
      setMobileActionGame(null)
    }
  }

  const handleMobileWorthReplayChange = async (game: GameEntry) => {
    if (game.status !== 'completed') return
    const ok = await handleWorthReplayChange(game.id, !game.worthReplay)
    if (ok) {
      setMobileActionGame(null)
    }
  }

  const handleRemoveGame = async () => {
    if (!gamePendingRemoval || !collectionPassword) {
      return
    }

    setPendingId(`remove:${gamePendingRemoval.id}`)
    setFirebaseError(null)

    try {
      await removeGameFromCollection(collectionPassword, gamePendingRemoval.id)
      setGamePendingRemoval(null)
    } catch {
      setFirebaseError('Could not remove this game from Firebase.')
    } finally {
      setPendingId(null)
    }
  }

  const openEditDialog = (game: GameEntry) => {
    setGamePendingEdit(game)
    setEditTitle(game.title)
    setEditCoverUrl(game.coverUrl)
    setEditError(null)
  }

  const handleSaveGameEdit = async () => {
    if (!gamePendingEdit || !collectionPassword) return

    const normalizedTitle = editTitle.trim()
    const normalizedCoverUrl = editCoverUrl.trim()

    if (!normalizedTitle) {
      setEditError('Game name cannot be empty.')
      return
    }

    if (!normalizedCoverUrl) {
      setEditError('Cover URL cannot be empty.')
      return
    }

    try {
      new URL(normalizedCoverUrl)
    } catch {
      setEditError('Please enter a valid image URL (https://...).')
      return
    }

    setPendingId(`edit:${gamePendingEdit.id}`)
    setFirebaseError(null)
    setEditError(null)

    try {
      await updateGameDetails(collectionPassword, gamePendingEdit.id, {
        title: normalizedTitle,
        coverUrl: normalizedCoverUrl,
      })
      setGamePendingEdit(null)
    } catch {
      setEditError('Could not save game changes to Firebase.')
    } finally {
      setPendingId(null)
    }
  }

  const isIosStandalone =
    typeof navigator !== 'undefined' &&
    'standalone' in navigator &&
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone)

  if (!collectionPassword) {
    return (
      <main className="app-shell">
        <div className="hero-gradient" aria-hidden="true" />
        <header className="topbar">
          <div>
            <p className="kicker">Game Backlog Tracker</p>
          </div>
        </header>

        <div className="dialog-backdrop" role="presentation">
          <div className="confirm-dialog" role="dialog" aria-modal="true">
            <h3>Unlock collection</h3>
            <p>Enter your collection password to open your own library.</p>
            <form className="edit-form" onSubmit={handleAuthenticate}>
              <label htmlFor="collection-password">Password</label>
              <input
                id="collection-password"
                type="password"
                value={loginPasswordInput}
                onChange={(event) => setLoginPasswordInput(event.target.value)}
                placeholder="Enter password"
              />
              {loginError && <p className="error">{loginError}</p>}
              <div className="dialog-actions">
                <button type="submit">Open collection</button>
              </div>
            </form>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <div className="hero-gradient" aria-hidden="true" />

      <div className="page-menu-hotspot" aria-hidden="true">
        <button
          type="button"
          className="page-menu-btn"
          onClick={() => setIsScopeManagerOpen(true)}
        >
          Change Collection
        </button>
      </div>

      <header className="topbar">
        <div>
          <p className="kicker">Game Backlog Tracker</p>
          <p className="meta">Active collection: {collectionPassword}</p>
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
        {trimmedSearch.length >= 2 && (
          <button
            type="button"
            className="hide-search-btn"
            onClick={handleHideSearchResults}
          >
            Hide search results
          </button>
        )}
        {trimmedSearch.length >= 2 && searchLoading && (
          <p className="meta">Searching game sources...</p>
        )}
        {trimmedSearch.length >= 2 && searchError && (
          <p className="error">{searchError}</p>
        )}
        {trimmedSearch.length >= 2 && searchResults.length > 0 && (
          <div className="search-grid">
            {searchResults.map((result) => {
              const collectionKey = `${result.source.toLowerCase()}::${result.externalId}`
              const added = gameIds.has(collectionKey)
              const actionKey = `${result.source}:${result.externalId}`

              return (
                <article key={actionKey} className="search-card">
                  <div className="image-frame">
                    <GameCover
                      key={`${result.source}-${result.externalId}-${result.coverUrl}`}
                      title={result.title}
                      source={result.source}
                      externalId={result.externalId}
                      steamAppId={result.steamAppId}
                      coverUrl={result.coverUrl}
                      preferCustom={false}
                    />
                  </div>
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
        {trimmedSearch.length >= 2 && !searchLoading && searchResults.length === 0 && (
          <p className="empty">
            No matching results found. Try a more specific title like "heroes of might and
            magic 3".
          </p>
        )}
      </section>

      <section className="collection-panel">
        <div className="collection-header">
          <div className="collection-controls">
            <div className="filters">
              {filters.map((filter) => (
                <button
                  key={filter}
                  className={`filter-btn filter-${filter} ${activeFilter === filter ? 'active' : ''}`}
                  onClick={() => setActiveFilter(filter)}
                  type="button"
                >
                  {filterLabelMap[filter]} ({filterCounts[filter]})
                </button>
              ))}
            </div>
            <div
              className={`column-toggle ${isMobileLayout ? 'mobile-toggle' : ''}`}
              role="group"
              aria-label="Collection columns"
            >
              {activeColumnOptions.map((columns) => (
                <button
                  key={columns}
                  type="button"
                  className={activeColumns === columns ? 'active' : ''}
                  onClick={() => {
                    if (isMobileLayout) {
                      const value = columns as 2 | 3
                      setMobileColumns(value)
                      window.localStorage.setItem(
                        MOBILE_COLUMNS_STORAGE_KEY,
                        value.toString(),
                      )
                    } else {
                      const value = columns as 4 | 5 | 7 | 10
                      setDesktopColumns(value)
                      window.localStorage.setItem(
                        DESKTOP_COLUMNS_STORAGE_KEY,
                        value.toString(),
                      )
                    }
                  }}
                >
                  {columns}
                </button>
              ))}
            </div>
            <div className="sort-toggle" role="group" aria-label="Collection sort">
              <button
                type="button"
                className={sortMode === 'date' ? 'active' : ''}
                onClick={() => handleSortChange('date')}
              >
                Date Added
              </button>
              <button
                type="button"
                className={sortMode === 'alphabet' ? 'active' : ''}
                onClick={() => handleSortChange('alphabet')}
              >
                A-Z
              </button>
            </div>
          </div>
        </div>

        {firebaseError && <p className="error">{firebaseError}</p>}

        {filteredGames.length === 0 && (
          <p className="empty">
            {games.length === 0
              ? 'Search for games above and add your first one to the backlog.'
              : 'No games match this filter yet.'}
          </p>
        )}
        <div
          className={`collection-grid ${isDenseCollection ? 'dense-grid' : ''}`}
          style={{ gridTemplateColumns: `repeat(${activeColumns}, minmax(0, 1fr))` }}
        >
          {sortedGames.map((game) => {
              const status = statusMeta[game.status]
              return (
                <article
                  className={`game-card ${isDenseCollection ? 'dense-card' : ''}`}
                  key={game.id}
                  onClick={() => {
                    if (isMobileLayout) {
                      setMobileActionGame(game)
                    }
                  }}
                >
                  {!isMobileLayout && (
                    <div className="remove-hotspot" aria-hidden="true">
                      <div className="corner-actions">
                        <button
                          className="edit-btn-float"
                          type="button"
                          onClick={() => openEditDialog(game)}
                          disabled={pendingId === `edit:${game.id}`}
                        >
                          Edit
                        </button>
                        <button
                          className="remove-btn-float"
                          type="button"
                          onClick={() => setGamePendingRemoval(game)}
                          disabled={pendingId === `remove:${game.id}`}
                        >
                          {pendingId === `remove:${game.id}` ? 'Removing...' : 'Remove'}
                        </button>
                      </div>
                    </div>
                  )}
                  <div className="image-frame">
                    <GameCover
                      key={`${game.source}-${game.externalId}-${game.coverUrl}`}
                      title={game.title}
                      source={game.source}
                      externalId={game.externalId}
                      steamAppId={game.steamAppId}
                      coverUrl={game.coverUrl}
                      preferCustom={game.customCover}
                    />
                  </div>
                  <div className="game-info">
                    {!isDenseCollection && <h3>{game.title}</h3>}
                    <div className="status-pill-row">
                      <span className={`status-pill ${status.color}`}>
                        {isDenseCollection ? status.icon : `${status.icon} ${status.label}`}
                      </span>
                      {game.status === 'completed' && game.worthReplay && (
                        <span className="status-pill status-worthreplay">
                          {isDenseCollection ? '[WR]' : '[WR] Worth Replay'}
                        </span>
                      )}
                    </div>
                    {!isMobileLayout && (
                      <div className="bottom-hover-zone">
                        <div className="card-actions">
                          {game.status === 'completed' && (
                            <button
                              type="button"
                              className={`worth-replay-btn ${game.worthReplay ? 'active' : ''}`}
                              onClick={(event) => {
                                event.stopPropagation()
                                handleWorthReplayChange(game.id, !game.worthReplay)
                              }}
                              disabled={pendingId === `worthreplay:${game.id}`}
                            >
                              {pendingId === `worthreplay:${game.id}`
                                ? 'Saving...'
                                : game.worthReplay
                                  ? 'Unmark Worth Replay'
                                  : 'Mark Worth Replay'}
                            </button>
                          )}
                          <select
                            value={game.status}
                            onClick={(event) => event.stopPropagation()}
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
                      </div>
                    )}
                  </div>
                </article>
              )
          })}
          <button
            type="button"
            className="add-game-card"
            aria-label="Add new game"
            onClick={openCreateGameDialog}
          >
            +
          </button>
        </div>
      </section>

      {gamePendingRemoval && (
        <div
          className="dialog-backdrop"
          role="presentation"
          onClick={() => setGamePendingRemoval(null)}
        >
          <div
            className="confirm-dialog"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <h3>Remove game?</h3>
            <p>
              Remove <strong>{gamePendingRemoval.title}</strong> from your collection?
            </p>
            <div className="dialog-actions">
              <button type="button" onClick={handleRemoveGame}>
                Yes, remove
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => setGamePendingRemoval(null)}
              >
                No, keep it
              </button>
            </div>
          </div>
        </div>
      )}

      {gamePendingEdit && (
        <div
          className="dialog-backdrop"
          role="presentation"
          onClick={() => setGamePendingEdit(null)}
        >
          <div
            className="confirm-dialog"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <h3>Edit game</h3>
            <div className="edit-form">
              <label htmlFor="edit-game-title">Visible name</label>
              <input
                id="edit-game-title"
                type="text"
                value={editTitle}
                onChange={(event) => setEditTitle(event.target.value)}
                placeholder="Game title"
              />

              <label htmlFor="edit-game-cover-url">Cover image URL</label>
              <input
                id="edit-game-cover-url"
                type="url"
                value={editCoverUrl}
                onChange={(event) => setEditCoverUrl(event.target.value)}
                placeholder="https://..."
              />
            </div>
            {editError && <p className="error">{editError}</p>}
            <div className="dialog-actions">
              <button
                type="button"
                onClick={handleSaveGameEdit}
                disabled={pendingId === `edit:${gamePendingEdit.id}`}
              >
                {pendingId === `edit:${gamePendingEdit.id}` ? 'Saving...' : 'Save'}
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => setGamePendingEdit(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {isAddGameOpen && (
        <div
          className="dialog-backdrop"
          role="presentation"
          onClick={() => setIsAddGameOpen(false)}
        >
          <div
            className="confirm-dialog"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <h3>Add game</h3>
            <div className="edit-form">
              <label htmlFor="new-game-title">Visible name</label>
              <input
                id="new-game-title"
                type="text"
                value={newGameTitle}
                onChange={(event) => setNewGameTitle(event.target.value)}
                placeholder="Game title"
              />

              <label htmlFor="new-game-cover-url">Cover image URL</label>
              <input
                id="new-game-cover-url"
                type="url"
                value={newGameCoverUrl}
                onChange={(event) => setNewGameCoverUrl(event.target.value)}
                placeholder="https://..."
              />
            </div>
            {newGameError && <p className="error">{newGameError}</p>}
            <div className="dialog-actions">
              <button
                type="button"
                onClick={handleCreateManualGame}
                disabled={pendingId === 'create:manual'}
              >
                {pendingId === 'create:manual' ? 'Saving...' : 'Save'}
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => setIsAddGameOpen(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {mobileActionGame && (
        <div
          className="dialog-backdrop"
          role="presentation"
          onClick={() => setMobileActionGame(null)}
        >
          <div
            className="confirm-dialog game-actions-modal"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <h3>{mobileActionGame.title}</h3>
            <div className="edit-form">
              <label>State</label>
              <select
                value={mobileActionGame.status}
                onChange={(event) =>
                  handleMobileStatusChange(
                    mobileActionGame,
                    event.target.value as GameStatus,
                  )
                }
                disabled={pendingId === mobileActionGame.id}
              >
                {Object.entries(statusMeta).map(([id, value]) => (
                  <option key={id} value={id}>
                    {value.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="dialog-actions">
              <button
                type="button"
                onClick={() => {
                  openEditDialog(mobileActionGame)
                  setMobileActionGame(null)
                }}
              >
                Edit
              </button>
              {mobileActionGame.status === 'completed' && (
                <button
                  type="button"
                  onClick={() => handleMobileWorthReplayChange(mobileActionGame)}
                  disabled={pendingId === `worthreplay:${mobileActionGame.id}`}
                >
                  {pendingId === `worthreplay:${mobileActionGame.id}`
                    ? 'Saving...'
                    : mobileActionGame.worthReplay
                      ? 'Unmark Worth Replay'
                      : 'Mark Worth Replay'}
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setGamePendingRemoval(mobileActionGame)
                  setMobileActionGame(null)
                }}
              >
                Remove
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => setMobileActionGame(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {isScopeManagerOpen && (
        <div
          className="dialog-backdrop"
          role="presentation"
          onClick={() => setIsScopeManagerOpen(false)}
        >
          <div
            className="confirm-dialog"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <h3>Collection options</h3>
            <p>Current collection password: {collectionPassword}</p>
            <div className="edit-form">
              <label htmlFor="switch-collection-password">Switch to password</label>
              <input
                id="switch-collection-password"
                type="password"
                value={switchPasswordInput}
                onChange={(event) => setSwitchPasswordInput(event.target.value)}
                placeholder="Enter password"
              />
            </div>
            {switchError && <p className="error">{switchError}</p>}
            <div className="dialog-actions">
              <button type="button" onClick={handleSwitchCollection}>
                Switch
              </button>
              <button type="button" className="ghost" onClick={handleLogout}>
                Logout
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => setIsScopeManagerOpen(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

export default App
