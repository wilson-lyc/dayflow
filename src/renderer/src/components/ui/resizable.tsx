import type { ComponentProps } from 'react'
import { Group, Panel, Separator } from 'react-resizable-panels'
import { cn } from '../../lib/utils'

function ResizablePanelGroup({
  className,
  ...props
}: ComponentProps<typeof Group>): React.JSX.Element {
  return (
    <Group
      data-slot="resizable-panel-group"
      className={cn('flex h-full w-full min-h-0', className)}
      {...props}
    />
  )
}

function ResizablePanel(props: ComponentProps<typeof Panel>): React.JSX.Element {
  return <Panel data-slot="resizable-panel" {...props} />
}

function ResizableHandle({
  className,
  ...props
}: ComponentProps<typeof Separator>): React.JSX.Element {
  return (
    <Separator data-slot="resizable-handle" className={cn('split-handle', className)} {...props}>
      <span aria-hidden="true" className="split-resize-indicator" />
    </Separator>
  )
}

export { ResizablePanelGroup, ResizablePanel, ResizableHandle }
