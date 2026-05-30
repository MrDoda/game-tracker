import { initializeApp } from 'firebase/app'
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  type FirestoreError,
  getFirestore,
} from 'firebase/firestore'
import type { GameEntry, GameStatus } from './types'

const env = import.meta.env

const readRequiredEnv = (key: keyof ImportMetaEnv) => {
  const value = env[key]
  if (!value) {
    throw new Error(`Missing environment variable: ${key}`)
  }
  return value
}

const firebaseConfig = {
  apiKey: readRequiredEnv('VITE_FIREBASE_API_KEY'),
  authDomain: readRequiredEnv('VITE_FIREBASE_AUTH_DOMAIN'),
  projectId: readRequiredEnv('VITE_FIREBASE_PROJECT_ID'),
  storageBucket: readRequiredEnv('VITE_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: readRequiredEnv('VITE_FIREBASE_MESSAGING_SENDER_ID'),
  appId: readRequiredEnv('VITE_FIREBASE_APP_ID'),
}

const app = initializeApp(firebaseConfig)
const db = getFirestore(app)

const buildId = (source: string, externalId: string) =>
  `${source}-${externalId}`.replace(/[^a-zA-Z0-9-_.]/g, '_')

const gamesCollectionForScope = (scope: string) =>
  collection(db, 'collections', scope, 'games')

export const subscribeToGames = (
  scope: string,
  onSuccess: (games: GameEntry[]) => void,
  onFailure: (error: FirestoreError) => void,
) => {
  const gamesQuery = query(gamesCollectionForScope(scope), orderBy('createdAt', 'desc'))

  return onSnapshot(
    gamesQuery,
    (snapshot) => {
      const mapped = snapshot.docs.map((entry) => {
        const raw = entry.data() as Omit<GameEntry, 'id'> & {
          createdAt?: { seconds: number }
        }

        return {
          id: entry.id,
          title: raw.title,
          coverUrl: raw.coverUrl,
          steamAppId: raw.steamAppId,
          customCover: raw.customCover,
          status: raw.status,
          worthReplay: Boolean(raw.worthReplay),
          source: raw.source,
          externalId: raw.externalId,
          createdAt: raw.createdAt?.seconds,
        }
      })
      onSuccess(mapped)
    },
    onFailure,
  )
}

export const addGameToCollection = async (
  scope: string,
  input: Omit<GameEntry, 'id' | 'createdAt' | 'status'>,
) => {
  const id = buildId(input.source, input.externalId)
  await setDoc(
    doc(gamesCollectionForScope(scope), id),
    {
      ...input,
      customCover: input.customCover ?? false,
      status: 'backlog',
      worthReplay: false,
      createdAt: serverTimestamp(),
    },
    { merge: true },
  )
}

export const updateGameStatus = async (
  scope: string,
  id: string,
  status: GameStatus,
) => {
  await updateDoc(doc(gamesCollectionForScope(scope), id), { status })
}

export const updateGameDetails = async (
  scope: string,
  id: string,
  input: { title: string; coverUrl: string },
) => {
  await updateDoc(doc(gamesCollectionForScope(scope), id), {
    title: input.title,
    coverUrl: input.coverUrl,
    customCover: true,
  })
}

export const updateGameWorthReplay = async (
  scope: string,
  id: string,
  worthReplay: boolean,
) => {
  await updateDoc(doc(gamesCollectionForScope(scope), id), { worthReplay })
}

export const removeGameFromCollection = async (scope: string, id: string) => {
  await deleteDoc(doc(gamesCollectionForScope(scope), id))
}

