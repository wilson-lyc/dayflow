/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/explicit-function-return-type -- standalone CommonJS test loader */
// Real SQLite coverage with an isolated data directory and a mocked Electron keychain.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const { DatabaseSync } = require('node:sqlite')
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dayflow-llm-'))
let encryptionAvailable = true
const electron = {
  app: {
    getPath: (key) => (key === 'home' ? root : path.join(root, 'app')),
    getPreferredSystemLanguages: () => ['en']
  },
  nativeTheme: { themeSource: 'system', shouldUseDarkColors: false },
  safeStorage: {
    isEncryptionAvailable: () => encryptionAvailable,
    encryptString: (value) => Buffer.from(`encrypted:${value}`),
    decryptString: (value) => value.toString().replace(/^encrypted:/, '')
  }
}
function loadStore() {
  const cache = new Map()
  function load(file) {
    if (cache.has(file)) return cache.get(file).exports
    const module = { exports: {} }
    cache.set(file, module)
    const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
    }).outputText
    const localRequire = (name) =>
      name === 'electron'
        ? electron
        : name.startsWith('.')
          ? load(path.resolve(path.dirname(file), `${name}.ts`))
          : require(name)
    vm.runInThisContext(`(function(require,module,exports){${source}\n})`, { filename: file })(
      localRequire,
      module,
      module.exports
    )
    return module.exports
  }
  return load(path.resolve(__dirname, '../src/main/store.ts'))
}
fs.mkdirSync(path.join(root, '.dayflow'))
const databasePath = path.join(root, '.dayflow/dayflow.sqlite')
const legacy = new DatabaseSync(databasePath)
legacy.exec(`CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,applied_at INTEGER);
  INSERT INTO schema_migrations VALUES(1,0);
  CREATE TABLE logs(id TEXT PRIMARY KEY,type TEXT,content TEXT,recorded_at INTEGER,time_zone TEXT,local_date TEXT,created_at INTEGER,updated_at INTEGER,is_deleted INTEGER);
  INSERT INTO logs VALUES('existing','manual','preserved',0,'UTC','1970-01-01',0,0,0);
  CREATE TABLE app_settings(key TEXT PRIMARY KEY,value_json TEXT,updated_at INTEGER);
  INSERT INTO app_settings VALUES('themeMode','"dark"',0);`)
