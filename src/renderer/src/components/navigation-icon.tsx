import { House, ListTodo, Settings, NotebookPen, FileText } from 'lucide-react'

type NavigationPage = 'daily' | 'tasks' | 'settings' | 'notes' | 'report'
const icons = {
  daily: House,
  tasks: ListTodo,
  settings: Settings,
  notes: NotebookPen,
  report: FileText
}

export function NavigationIcon({ page }: { page: NavigationPage }): React.JSX.Element {
  const Icon = icons[page]
  return <Icon />
}
