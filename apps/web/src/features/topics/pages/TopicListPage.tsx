import { Link } from 'react-router-dom'

import { EmptyState, ErrorState, LoadingState } from '../../../components/QueryStates'
import { SaveToggleButton } from '../../saved'
import { useTopics } from '../hooks/useTopics'

export function TopicListPage() {
  const { data: topics, error, isLoading } = useTopics()

  if (isLoading) return <LoadingState />
  if (error) return <ErrorState message="Couldn't load topics." />
  if (topics === undefined || topics.length === 0) return <EmptyState message="No topics yet." />

  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-xl font-semibold">Topics</h1>
      <ul className="flex flex-col gap-2">
        {topics.map((topic) => (
          <li key={topic.id} className="flex items-center justify-between gap-4">
            <Link to={`/topics/${topic.id}`} className="hover:underline">
              {topic.name}
            </Link>
            <SaveToggleButton kind="topics" id={topic.id} />
          </li>
        ))}
      </ul>
    </div>
  )
}