legacy.close()
const store = loadStore()
assert.deepEqual(store.llmProviders(), [])
assert.equal(store.find('existing'), null)
assert.equal(store.preferences().themeMode, 'system')
const provider = store.saveProvider({
  id: null,
  name: 'Provider',
  baseUrl: 'https://example.com/v1',
  apiKey: 'secret'
})[0]
assert.equal(provider.hasApiKey, true)
assert.equal('apiKey' in provider, false)
const read = new DatabaseSync(databasePath, { readOnly: true })
assert.equal(read.prepare('PRAGMA user_version').get().user_version, 3)
const originalKey = Buffer.from(read.prepare('SELECT api_key FROM llm_providers').get().api_key)
assert.notEqual(originalKey.toString(), 'secret')
store.saveProvider({ id: provider.id, name: 'Renamed', baseUrl: 'http://localhost:1234/v1' })
assert.deepEqual(
  Buffer.from(read.prepare('SELECT api_key FROM llm_providers').get().api_key),
  originalKey
)
const modelInput = {
  id: null,
  providerId: provider.id,
  name: 'Model',
  modelId: 'model-1',
  parameters: { think: true, temperature: 0.5, max_tokens: 2048, top_p: 0.9 }
}
let saved = store.saveModel(modelInput)[0].models[0]
assert.deepEqual(saved.parameters, modelInput.parameters)
assert.throws(
  () => store.saveModel(modelInput),
  (error) => error.code === 'conflict'
)
assert.throws(
  () => store.saveModel({ ...modelInput, parameters: { temperature: -1 } }),
  (error) => error.code === 'state'
)
assert.throws(
  () => store.saveModel({ ...modelInput, providerId: 'missing' }),
  (error) => error.code === 'state'
)
assert.throws(
  () => store.saveProvider({ id: null, name: 'Invalid', baseUrl: 'file:///tmp/x' }),
  (error) => error.code === 'state'
)
store.saveModel({ ...modelInput, id: saved.id, parameters: {} })
assert.deepEqual(loadStore().llmProviders()[0].models[0].parameters, {
  temperature: 0.7,
  max_tokens: 4096
})
const custom = store.saveModel({
  ...modelInput,
  id: saved.id,
  name: '',
  parameters: { think: { type: 'enabled', budget: 1024 }, enable_thinking: true }
})[0].models[0]
assert.equal(custom.name, modelInput.modelId)
assert.deepEqual(custom.parameters, {
  temperature: 0.7,
  max_tokens: 4096,
  think: { type: 'enabled', budget: 1024 },
  enable_thinking: true
})
assert.equal(store.deleteModel(saved.id)[0].models.length, 0)
store.saveModel(modelInput)
store.deleteProvider(provider.id)
assert.equal(read.prepare('SELECT COUNT(*) AS count FROM llm_models').get().count, 0)
assert.throws(
  () => store.saveProvider({ id: provider.id, name: 'Missing', baseUrl: 'https://example.com' }),
  (error) => error.code === 'state'
)
encryptionAvailable = false
assert.throws(
  () =>
    store.saveProvider({ id: null, name: 'Key', baseUrl: 'https://example.com', apiKey: 'secret' }),
  (error) => error.code === 'storage'
)
encryptionAvailable = true
const next = store.saveProvider({
  id: null,
  name: 'Key',
  baseUrl: 'https://example.com',
  apiKey: 'secret'
})[0]
assert.equal(
  store.saveProvider({ id: next.id, name: next.name, baseUrl: next.baseUrl, apiKey: '' })[0]
    .hasApiKey,
  false
)
read.close()
console.log(
  'Passed: schema reset, persistence, provider/model CRUD, validation, uniqueness, cascade deletion and key handling.'
)
async function testDiscovery() {
  const originalFetch = global.fetch
  const originalTimeout = AbortSignal.timeout
  try {
    const configured = store.saveProvider({
      id: next.id,
      name: next.name,
      baseUrl: 'https://example.com/v1/',
      apiKey: 'discovery-key'
    })[0]
    global.fetch = async (url, options) => {
      assert.equal(String(url), 'https://example.com/v1/models')
      assert.equal(options.headers.Authorization, 'Bearer discovery-key')
      assert.equal(options.redirect, 'error')
      return Response.json({ data: [{ id: 'z-model' }, { id: 'a-model' }, { id: 'a-model' }] })
    }
    assert.deepEqual(await store.fetchProviderModels(configured.id), ['a-model', 'z-model'])
    for (const [status, code] of [
      [401, 'llm-auth'],
      [403, 'llm-auth'],
      [404, 'llm-unsupported'],
      [405, 'llm-unsupported'],
      [500, 'llm-network']
    ]) {
      global.fetch = async () => new Response('', { status })
      await assert.rejects(store.fetchProviderModels(configured.id), (error) => error.code === code)
    }
    for (const payload of [{ models: [] }, { data: [{}] }, { data: [{ id: '' }] }]) {
      global.fetch = async () => Response.json(payload)
      await assert.rejects(
        store.fetchProviderModels(configured.id),
        (error) => error.code === 'llm-response'
      )
    }
    global.fetch = async () => new Response('invalid json')
    await assert.rejects(
      store.fetchProviderModels(configured.id),
      (error) => error.code === 'llm-response'
    )
    global.fetch = async () => Response.json({ data: [] })
    assert.deepEqual(await store.fetchProviderModels(configured.id), [])
    global.fetch = async () => {
      throw new TypeError('network')
    }
    await assert.rejects(
      store.fetchProviderModels(configured.id),
      (error) => error.code === 'llm-network'
    )
    AbortSignal.timeout = () => {
      const controller = new AbortController()
      controller.abort()
      return controller.signal
    }
    await assert.rejects(
      store.fetchProviderModels(configured.id),
      (error) => error.code === 'llm-timeout'
    )
    AbortSignal.timeout = originalTimeout
    global.fetch = async () => new Response('x'.repeat(2 * 1024 * 1024 + 1))
    await assert.rejects(
      store.fetchProviderModels(configured.id),
      (error) => error.code === 'llm-response'
    )
    encryptionAvailable = false
    await assert.rejects(
      store.fetchProviderModels(configured.id),
      (error) => error.code === 'llm-key'
    )
    encryptionAvailable = true
    await assert.rejects(store.fetchProviderModels('missing'), (error) => error.code === 'state')
    store.saveProvider({
      id: configured.id,
      name: configured.name,
      baseUrl: 'http://localhost:1234',
      apiKey: ''
    })
    global.fetch = async (url, options) => {
      assert.equal(String(url), 'http://localhost:1234/models')
      assert.equal(options.headers.Authorization, undefined)
      return Response.json({ data: [{ id: 'local-model' }] })
    }
    assert.deepEqual(await store.fetchProviderModels(configured.id), ['local-model'])
    console.log(
      'Passed: model discovery URL, authentication, parsing, deduplication, empty results, errors, timeout, size limit and local providers.'
    )
  } finally {
    global.fetch = originalFetch
    AbortSignal.timeout = originalTimeout
    fs.rmSync(root, { recursive: true, force: true })
  }
}
testDiscovery().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
