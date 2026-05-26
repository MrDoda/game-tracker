# Game Backlog Tracker

PWA app built with React + TypeScript + Vite, using Firebase Firestore for storage and Firebase Hosting for deployment.

## Features

- Responsive mobile and desktop layout.
- Game collection with status badges:
  - `Completed`
  - `Backlog`
  - `Played & Put Away`
  - `Playing Now`
- Top filters by status.
- Search from multiple public game sources (`CheapShark`, `FreeToGame`, `Steam`) with add-to-collection action.
- Firebase-backed persistence.
- Installable as a Progressive Web App.

## Run locally

```bash
npm install
# macOS/Linux
cp .env.example .env

# Windows PowerShell
Copy-Item .env.example .env

npm run dev
```

Fill `.env` with your Firebase web app values.  
`.env` is git-ignored, while `.env.example` is tracked as a template.

## Build and checks

```bash
npm run lint
npm run build
```

## Firebase deployment

Project is configured for:

- Firebase project: `game-backlog-7680e`
- Hosting target/site: `gamebacklog`

Deploy hosting:

```bash
npx firebase-tools deploy --only hosting:gamebacklog
```

Or via npm script:

```bash
npm run deploy:hosting
```

Firestore rules (for data read/write):

```bash
npx firebase-tools deploy --only firestore:rules
```
