import { Link } from 'react-router-dom'

import { EmptyState, ErrorState, LoadingState } from '../../../components/QueryStates'
import { SectionEyebrow } from '../../../components/ui/SectionEyebrow'
import { SaveToggleButton } from '../../saved'
import { useTopics } from '../hooks/useTopics'

export function TopicListPage() {
  const { data: topics, error, isLoading } = useTopics()

  if (isLoading) return <LoadingState />
  if (error) return <ErrorState message="Couldn't load topics." />
  if (topics === undefined || topics.length === 0) return <EmptyState message="No topics yet." />

  return (
    <div className="flex flex-col gap-4">
      <SectionEyebrow>Topics</SectionEyebrow>
      <div>
        <h1>Topics</h1>
        <p className="text-muted mt-1">Follow topics to shape your feed.</p>
      </div>
      <div className="grid grid-cols-2 gap-0.5 sm:grid-cols-3" style={{ background: 'var(--color-divider)', border: '2px solid var(--color-divider)' }}>
        {topics.map((topic) => (
          <div key={topic.id} className="flex flex-col gap-2 p-4" style={{ background: 'var(--color-bg)' }}>
            <Link to={`/topics/${topic.id}`} style={{ fontSize: '17px', fontFamily: 'var(--font-heading)', fontWeight: 'var(--font-heading-weight)' }}>
              {topic.name}
            </Link>
            <SaveToggleButton kind="topics" id={topic.id} />
          </div>
        ))}
      </div>
    </div>
  )
}
