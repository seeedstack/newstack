import type { GeoRating, GeoTopicCode } from './types'

// PRODUCT §5.6: topic-specific pole names are a render-time concern, not stored in the schema.
export const GEO_TOPICS: Record<GeoTopicCode, { label: string; minusPole: string; plusPole: string }> = {
  IN_PAK: { label: 'India–Pakistan', minusPole: 'Dialogue-first', plusPole: 'Deterrence-first' },
  IN_CHN: { label: 'India–China', minusPole: 'De-escalation-first', plusPole: 'Assertive-sovereignty-first' },
  IN_US: { label: 'India–US', minusPole: 'Strategic-autonomy-first', plusPole: 'Alliance-alignment-first' },
  IN_RUS: { label: 'India–Russia', minusPole: 'Western-realignment-first', plusPole: 'Russia-partnership-first' },
  IN_NEIGH: { label: 'Neighbourhood', minusPole: 'Regional-accommodation-first', plusPole: 'Primacy-assertion-first' },
  DEFSEC: { label: 'Defence & security', minusPole: 'Civil-oversight-first', plusPole: 'Operational-secrecy-first' },
  MULTILAT: { label: 'Multilateral institutions', minusPole: 'Institution-binding-first', plusPole: 'Sovereignty-first / unilateralist' },
  INDOPAC: { label: 'Indo-Pacific', minusPole: 'Cooperative-security-first', plusPole: 'Great-power-rivalry framing' },
}

export const GEO_TOPIC_ORDER: GeoTopicCode[] = ['IN_PAK', 'IN_CHN', 'IN_US', 'IN_RUS', 'IN_NEIGH', 'DEFSEC', 'MULTILAT', 'INDOPAC']

// PRODUCT §3.5/§5.6: never call an unrated topic "neutral" — absence of evidence is not a claim.
export function stanceLabel(topic: GeoTopicCode, stance: GeoRating['stance']): string {
  const { minusPole, plusPole } = GEO_TOPICS[topic]
  switch (stance) {
    case 'strongly_minus':
      return `Strongly ${minusPole.toLowerCase()}`
    case 'leans_minus':
      return `Leans ${minusPole.toLowerCase()}`
    case 'mixed_or_issue_dependent':
      return 'Mixed / issue-dependent'
    case 'leans_plus':
      return `Leans ${plusPole.toLowerCase()}`
    case 'strongly_plus':
      return `Strongly ${plusPole.toLowerCase()}`
    case 'insufficient_evidence':
      return 'Insufficient evidence'
  }
}
