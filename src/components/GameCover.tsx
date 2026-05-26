import { useMemo, useState } from 'react'

interface GameCoverProps {
  title: string
  source: string
  externalId: string
  steamAppId?: string
  coverUrl: string
  preferCustom?: boolean
  className?: string
}

const placeholderCover = (title: string) =>
  `https://placehold.co/600x900/111827/f8fafc?text=${encodeURIComponent(title)}`

const steamPortraitCover = (appId: string) =>
  `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${appId}/library_600x900_2x.jpg`

const steamFallbackCover = (appId: string) =>
  `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${appId}/capsule_616x353.jpg`

const extractSteamAppId = (coverUrl: string) => {
  const match = coverUrl.match(/\/apps\/(\d+)\//)
  return match?.[1]
}

const normalizeUrl = (value: string) => {
  if (!value) return value
  if (value.startsWith('//')) return `https:${value}`
  if (value.startsWith('http://')) return value.replace('http://', 'https://')
  return value
}

const looksLikeSteamAutoAsset = (url: string) => {
  const normalized = normalizeUrl(url)
  if (!normalized) return false
  const isSteamHost =
    normalized.includes('steamstatic.com') || normalized.includes('steamstatic.net')
  if (!isSteamHost) return false
  return /\/capsule_|\/header\.jpg|\/library_/.test(normalized)
}

const unique = (items: string[]) => {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = normalizeUrl(item)
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function GameCover({
  title,
  source,
  externalId,
  steamAppId,
  coverUrl,
  preferCustom = false,
  className,
}: GameCoverProps) {
  const candidateUrls = useMemo(() => {
    const extracted = extractSteamAppId(coverUrl)
    const appId = steamAppId || (source === 'steam' ? externalId : extracted)

    const portraitCandidates = appId
      ? [steamPortraitCover(appId), steamFallbackCover(appId)]
      : []

    const coverLooksAuto = looksLikeSteamAutoAsset(coverUrl)

    if (preferCustom) {
      return unique([coverUrl, ...portraitCandidates, placeholderCover(title)])
    }

    if (coverLooksAuto) {
      return unique([...portraitCandidates, coverUrl, placeholderCover(title)])
    }

    return unique([coverUrl, ...portraitCandidates, placeholderCover(title)])
  }, [coverUrl, externalId, preferCustom, source, steamAppId, title])

  const [activeIndex, setActiveIndex] = useState(0)

  const activeUrl = normalizeUrl(candidateUrls[activeIndex])

  return (
    <img
      className={className}
      src={activeUrl}
      alt={`${title} cover`}
      loading="lazy"
      onError={() => {
        setActiveIndex((index) =>
          index < candidateUrls.length - 1 ? index + 1 : index,
        )
      }}
    />
  )
}
