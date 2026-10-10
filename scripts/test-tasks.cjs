/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/explicit-function-return-type -- standalone JavaScript service verification */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const { DatabaseSync } = require('node:sqlite')
const { randomUUID } = require('node:crypto')
const { join } = require('node:path')
const { tmpdir } = require('node:os')
class ServiceError extends Error {
  constructor(code) {
    super(code)
    this.code = code
  }
}
const modules = new Map()
function load(path) {
  if (modules.has(path)) return modules.get(path)
  const module = { exports: {} }
  const source = ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText
  vm.runInThisContext(`(function(require,module,exports){${source}\n})`)(
    (name) =>
      name === './data-directory'
        ? { ServiceError }
        : name === '../shared/model'
          ? load('src/shared/model.ts')
          : name === '../../package.json'
            ? require('../package.json')
            : require(name),
    module,
    module.exports
  )
  modules.set(path, module.exports)
  return module.exports
}
const { initializeDatabase } = load('src/main/database-schema.ts')
const service = load('src/main/task-service.ts')
const root = fs.mkdtempSync(join(tmpdir(), 'dayflow-tasks-'))
const path = join(root, 'tasks.sqlite')
let db = new DatabaseSync(path)
initializeDatabase(db)
const base = () => ({
  id: randomUUID(),
  type: 'todo',
  name: '  测试任务  ',
  isAllDay: false,
  startAt: null,
  endAt: null,
  startDate: null,
  endDateExclusive: null,
  timeZone: 'Asia/Shanghai',
  location: null,
  link: null,
  repeatRule: null
})
assert.deepEqual(service.list(db), [])
const todo = base()
service.create(db, todo)
service.create(db, todo)
assert.equal(service.list(db).length, 1)
assert.equal(service.list(db)[0].name, '测试任务')
assert.throws(() => service.create(db, { ...todo, name: '不同内容' }), /conflict/)
for (const change of [
  { type: 'schedule' },
  { startAt: 20, endAt: 10 },
  { endAt: 10 },
  { name: ' ' },
  { link: 'javascript:alert(1)' },
  { timeZone: 'bad/zone' },
  { repeatRule: { frequency: 'daily', interval: 1, untilDate: null } },
  { isAllDay: true, startDate: '2026-02-30', endDateExclusive: '2026-03-01' }
]) {
  assert.throws(() => service.create(db, { ...base(), ...change }))
}
assert.equal(service.list(db).length, 1)
let item = service.list(db)[0]
service.setStatus(db, item.id, 'completed', item.updatedAt)
let completed = service.list(db)[0]
assert.equal(completed.status, 'completed')
assert.ok(completed.completedAt)
service.setStatus(db, completed.id, 'completed', completed.updatedAt)
assert.equal(service.list(db)[0].completedAt, completed.completedAt)
assert.throws(() => service.setStatus(db, item.id, 'pending', item.updatedAt), /conflict/)
service.setStatus(db, completed.id, 'pending', completed.updatedAt)
assert.equal(service.list(db)[0].completedAt, null)
const schedule = {
  ...base(),
  type: 'schedule',
  startAt: Date.parse('2026-10-08T02:00Z'),
  endAt: Date.parse('2026-10-08T03:00Z')
}
service.create(db, schedule)
for (const [now, status] of [
  [schedule.startAt - 1, 'pending'],
  [schedule.startAt, 'in_progress'],
  [schedule.endAt, 'completed']
])
  assert.equal(service.list(db, now).find((t) => t.taskId === schedule.id).status, status)
item = service.list(db).find((t) => t.taskId === schedule.id)
assert.throws(() => service.setStatus(db, item.id, 'completed', item.updatedAt), /state/)
const allDay = {
  ...base(),
  type: 'schedule',
  isAllDay: true,
  startDate: '2026-10-08',
  endDateExclusive: '2026-10-09'
}
service.create(db, allDay)
assert.equal(
  service.list(db, Date.parse('2026-10-07T16:00Z')).find((t) => t.taskId === allDay.id).status,
  'in_progress'
)
assert.equal(
  service.list(db, Date.parse('2026-10-08T16:00Z')).find((t) => t.taskId === allDay.id).status,
  'completed'
)
const repeat = {
  ...base(),
  isAllDay: true,
  startDate: '2026-10-06',
  endDateExclusive: '2026-10-07',
  repeatRule: { frequency: 'daily', interval: 1, untilDate: '2026-10-08' }
}
service.create(db, repeat)
const instances = service
  .list(db, Date.parse('2026-10-08T12:00Z'))
  .filter((t) => t.taskId === repeat.id)
assert.equal(instances.length, 3)
service.setStatus(db, instances[0].id, 'completed', instances[0].updatedAt)
assert.equal(service.list(db).find((t) => t.id === instances[1].id).status, 'pending')
const monthly = {
  ...base(),
  isAllDay: true,
  startDate: '2026-01-31',
  endDateExclusive: '2026-02-01',
  repeatRule: { frequency: 'monthly', interval: 1, untilDate: '2026-03-31' }
}
service.create(db, monthly)
assert.deepEqual(
  service
    .list(db)
    .filter((t) => t.taskId === monthly.id)
    .map((t) => t.startDate),
  ['2026-01-31', '2026-03-31']
)
const reordered = service.list(db).find((t) => t.taskId === todo.id)
const target = service.list(db).find((t) => t.taskId === repeat.id && t.status === 'pending')
service.setStatus(db, reordered.id, 'pending', reordered.updatedAt, target.id)
let order = service
  .list(db)
  .filter((t) => t.status === 'pending')
  .map((t) => t.id)
assert.equal(order.indexOf(reordered.id) + 1, order.indexOf(target.id))
service.setStatus(db, reordered.id, 'pending', reordered.updatedAt, null)
order = service
  .list(db)
  .filter((t) => t.status === 'pending')
  .map((t) => t.id)
assert.equal(order.at(-1), reordered.id)
const before = service.list(db)
db.close()
db = new DatabaseSync(path)
initializeDatabase(db)
assert.deepEqual(service.list(db), before)
const rollback = base()
db.exec(
  "CREATE TRIGGER reject_todo BEFORE INSERT ON todo_occurrence_states BEGIN SELECT RAISE(ABORT,'test'); END"
)
assert.throws(() => service.create(db, rollback))
assert.equal(db.prepare('SELECT id FROM tasks WHERE id=?').get(rollback.id), undefined)
db.close()
fs.rmSync(root, { recursive: true })
console.log(
  'Passed: task persistence, idempotency, validation, atomic writes, status conflicts, schedule boundaries and recurring instance isolation.'
)
