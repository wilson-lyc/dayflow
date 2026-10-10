import { useId, useState } from 'react'
import { Code2, Plus, Trash2, X } from 'lucide-react'
import type { CodeCard, Locale } from '../../../shared/model'
import { translator } from '../lib/i18n'
import { noteLength } from '../lib/quick-note'
import { codeLanguages } from '../lib/code-languages'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { Input } from './ui/input'
import { CodeEditor } from './code-editor'
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group'
import { Empty, EmptyHeader, EmptyTitle } from './ui/empty'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectItem
} from './ui/select'
import { Field, FieldError, FieldGroup, FieldLabel } from './ui/field'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
  DialogTrigger
} from './ui/dialog'

export function CodeCardsDialog({
  value,
  text,
  locale,
  disabled,
  onChange
}: {
  value: CodeCard[]
  text: string
  locale: Locale
  disabled: boolean
  onChange: (cards: CodeCard[]) => void
}): React.JSX.Element {
  const t = translator(locale)
  const prefix = useId()
  const [open, setOpen] = useState(false)
  const cards = value
  const [activeId, setActiveId] = useState<string | null>(null)
  const active = cards.find((card) => card.id === activeId) ?? cards[0] ?? null
  const activeIndex = active ? cards.findIndex((card) => card.id === active.id) : -1
  const tooLong = noteLength({ content: text, codeCards: cards }) > 10000
  const languageItems = [
    { value: '', label: t('plainCode') },
    ...codeLanguages.map((language) => ({
      value: language,
      label:
        language === 'javascript'
          ? 'JavaScript'
          : language === 'typescript'
            ? 'TypeScript'
            : language === 'python'
              ? 'Python'
              : language.toUpperCase()
    }))
  ]
  const codeId = `${prefix}-${active?.id}-code`
  const nameId = `${prefix}-${active?.id}-name`
  const languageId = `${prefix}-${active?.id}-language`
  const empty = !!active && !active.code.trim()

  function patch(id: string, patch: Partial<CodeCard>): void {
    onChange(cards.map((card) => (card.id === id ? { ...card, ...patch } : card)))
  }
  function add(): void {
    const card: CodeCard = { id: crypto.randomUUID(), name: '', language: 'javascript', code: '' }
    onChange([...cards, card])
    setActiveId(card.id)
    requestAnimationFrame(() => document.getElementById(`${prefix}-${card.id}-name`)?.focus())
  }
  function remove(id: string): void {
    const index = cards.findIndex((card) => card.id === id)
    const next = cards.filter((card) => card.id !== id)
    onChange(next)
    if (active?.id === id) setActiveId(next[Math.min(index, next.length - 1)]?.id ?? null)
  }

  return (
    <Dialog
      open={open && !disabled}
      onOpenChange={(next) => {
        if (next && disabled) return
        if (next) {
          setActiveId(value[0]?.id ?? null)
        }
        setOpen(next)
      }}
    >
      <DialogTrigger
        render={<Button variant="ghost" size="sm" className="rounded-full" disabled={disabled} />}
        aria-label={`${t('codeSnippets')}${value.length ? `: ${value.length}` : ''}`}
      >
        <Code2 data-icon="inline-start" />
        {t('codeEntry')}
        {value.length > 0 && <Badge variant="secondary">{value.length}</Badge>}
      </DialogTrigger>
      <DialogContent
        className="code-cards-dialog flex h-[min(620px,85dvh)] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl"
        showCloseButton={false}
      >
        <DialogHeader className="shrink-0 border-b px-5 py-4">
          <div className="flex items-center justify-between gap-4">
            <DialogTitle>{t('codeSnippets')}</DialogTitle>
            <div className="flex items-center gap-2">
              <DialogClose
                render={<Button variant="ghost" size="icon-sm" />}
                aria-label={t('close')}
              >
                <X />
              </DialogClose>
            </div>
          </div>
        </DialogHeader>
        <div className="grid min-h-0 flex-1 grid-cols-[140px_minmax(0,1fr)] sm:grid-cols-[200px_minmax(0,1fr)]">
          <div className="flex min-h-0 min-w-0 flex-col gap-3 border-r bg-muted/25 p-3">
            <Button variant="outline" size="sm" className="w-full shrink-0" onClick={add}>
              <Plus data-icon="inline-start" />
              {t('addCode')}
            </Button>
            <div className="min-h-0 overflow-y-auto">
              <ToggleGroup
                orientation="vertical"
                value={active ? [active.id] : []}
                onValueChange={(ids) => {
                  if (ids[0]) setActiveId(ids[0])
                }}
                className="w-full"
                spacing={1}
                aria-label={t('codeSnippets')}
              >
                {cards.map((card, index) => (
                  <div
                    key={card.id}
                    data-selected={card.id === active?.id}
                    className="flex w-full items-center rounded-lg pr-1 transition-colors hover:bg-muted focus-within:bg-muted data-[selected=true]:bg-muted"
                  >
                    <ToggleGroupItem
                      value={card.id}
                      className="min-h-10 min-w-0 flex-1 justify-start rounded-none bg-transparent hover:bg-transparent aria-pressed:bg-transparent data-[state=on]:bg-transparent"
                      title={card.name.trim() || t('codeSnippet', { n: index + 1 })}
                      aria-controls={`${prefix}-details`}
                    >
                      <span className="truncate">
                        {card.name.trim() || t('codeSnippet', { n: index + 1 })}
                      </span>
                    </ToggleGroupItem>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="shrink-0 text-muted-foreground hover:bg-transparent hover:text-destructive"
                      onClick={() => remove(card.id)}
                      aria-label={t('deleteCode', { n: index + 1 })}
                      title={t('deleteCode', { n: index + 1 })}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                ))}
              </ToggleGroup>
            </div>
          </div>
          {active ? (
            <section
              id={`${prefix}-details`}
              aria-label={active.name?.trim() || t('codeSnippet', { n: activeIndex + 1 })}
              className="flex min-h-0 min-w-0 flex-col overflow-y-auto p-5"
            >
              <FieldGroup key={active.id} className="min-h-0 flex-1 gap-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_160px]">
                  <Field>
                    <FieldLabel htmlFor={nameId}>{t('codeName')}</FieldLabel>
                    <Input
                      id={nameId}
                      value={active.name}
                      placeholder={t('codeSnippet', { n: activeIndex + 1 })}
                      onChange={(event) => patch(active.id, { name: event.target.value })}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={languageId}>{t('codeLanguage')}</FieldLabel>
                    <Select
                      items={languageItems}
                      value={active.language}
                      onValueChange={(language) => patch(active.id, { language: language ?? '' })}
                    >
                      <SelectTrigger id={languageId}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {languageItems.map((item) => (
                            <SelectItem key={item.value} value={item.value}>
                              {item.label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
                <Field className="code-card-content min-h-0 flex-1" data-invalid={empty}>
                  <FieldLabel htmlFor={codeId}>{t('codeContent')}</FieldLabel>
                  <CodeEditor
                    id={codeId}
                    value={active.code}
                    language={active.language}
                    label={t('codeContent')}
                    hint={t('codePlaceholder')}
                    locale={locale}
                    invalid={empty}
                    describedBy={empty ? `${codeId}-error` : undefined}
                    onChange={(code) => patch(active.id, { code })}
                  />
                  {empty && <FieldError id={`${codeId}-error`}>{t('codeRequired')}</FieldError>}
                </Field>
              </FieldGroup>
            </section>
          ) : (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>{t('noCodeSnippets')}</EmptyTitle>
              </EmptyHeader>
            </Empty>
          )}
        </div>
        {tooLong && <FieldError className="px-5 pb-4">{t('tooLong')}</FieldError>}
      </DialogContent>
    </Dialog>
  )
}
