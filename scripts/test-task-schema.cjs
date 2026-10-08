/* eslint-disable @typescript-eslint/no-require-imports -- standalone schema verification */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const { DatabaseSync } = require('node:sqlite')
const moduleUnderTest = { exports: {} }
const source = ts.transpileModule(fs.readFileSync('src/main/database-schema.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText
vm.runInThisContext(`(function(require,module,exports){${source}\n})`)(
  () => ({ ServiceError: Error }),
  moduleUnderTest,
  moduleUnderTest.exports
)
const { initializeDatabase } = moduleUnderTest.exports
const db = new DatabaseSync(':memory:')
initializeDatabase(db)
const task = db.prepare(`INSERT INTO tasks
  (id,type,name,time_zone,created_at,updated_at,start_at,end_at)
  VALUES(?,?,?,'Asia/Shanghai',0,0,?,?)`)
task.run('todo', 'todo', '待办', null, null)
task.run('schedule', 'schedule', '日程', 10, 20)
assert.throws(() => task.run('invalid', 'schedule', '日程', null, null))
assert.throws(() => task.run('invalid', 'todo', ' ', null, null))
assert.throws(() => task.run('invalid', 'todo', '待办', 20, 10))
assert.throws(() => task.run('invalid', 'todo', '待办', null, 20))
const occurrence = db.prepare(`INSERT INTO task_occurrences
  (id,task_id,recurrence_key,is_all_day,created_at,updated_at)
  VALUES(?,?,?,0,0,0)`)
occurrence.run('single', 'todo', 'single')
assert.throws(() => occurrence.run('duplicate', 'todo', 'single'))
assert.throws(() => occurrence.run('orphan', 'missing', 'single'))
const state = db.prepare('INSERT INTO todo_occurrence_states VALUES(?,?,?)')
assert.throws(() => state.run('single', 'completed', null))
assert.throws(() => state.run('single', 'pending', 10))
state.run('single', 'completed', 10)
db.prepare('INSERT INTO task_repeat_rules VALUES(?,?,?,?)').run('schedule', 'daily', 1, null)
assert.throws(() => db.prepare('UPDATE task_repeat_rules SET interval=0').run())
initializeDatabase(db)
assert.equal(db.prepare('SELECT COUNT(*) AS count FROM tasks').get().count, 2)
db.prepare("DELETE FROM tasks WHERE id='todo'").run()
assert.equal(db.prepare('SELECT COUNT(*) AS count FROM task_occurrences').get().count, 0)
assert.equal(db.prepare('SELECT COUNT(*) AS count FROM todo_occurrence_states').get().count, 0)
db.prepare("DELETE FROM tasks WHERE id='schedule'").run()
assert.equal(db.prepare('SELECT COUNT(*) AS count FROM task_repeat_rules').get().count, 0)
db.exec('PRAGMA user_version=2; CREATE TABLE schema_migrations(version INTEGER);')
initializeDatabase(db)
assert.equal(
  db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE name='schema_migrations'").get()
    .count,
  0
)
db.exec('PRAGMA user_version=99')
assert.throws(() => initializeDatabase(db))
db.close()
console.log(
  'Passed: task constraints, uniqueness, foreign keys, cascades, reopen persistence and schema reset.'
)
