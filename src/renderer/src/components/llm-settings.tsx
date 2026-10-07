import { useEffect, useId, useLayoutEffect, useState, type RefObject } from 'react'
import { MoreHorizontal, Plus, Pencil, Trash2 } from 'lucide-react'
import type { LLMProvider, LLMModel, Locale, Result } from '../../../shared/model'
import { translator } from '../lib/i18n'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { Separator } from './ui/separator'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem
} from './ui/dropdown-menu'
import { Input } from './ui/input'
import { Textarea } from './ui/textarea'
import { Field, FieldGroup, FieldLabel } from './ui/field'
import { Alert, AlertDescription } from './ui/alert'
import { Empty, EmptyHeader, EmptyTitle } from './ui/empty'
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from './ui/accordion'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from './ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter
} from './ui/alert-dialog'

type ProviderDraft = {
  id: string | null
  name: string
  baseUrl: string
  apiKey: string
  keyAction: string
  hasApiKey: boolean
}
type ModelDraft = {
  id: string | null
  providerId: string
  name: string
  modelId: string
  think: string
  temperature: string
  maxTokens: string
  extra: string
}

export function LLMSettings({
  locale,
  closeGuardRef
}: {
  locale: Locale
  closeGuardRef: RefObject<(() => boolean) | null>
}): React.JSX.Element {
  const t = translator(locale)
  const prefix = useId()
  const [providers, setProviders] = useState<LLMProvider[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [provider, setProvider] = useState<ProviderDraft | null>(null)
  const [model, setModel] = useState<ModelDraft | null>(null)
  const [deletion, setDeletion] = useState<{
    kind: 'provider' | 'model'
    id: string
    name: string
  } | null>(null)
  const [discard, setDiscard] = useState(false)
  const [initialDraft, setInitialDraft] = useState('')
  const draft = provider ?? model
  const dirty = !!draft && JSON.stringify(draft) !== initialDraft
  useLayoutEffect(() => {
    closeGuardRef.current = () => {
      if (busy) return true
      if (dirty) {
        setDiscard(true)
        return true
      }
      return false
    }
    return () => {
      closeGuardRef.current = null
    }
  }, [busy, dirty, closeGuardRef])

  async function load(): Promise<void> {
    setLoading(true)
    setError(null)
    try {
      const result = await window.api.llmProviders()
      if (!result.ok) throw new Error()
      setProviders(result.value)
    } catch {
      setError(t('llmReadError'))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    let active = true
    window.api
      .llmProviders()
      .then((result) => {
        if (!active) return
        if (result.ok) setProviders(result.value)
        else setError(t('llmReadError'))
        setLoading(false)
      })
      .catch(() => {
        if (active) {
          setError(t('llmReadError'))
          setLoading(false)
        }
      })
    return () => {
      active = false
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function closeEditor(): void {
    if (busy) return
    if (dirty) setDiscard(true)
    else {
      setProvider(null)
      setModel(null)
      setError(null)
    }
  }
  function editProvider(value?: LLMProvider): void {
    const next: ProviderDraft = {
      id: value?.id ?? null,
      name: value?.name ?? '',
      baseUrl: value?.baseUrl ?? '',
      apiKey: '',
      keyAction: value?.hasApiKey ? 'keep' : 'replace',
      hasApiKey: value?.hasApiKey ?? false
    }
    setProvider(next)
    setInitialDraft(JSON.stringify(next))
    setError(null)
  }
  function editModel(providerId: string, value?: LLMModel): void {
    const { think, temperature, max_tokens: maxTokens, ...extra } = value?.parameters ?? {}
    const next: ModelDraft = {
      id: value?.id ?? null,
      providerId,
      name: value?.name ?? '',
      modelId: value?.modelId ?? '',
      think: typeof think === 'boolean' ? String(think) : 'default',
      temperature: temperature === undefined ? '' : String(temperature),
      maxTokens: maxTokens === undefined ? '' : String(maxTokens),
      extra: Object.keys(extra).length ? JSON.stringify(extra, null, 2) : ''
    }
    setModel(next)
    setInitialDraft(JSON.stringify(next))
    setError(null)
  }
  async function mutate(operation: () => Promise<Result<LLMProvider[]>>): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      const result = await operation()
      if (!result.ok) {
        setError(t(result.error === 'conflict' ? 'llmDuplicateModel' : 'llmSaveError'))
        return
      }
      setProviders(result.value)
      setProvider(null)
      setModel(null)
      setDeletion(null)
    } catch {
      setError(t('llmSaveError'))
    } finally {
      setBusy(false)
    }
  }
  function save(): void {
    if (provider) {
      try {
        const url = new URL(provider.baseUrl.trim())
        if (
          !['http:', 'https:'].includes(url.protocol) ||
          url.username ||
          url.password ||
          url.search ||
          url.hash
        )
          throw new Error()
      } catch {
        setError(t('llmInvalidUrl'))
        return
      }
      void mutate(() =>
        window.api.saveProvider({
          id: provider.id,
          name: provider.name,
          baseUrl: provider.baseUrl,
          apiKey:
            provider.keyAction === 'keep'
              ? undefined
              : provider.keyAction === 'clear'
                ? ''
                : provider.apiKey
        })
      )
    } else if (model) {
      let parameters: Record<string, unknown>
      try {
        parameters = model.extra.trim() ? JSON.parse(model.extra) : {}
        if (!parameters || typeof parameters !== 'object' || Array.isArray(parameters))
          throw new Error()
        if (['think', 'temperature', 'max_tokens'].some((key) => Object.hasOwn(parameters, key)))
          throw new Error()
      } catch {
        setError(t('llmInvalidParameters'))
        return
      }
      if (model.temperature.trim()) {
        const value = Number(model.temperature)
        if (!Number.isFinite(value) || value < 0 || value > 2) {
          setError(t('llmInvalidTemperature'))
          return
        }
        parameters.temperature = value
      }
      if (model.maxTokens.trim()) {
        const value = Number(model.maxTokens)
        if (!Number.isSafeInteger(value) || value < 1) {
          setError(t('llmInvalidTokens'))
          return
        }
        parameters.max_tokens = value
      }
      if (model.think !== 'default') parameters.think = model.think === 'true'
      void mutate(() =>
        window.api.saveModel({
          id: model.id,
          providerId: model.providerId,
          name: model.name,
          modelId: model.modelId,
          parameters
        })
      )
    }
  }
  const errorAlert = error && (
    <Alert variant="destructive">
      <AlertDescription>{error}</AlertDescription>
    </Alert>
  )
  const textField = (
    key: string,
    label: string,
    value: string,
    onChange: (value: string) => void,
    options: { type?: string; placeholder?: string; required?: boolean; maxLength?: number } = {}
  ): React.JSX.Element => (
    <Field>
      <FieldLabel htmlFor={`${prefix}-${key}`}>{label}</FieldLabel>
      <Input
        id={`${prefix}-${key}`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={busy}
        {...options}
      />
    </Field>
  )
  const choice = (
    key: string,
    label: string,
    value: string,
    onChange: (value: string) => void,
    items: [string, string][]
  ): React.JSX.Element => (
    <Field>
      <FieldLabel htmlFor={`${prefix}-${key}`}>{label}</FieldLabel>
      <Select
        value={value}
        disabled={busy}
        onValueChange={(next) => {
          if (next) onChange(next)
        }}
      >
        <SelectTrigger id={`${prefix}-${key}`}>
          <SelectValue>{items.find(([id]) => id === value)?.[1]}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {items.map(([id, text]) => (
              <SelectItem key={id} value={id}>
                {text}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  )
  const actions = (
    kind: 'provider' | 'model',
    id: string,
    name: string,
    onEdit: () => void
  ): React.JSX.Element => (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon-sm" aria-label={`${name}: ${t('more')}`} />}
      >
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={onEdit}>
            <Pencil />
            {t(kind === 'provider' ? 'llmEditProvider' : 'llmEditModel')}
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onClick={() => {
              setError(null)
              setDeletion({ kind, id, name })
            }}
          >
            <Trash2 />
            {t('llmDelete')}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
  return (
    <section className="flex min-h-0 flex-1 flex-col gap-5">
      <div className="settings-heading-row flex items-center justify-between gap-4">
        <h1 id="settings-heading">{t('llm')}</h1>
        <Button disabled={loading || busy} onClick={() => editProvider()}>
          {t('llmAddProvider')}
        </Button>
      </div>
      {!draft && !deletion && errorAlert}
      {loading ? (
        <p>{t('loading')}</p>
      ) : error && providers.length === 0 ? (
        <Button variant="outline" onClick={() => void load()}>
          {t('retry')}
        </Button>
      ) : providers.length === 0 ? (
        <Empty className="min-h-60">
          <EmptyHeader>
            <EmptyTitle>{t('llmNoProviders')}</EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <Accordion multiple={false} defaultValue={[]} className="gap-3">
          {providers.map((item) => (
            <AccordionItem
              key={item.id}
              value={item.id}
              className="rounded-lg border bg-card text-card-foreground px-4"
            >
              <AccordionTrigger className="items-center gap-3 py-4">
                <span className="min-w-0 break-all">{item.name}</span>
              </AccordionTrigger>
              <AccordionContent>
                <div className="flex flex-col gap-3 pb-1">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="text-sm text-muted-foreground">
                      {t('llmModels', { n: item.models.length })}
                    </span>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button variant="outline" size="sm" onClick={() => editModel(item.id)}>
                        <Plus data-icon="inline-start" />
                        {t('llmAddModel')}
                      </Button>
                      {actions('provider', item.id, item.name, () => editProvider(item))}
                    </div>
                  </div>
                  <Separator />
                  {item.models.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t('llmNoModels')}</p>
                  ) : (
                    item.models.map((entry) => (
                      <div
                        key={entry.id}
                        className="flex items-center justify-between gap-3 rounded-md border p-3"
                      >
                        <div className="flex min-w-0 flex-col gap-1">
                          <span className="break-all">{entry.name}</span>
                          <span className="text-sm text-muted-foreground break-all">
                            {entry.modelId}
                          </span>
                        </div>
                        {actions('model', entry.id, entry.name, () => editModel(item.id, entry))}
                      </div>
                    ))
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
      <Dialog
        open={!!draft}
        onOpenChange={(open) => {
          if (!open) closeEditor()
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader className="flex-row flex-wrap items-center gap-2 pr-6">
            <DialogTitle>
              {t(
                provider
                  ? provider.id
                    ? 'llmEditProvider'
                    : 'llmAddProvider'
                  : model?.id
                    ? 'llmEditModel'
                    : 'llmAddModel'
              )}
            </DialogTitle>
            {provider && <Badge variant="secondary">{t('llmProtocol')}</Badge>}
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault()
              save()
            }}
            className="flex flex-col gap-5"
          >
            <FieldGroup>
              {provider ? (
                <>
                  {textField(
                    'name',
                    t('llmName'),
                    provider.name,
                    (name) => setProvider({ ...provider, name }),
                    { required: true, maxLength: 200 }
                  )}
                  {textField(
                    'url',
                    t('llmUrl'),
                    provider.baseUrl,
                    (baseUrl) => setProvider({ ...provider, baseUrl }),
                    { required: true, maxLength: 2048, placeholder: 'https://api.example.com/v1' }
                  )}
                  {provider.hasApiKey &&
                    choice(
                      'key-action',
                      t('llmApiKey'),
                      provider.keyAction,
                      (keyAction) => setProvider({ ...provider, keyAction }),
                      [
                        ['keep', t('llmKeepKey')],
                        ['replace', t('llmReplaceKey')],
                        ['clear', t('llmClearKey')]
                      ]
                    )}
                  {provider.keyAction === 'replace' &&
                    textField(
                      'key',
                      t('llmApiKey'),
                      provider.apiKey,
                      (apiKey) => setProvider({ ...provider, apiKey }),
                      { type: 'password', maxLength: 8192 }
                    )}
                </>
              ) : (
                model && (
                  <>
                    {textField(
                      'model-name',
                      t('llmName'),
                      model.name,
                      (name) => setModel({ ...model, name }),
                      { required: true, maxLength: 200 }
                    )}
                    {textField(
                      'model-id',
                      t('llmModelId'),
                      model.modelId,
                      (modelId) => setModel({ ...model, modelId }),
                      { required: true, maxLength: 200 }
                    )}
                    {choice(
                      'think',
                      t('llmThink'),
                      model.think,
                      (think) => setModel({ ...model, think }),
                      [
                        ['default', t('llmDefault')],
                        ['true', t('llmOn')],
                        ['false', t('llmOff')]
                      ]
                    )}
                    {textField(
                      'temperature',
                      t('llmTemperature'),
                      model.temperature,
                      (temperature) => setModel({ ...model, temperature }),
                      { placeholder: t('llmDefault') }
                    )}
                    {textField(
                      'tokens',
                      t('llmMaxTokens'),
                      model.maxTokens,
                      (maxTokens) => setModel({ ...model, maxTokens }),
                      { placeholder: t('llmDefault') }
                    )}
                    <Field>
                      <FieldLabel htmlFor={`${prefix}-extra`}>{t('llmExtra')}</FieldLabel>
                      <Textarea
                        id={`${prefix}-extra`}
                        className="min-h-24 font-mono"
                        value={model.extra}
                        disabled={busy}
                        maxLength={20000}
                        placeholder={'{"top_p": 0.9}'}
                        onChange={(event) => setModel({ ...model, extra: event.target.value })}
                      />
                    </Field>
                  </>
                )
              )}
            </FieldGroup>
            {errorAlert}
            <DialogFooter>
              <Button type="button" variant="outline" disabled={busy} onClick={closeEditor}>
                {t('cancel')}
              </Button>
              <Button type="submit" disabled={busy}>
                {t(busy ? 'saving' : 'save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={!!deletion}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setDeletion(null)
            setError(null)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('llmDeleteConfirm')} {deletion?.name}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(deletion?.kind === 'provider' ? 'llmDeleteProviderHint' : 'deleteHint')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {errorAlert}
          <AlertDialogFooter>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                setDeletion(null)
                setError(null)
              }}
            >
              {t('cancel')}
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => {
                if (deletion)
                  void mutate(() =>
                    deletion.kind === 'provider'
                      ? window.api.deleteProvider(deletion.id)
                      : window.api.deleteModel(deletion.id)
                  )
              }}
            >
              {t('llmDelete')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={discard} onOpenChange={setDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('llmDiscardConfirm')}</AlertDialogTitle>
            <AlertDialogDescription>{t('llmDiscardHint')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setDiscard(false)}>
              {t('continueEditing')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setDiscard(false)
                setProvider(null)
                setModel(null)
                setError(null)
              }}
            >
              {t('discard')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
