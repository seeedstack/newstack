export interface SavedSource {
  id: string
  name: string
  domain: string
  status: 'active' | 'deprecated'
}

// Deliberately independent of the feed/topics features' own types: the Saved page only
// needs id/title/status here, and depending on those features' richer types would create
// a feed <-> saved / topics <-> saved import cycle (SaveToggleButton is used inline on
// their pages, and the Saved page lists what's been saved from them).
export interface SavedStory {
  id: string
  title: string
  status: 'building' | 'active' | 'tombstoned'
  redirectTo: { id: string; title: string } | null
}

export interface SavedTopic {
  id: string
  name: string
}
