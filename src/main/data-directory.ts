import {
  closeSync,
  constants,
  copyFileSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
  unlinkSync
} from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { validDate, type ErrorCode, type ReportWrite } from '../shared/model'

export class ServiceError extends Error {
  constructor(public code: ErrorCode) {
    super(code)
  }
}

// Write beside the destination so replacement stays on the same filesystem.
export function atomicWrite(path: string, content: string): void {
  const temporary = join(dirname(path), `.dayflow-${randomUUID()}.tmp`)
  let descriptor: number | undefined
  try {
    descriptor = openSync(temporary, 'wx', 0o600)
    writeFileSync(descriptor, content, 'utf8')
    fsyncSync(descriptor)
    closeSync(descriptor)
    descriptor = undefined
    renameSync(temporary, path)
  } finally {
    if (descriptor !== undefined) closeSync(descriptor)
    rmSync(temporary, { force: true })
  }
}

function files(root: string, folder = ''): string[] {
  return readdirSync(join(root, folder), { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name)
    if (entry.isDirectory()) return files(root, path)
    if (!entry.isFile()) throw new ServiceError('storage')
    return [path]
  })
}

function digest(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function contains(parent: string, child: string): boolean {
  const path = relative(parent, child)
  return path === '' || (!path.startsWith(`..${sep}`) && path !== '..' && !isAbsolute(path))
}

export class DataDirectory {
  root: string
  readonly configured: boolean
  private readonly locator: string

  constructor(home: string, userData: string) {
    this.locator = join(userData, 'storage-location.json')
    this.configured = existsSync(this.locator)
    if (this.configured) {
      const value: unknown = JSON.parse(readFileSync(this.locator, 'utf8'))
      if (
        !value ||
        typeof value !== 'object' ||
        !('directory' in value) ||
        typeof value.directory !== 'string' ||
        !isAbsolute(value.directory)
      )
        throw new ServiceError('storage')
      // A disconnected drive must not silently become a new empty database.
      if (!existsSync(value.directory)) throw new ServiceError('storage')
      this.root = realpathSync(value.directory)
    } else {
      this.root = join(home, '.dayflow')
      mkdirSync(this.root, { recursive: true })
      this.root = realpathSync(this.root)
    }
    if (!lstatSync(this.root).isDirectory()) throw new ServiceError('storage')
  }

  remember(): void {
    mkdirSync(dirname(this.locator), { recursive: true })
    atomicWrite(this.locator, JSON.stringify({ directory: this.root }))
  }

  ensureAvailable(): void {
    if (!existsSync(this.root) || !lstatSync(this.root).isDirectory())
      throw new ServiceError('storage')
  }

  reportPath(date: string): string {
    this.ensureAvailable()
    if (!validDate(date)) throw new ServiceError('time')
    const folder = join(this.root, 'reports')
    if (existsSync(folder) && !lstatSync(folder).isDirectory()) throw new ServiceError('storage')
    return join(folder, `${date}.md`)
  }

  createReport(date: string): string {
    const path = this.reportPath(date)
    mkdirSync(dirname(path), { recursive: true })
    let descriptor: number
    try {
      descriptor = openSync(path, 'wx', 0o600)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') return this.readReport(date)
      throw error
    }
    try {
      fsyncSync(descriptor)
    } finally {
      closeSync(descriptor)
    }
    return ''
  }

  readReport(date: string): string {
    const path = this.reportPath(date)
    if (!existsSync(path)) return ''
    if (!lstatSync(path).isFile()) throw new ServiceError('storage')
    return readFileSync(path, 'utf8')
  }

  deleteReport(date: string, previous: string): null {
    if (typeof previous !== 'string') throw new ServiceError('state')
    const path = this.reportPath(date)
    if (!existsSync(path)) return null
    if (this.readReport(date) !== previous) throw new ServiceError('conflict')
    unlinkSync(path)
    return null
  }

  reports(legacy: unknown): Record<string, string> {
    const marker = join(this.root, 'legacy-reports-imported.json')
    if (!existsSync(marker)) {
      if (!legacy || typeof legacy !== 'object' || Array.isArray(legacy))
        throw new ServiceError('state')
      const entries = Object.entries(legacy)
      if (entries.some(([date, content]) => !validDate(date) || typeof content !== 'string'))
        throw new ServiceError('state')
      for (const [date, content] of entries as [string, string][]) {
        const path = this.reportPath(date)
        if (!existsSync(path)) {
          mkdirSync(dirname(path), { recursive: true })
          atomicWrite(path, content)
        } else if (this.readReport(date) !== content) {
          const backup = join(this.root, 'backups', 'legacy-reports')
          mkdirSync(backup, { recursive: true })
          const backupPath = join(backup, `${date}.md`)
          if (existsSync(backupPath) && readFileSync(backupPath, 'utf8') !== content)
            throw new ServiceError('state')
          atomicWrite(backupPath, content)
        }
      }
      atomicWrite(marker, JSON.stringify({ importedAt: new Date().toISOString() }))
    }
    const folder = dirname(this.reportPath('2000-01-01'))
    const result: Record<string, string> = {}
    if (!existsSync(folder)) return result
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const date = entry.name.replace(/\.md$/, '')
      if (entry.name.endsWith('.md') && validDate(date)) result[date] = this.readReport(date)
    }
    return result
  }

  saveReports(writes: ReportWrite[]): Record<string, string> {
    if (
      !Array.isArray(writes) ||
      writes.some(
        (write) =>
          !write ||
          !validDate(write.date) ||
          typeof write.content !== 'string' ||
          typeof write.previous !== 'string'
      )
    )
      throw new ServiceError('state')
    if (new Set(writes.map((write) => write.date)).size !== writes.length)
      throw new ServiceError('state')
    const saved: Record<string, string> = {}
    for (const write of writes) {
      if (!existsSync(this.reportPath(write.date))) throw new ServiceError('conflict')
      const current = this.readReport(write.date)
      // Retry after a partial batch is safe; external edits are never overwritten.
      if (current !== write.previous && current !== write.content)
        throw new ServiceError('conflict')
      if (current !== write.content) atomicWrite(this.reportPath(write.date), write.content)
      saved[write.date] = write.content
    }
    return saved
  }

  migrate(target: string, prepare: () => void, validate: (root: string) => void): string {
    this.ensureAvailable()
    if (!isAbsolute(target) || !existsSync(target)) throw new ServiceError('state')
    const destination = realpathSync(resolve(target))
    if (destination === this.root) return this.root
    if (
      contains(this.root, destination) ||
      contains(destination, this.root) ||
      contains(destination, this.locator) ||
      !lstatSync(destination).isDirectory()
    )
      throw new ServiceError('invalid-directory')
    if (readdirSync(destination).length > 0) throw new ServiceError('directory-not-empty')
    const previous = this.root
    // Checkpoint and close SQLite before copying; main-process IPC is synchronous here.
    prepare()
    const created: string[] = []
    try {
      const sourceFiles = files(previous)
      const hashes = new Map(sourceFiles.map((path) => [path, digest(join(previous, path))]))
      for (const path of sourceFiles) {
        const output = join(destination, path)
        const top = join(destination, path.split(sep)[0])
        if (!created.includes(top)) created.push(top)
        mkdirSync(dirname(output), { recursive: true })
        copyFileSync(join(previous, path), output, constants.COPYFILE_EXCL)
        const descriptor = openSync(output, 'r')
        try {
          fsyncSync(descriptor)
        } finally {
          closeSync(descriptor)
        }
        if (digest(output) !== hashes.get(path)) throw new ServiceError('storage')
      }
      // Catch changes from another editor while copying before switching the locator.
      if (
        JSON.stringify(files(previous).sort()) !== JSON.stringify(sourceFiles.sort()) ||
        sourceFiles.some((path) => digest(join(previous, path)) !== hashes.get(path))
      )
        throw new ServiceError('conflict')
      validate(destination)
      this.root = destination
      this.remember()
      return destination
    } catch (error) {
      this.root = previous
      for (const path of created) rmSync(path, { recursive: true, force: true })
      throw error
    }
  }
}
