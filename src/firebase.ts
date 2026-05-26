import { initializeApp } from 'firebase/app'
import {
  collection,
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

const firebaseConfig = {
  apiKey: 'AIzaSyDJdsFULZSDyQV8rZ-fHabOa9Uy0uz5sWU',
  authDomain: 'game-backlog-7680e.firebaseapp.com',
  projectId: 'game-backlog-7680e',
  storageBucket: 'game-backlog-7680e.firebasestorage.app',
  messagingSenderId: '761126433839',
  appId: '1:761126433839:web:d004559e1d489af6ae02da',
}

const app = initializeApp(firebaseConfig)
const db = getFirestore(app)
const gamesCollection = collection(db, 'games')

const buildId = (source: string, externalId: string) =>
  `${source}-${externalId}`.replace(/[^a-zA-Z0-9-_.]/g, '_')

export const subscribeToGames = (
  onSuccess: (games: GameEntry[]) => void,
  onFailure: (error: FirestoreError) => void,
) => {
  const gamesQuery = query(gamesCollection, orderBy('createdAt', 'desc'))

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
          status: raw.status,
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
  input: Omit<GameEntry, 'id' | 'createdAt' | 'status'>,
) => {
  const id = buildId(input.source, input.externalId)
  await setDoc(
    doc(gamesCollection, id),
    {
      ...input,
      status: 'backlog',
      createdAt: serverTimestamp(),
    },
    { merge: true },
  )
}

export const updateGameStatus = async (id: string, status: GameStatus) => {
  await updateDoc(doc(gamesCollection, id), { status })
}

