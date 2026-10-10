import type { Ref } from 'react'
import { NotesList, type NotesListProps } from './notes-list'
import { QuickNoteModule, type QuickNoteModuleProps } from './quick-note-module'

export type QuickNotesModuleProps = {
  date: string
  today: string
  notes: Omit<NotesListProps, 'mode' | 'onRestore' | 'onDelete' | 'emptyTitle' | 'emptyHint'>
  composer: QuickNoteModuleProps
  listRef?: Ref<HTMLDivElement>
}

export function QuickNotesModule({
  date,
  today,
  notes,
  composer,
  listRef
}: QuickNotesModuleProps): React.JSX.Element {
  return (
    <div className="quick-notes-block">
      <div ref={listRef} className="notes-scroll" aria-busy={notes.state === 'loading'}>
        <div className="notes-content">
          <NotesList
            {...notes}
            emptyTitle={date > today ? 'future' : date === today ? 'emptyToday' : 'emptyDay'}
            emptyHint={date <= today}
          />
        </div>
      </div>
      {(date <= today || composer.value.content || composer.value.codeCards.length > 0) && (
        <QuickNoteModule {...composer} />
      )}
    </div>
  )
}
