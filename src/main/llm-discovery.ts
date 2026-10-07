import { ServiceError } from './data-directory'

export async function fetchModelIds(baseUrl: string, apiKey: string): Promise<string[]> {
  const url = new URL(`${baseUrl.replace(/\/+$/, '')}/models`)
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new ServiceError('state')
  const signal = AbortSignal.timeout(15000)
  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
      },
      signal,
      redirect: 'error'
    })
    if (!response.ok) {
      await response.body?.cancel()
      if (response.status === 401 || response.status === 403) throw new ServiceError('llm-auth')
      if ([404, 405, 501].includes(response.status)) throw new ServiceError('llm-unsupported')
      throw new ServiceError('llm-network')
    }
    if (!response.body) throw new ServiceError('llm-response')
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        size += value.length
        if (size > 2 * 1024 * 1024) throw new ServiceError('llm-response')
        chunks.push(value)
      }
    } finally {
      await reader.cancel()
    }
    let payload: unknown
    try {
      payload = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    } catch {
      throw new ServiceError('llm-response')
    }
    if (
      !payload ||
      typeof payload !== 'object' ||
      !('data' in payload) ||
      !Array.isArray(payload.data)
    )
      throw new ServiceError('llm-response')
    const ids = payload.data.map((item: unknown) => {
      if (
        !item ||
        typeof item !== 'object' ||
        !('id' in item) ||
        typeof item.id !== 'string' ||
        !item.id.trim() ||
        item.id.length > 200
      )
        throw new ServiceError('llm-response')
      return item.id.trim()
    })
    return [...new Set(ids)].sort((a, b) => a.localeCompare(b))
  } catch (error) {
    if (signal.aborted) throw new ServiceError('llm-timeout')
    if (error instanceof ServiceError) throw error
    throw new ServiceError('llm-network')
  }
}
