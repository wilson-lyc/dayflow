import type { Ref } from 'react'
import { NotesList, type NotesListProps } from './notes-list'
import { QuickNoteModule, type QuickNoteModuleProps } from './quick-note-module'

export type QuickNotesBlockProps = {
  notes: Omit<NotesListProps, 'mode' | 'onRestore' | 'onDelete'>
  composer?: QuickNoteModuleProps
  listRef?: Ref<HTMLDivElement>
}

export function QuickNotesBlock({
  notes,
  composer,
  listRef
}: QuickNotesBlockProps): React.JSX.Element {
  return (
    <div className="quick-notes-block">
      <div ref={listRef} className="notes-scroll" aria-busy={notes.state === 'loading'}>
        <div className="notes-content">
          <NotesList {...notes} />
        </div>
      </div>
      {composer && <QuickNoteModule {...composer} />}
    </div>
  )
}
