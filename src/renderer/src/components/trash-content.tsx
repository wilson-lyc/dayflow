import type { Ref } from 'react'
import { NotesList, type NotesListProps } from './notes-list'

export type TrashContentProps = Omit<
  NotesListProps,
  'mode' | 'onEdit' | 'onTrash' | 'emptyTitle' | 'emptyHint'
> & {
  listRef?: Ref<HTMLDivElement>
}

export function TrashContent({ listRef, ...props }: TrashContentProps): React.JSX.Element {
  return (
    <div ref={listRef} className="trash-content" aria-busy={props.state === 'loading'}>
      <NotesList {...props} mode="trash" />
    </div>
  )
}
