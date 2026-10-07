import { useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { MoreHorizontal, Plus, Pencil, Trash2, LoaderCircle } from 'lucide-react'
import type { LLMProvider, LLMModel, Locale, Result } from '../../../shared/model'
import { defaultModelParameters } from '../../../shared/model'
import { translator, errorKey } from '../lib/i18n'
import {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxList,
  ComboboxItem
} from './ui/combobox'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { Separator } from './ui/separator'
import { ScrollArea } from './ui/scroll-area'
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
  const [remoteModels, setRemoteModels] = useState<string[]>([])
  const [fetchingModels, setFetchingModels] = useState(false)
  const [modelListError, setModelListError] = useState<string | null>(null)
  const [modelsFetched, setModelsFetched] = useState(false)
  const [modelListOpen, setModelListOpen] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const modelRequestRef = useRef(0)
  const modelInputRef = useRef<HTMLInputElement>(null)
  const modelEditorOpen = model !== null
  useEffect(
    () => () => {
      modelRequestRef.current++
    },
    [modelEditorOpen, model?.id, model?.providerId]
  )
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
      modelRequestRef.current++
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
    setRemoteModels([])
    setFetchingModels(false)
    setModelListError(null)
    setModelsFetched(false)
    setModelListOpen(false)
    setAdvancedOpen(false)
    const { temperature, max_tokens: maxTokens, ...extra } = value?.parameters ?? {}
    const next: ModelDraft = {
      id: value?.id ?? null,
      providerId,
      name: value?.name ?? '',
      modelId: value?.modelId ?? '',
      temperature: String(temperature ?? defaultModelParameters.temperature),
      maxTokens: String(maxTokens ?? defaultModelParameters.max_tokens),
      extra: Object.keys(extra).length ? JSON.stringify(extra, null, 2) : ''
    }
    setModel(next)
    setInitialDraft(JSON.stringify(next))
    setError(null)
  }
  async function fetchModels(): Promise<void> {
    if (!model || fetchingModels) return
    const request = ++modelRequestRef.current
    setFetchingModels(true)
    setModelListError(null)
    try {
      const result = await window.api.fetchProviderModels(model.providerId)
      if (request !== modelRequestRef.current) return
      if (!result.ok) {
        setModelListError(t(errorKey(result.error)))
        return
      }
      setRemoteModels(result.value)
      setModelsFetched(true)
      if (result.value.length > 0) modelInputRef.current?.focus()
      setModelListOpen(result.value.length > 0)
    } catch {
      if (request === modelRequestRef.current) setModelListError(t('llmNetworkError'))
    } finally {
      if (request === modelRequestRef.current) setFetchingModels(false)
    }
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
      modelRequestRef.current++
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
        if (['temperature', 'max_tokens'].some((key) => Object.hasOwn(parameters, key)))
          throw new Error()
      } catch {
        setAdvancedOpen(true)
        setError(t('llmInvalidParameters'))
        return
      }
      if (model.temperature.trim()) {
        const value = Number(model.temperature)
        if (!Number.isFinite(value) || value < 0 || value > 2) {
          setAdvancedOpen(true)
          setError(t('llmInvalidTemperature'))
          return
        }
        parameters.temperature = value
      }
      if (model.maxTokens.trim()) {
        const value = Number(model.maxTokens)
        if (!Number.isSafeInteger(value) || value < 1) {
          setAdvancedOpen(true)
          setError(t('llmInvalidTokens'))
          return
        }
        parameters.max_tokens = value
      }
      parameters.temperature ??= defaultModelParameters.temperature
      parameters.max_tokens ??= defaultModelParameters.max_tokens
      void mutate(() =>
        window.api.saveModel({
          id: model.id,
          providerId: model.providerId,
          name: model.name.trim() || model.modelId.trim(),
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
        <DialogContent className="max-h-[85vh] grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
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
            className="grid min-h-0 grid-rows-[minmax(0,1fr)_auto] gap-5"
          >
            <ScrollArea className="-mx-1 min-h-0 overflow-hidden">
              <div className="flex flex-col gap-5 px-1 py-1 pr-3">
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
                        {
                          required: true,
                          maxLength: 2048,
                          placeholder: 'https://api.example.com/v1'
                        }
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
                        <Field>
                          <div className="flex items-center justify-between gap-2">
                            <FieldLabel htmlFor={`${prefix}-model-id`}>
                              {t('llmModelId')}
                            </FieldLabel>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={busy || fetchingModels}
                              onClick={() => void fetchModels()}
                            >
                              {fetchingModels && (
                                <LoaderCircle data-icon="inline-start" className="animate-spin" />
                              )}
                              {t(fetchingModels ? 'llmFetchingModels' : 'llmFetchModels')}
                            </Button>
                          </div>
                          <Combobox
                            items={remoteModels}
                            inputValue={model.modelId}
                            value={remoteModels.includes(model.modelId) ? model.modelId : null}
                            disabled={busy}
                            open={modelListOpen}
                            onOpenChange={(open) =>
                              setModelListOpen(open && remoteModels.length > 0)
                            }
                            onInputValueChange={(modelId, details) => {
                              if (details.reason === 'input-change')
                                setModel((current) => (current ? { ...current, modelId } : current))
                            }}
                            onValueChange={(modelId) => {
                              if (modelId)
                                setModel((current) =>
                                  current
                                    ? {
                                        ...current,
                                        modelId,
                                        name: current.name.trim() ? current.name : modelId
                                      }
                                    : current
                                )
                            }}
                          >
                            <ComboboxInput
                              ref={modelInputRef}
                              id={`${prefix}-model-id`}
                              required
                              maxLength={200}
                              disabled={busy}
                              showTrigger={remoteModels.length > 0}
                            />
                            <ComboboxContent>
                              <ComboboxEmpty>{t('llmNoMatchingModels')}</ComboboxEmpty>
                              <ComboboxList>
                                {(modelId: string) => (
                                  <ComboboxItem key={modelId} value={modelId}>
                                    {modelId}
                                  </ComboboxItem>
                                )}
                              </ComboboxList>
                            </ComboboxContent>
                          </Combobox>
                          {modelsFetched && remoteModels.length === 0 && (
                            <p className="text-sm text-muted-foreground">
                              {t('llmNoRemoteModels')}
                            </p>
                          )}
                          {modelListError && (
                            <Alert variant="destructive">
                              <AlertDescription>{modelListError}</AlertDescription>
                            </Alert>
                          )}
                        </Field>
                        {textField(
                          'model-name',
                          t('llmModelName'),
                          model.name,
                          (name) => setModel({ ...model, name }),
                          { maxLength: 200, placeholder: model.modelId }
                        )}
                        <Accordion
                          multiple={false}
                          value={advancedOpen ? ['advanced'] : []}
                          onValueChange={(value) => setAdvancedOpen(value.length > 0)}
                        >
                          <AccordionItem value="advanced">
                            <AccordionTrigger disabled={busy}>{t('llmAdvanced')}</AccordionTrigger>
                            <AccordionContent>
                              <FieldGroup className="pt-2">
                                {textField(
                                  'temperature',
                                  t('llmTemperature'),
                                  model.temperature,
                                  (temperature) => setModel({ ...model, temperature }),
                                  { placeholder: String(defaultModelParameters.temperature) }
                                )}
                                {textField(
                                  'tokens',
                                  t('llmMaxTokens'),
                                  model.maxTokens,
                                  (maxTokens) => setModel({ ...model, maxTokens }),
                                  { placeholder: String(defaultModelParameters.max_tokens) }
                                )}
                                <Field>
                                  <FieldLabel htmlFor={`${prefix}-extra`}>
                                    {t('llmExtra')}
                                  </FieldLabel>
                                  <Textarea
                                    id={`${prefix}-extra`}
                                    className="min-h-24 font-mono"
                                    value={model.extra}
                                    disabled={busy}
                                    maxLength={20000}
                                    placeholder={'{"top_p": 0.9}'}
                                    onChange={(event) =>
                                      setModel({ ...model, extra: event.target.value })
                                    }
                                  />
                                </Field>
                              </FieldGroup>
                            </AccordionContent>
                          </AccordionItem>
                        </Accordion>
                      </>
                    )
                  )}
                </FieldGroup>
                {errorAlert}
              </div>
            </ScrollArea>
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
                modelRequestRef.current++
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
