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
  (name) =>
    name === './data-directory'
      ? { ServiceError: Error }
      : name === '../../package.json'
        ? require('../package.json')
        : require(name),
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
const note = db.prepare(`INSERT INTO logs
  (id,type,content_json,recorded_at,time_zone,local_date,created_at,updated_at,task_id)
  VALUES(?,'manual','{"text":"随手记","codeCards":[]}',0,'Asia/Shanghai','2026-10-10',0,0,?)`)
note.run('unlinked', null)
note.run('linked-1', 'todo')
note.run('linked-2', 'todo')
note.run('linked-schedule', 'schedule')
const updateContent = db.prepare('UPDATE logs SET content_json=? WHERE id=?')
for (const invalid of [
  'not json',
  'null',
  '[]',
  '{}',
  '{"text":1,"codeCards":[]}',
  '{"text":"正文","codeCards":{}}',
  '{"text":"正文","codeCards":null}'
]) {
  assert.throws(() => updateContent.run(invalid, 'unlinked'))
}
const structuredContent = {
  text: '正文\n仍是一段文本',
  codeCards: [
    {
      id: 'code-1',
      name: '任务逻辑',
      language: 'typescript',
      code: 'const value = 1\n  // 保留缩进'
    },
    { id: 'code-2', name: '', language: '', code: 'SELECT * FROM tasks;' }
  ]
}
updateContent.run(JSON.stringify(structuredContent), 'unlinked')
assert.deepEqual(
  JSON.parse(db.prepare("SELECT content_json FROM logs WHERE id='unlinked'").get().content_json),
  structuredContent
)
assert.throws(() => note.run('orphan-note', 'missing'))
assert.throws(() => db.prepare("UPDATE logs SET task_id='missing' WHERE id='unlinked'").run())
assert.equal(db.prepare("SELECT COUNT(*) AS count FROM logs WHERE task_id='todo'").get().count, 2)
db.prepare("UPDATE logs SET task_id=NULL WHERE id='linked-2'").run()
assert.equal(db.prepare("SELECT task_id FROM logs WHERE id='linked-2'").get().task_id, null)
db.prepare("UPDATE tasks SET deleted_at=1 WHERE id='todo'").run()
assert.equal(db.prepare("SELECT task_id FROM logs WHERE id='linked-1'").get().task_id, 'todo')
initializeDatabase(db)
assert.equal(db.prepare('SELECT COUNT(*) AS count FROM tasks').get().count, 2)
assert.equal(db.prepare("SELECT task_id FROM logs WHERE id='linked-1'").get().task_id, 'todo')
db.prepare("DELETE FROM tasks WHERE id='todo'").run()
assert.equal(db.prepare("SELECT task_id FROM logs WHERE id='linked-1'").get().task_id, null)
assert.equal(db.prepare('SELECT COUNT(*) AS count FROM logs').get().count, 4)
assert.equal(db.prepare('SELECT COUNT(*) AS count FROM task_occurrences').get().count, 0)
assert.equal(db.prepare('SELECT COUNT(*) AS count FROM todo_occurrence_states').get().count, 0)
db.prepare("DELETE FROM tasks WHERE id='schedule'").run()
assert.equal(db.prepare('SELECT COUNT(*) AS count FROM task_repeat_rules').get().count, 0)
db.exec(
  "UPDATE database_metadata SET schema_hash='outdated'; CREATE TABLE schema_migrations(version INTEGER);"
)
initializeDatabase(db)
assert.equal(db.prepare('SELECT COUNT(*) AS count FROM logs').get().count, 0)
assert.equal(db.prepare('SELECT version FROM database_metadata').get().version, '0.0.0')
assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), [])
assert.equal(
  db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE name='schema_migrations'").get()
    .count,
  0
)
db.exec("UPDATE database_metadata SET version='0.0.1'")
assert.throws(() => initializeDatabase(db))
db.exec("UPDATE database_metadata SET version='0.10.0'")
assert.throws(() => initializeDatabase(db))
db.exec("UPDATE database_metadata SET version='1.0.0'")
assert.throws(() => initializeDatabase(db))
db.exec("UPDATE database_metadata SET version='invalid'")
assert.throws(() => initializeDatabase(db))
db.close()
console.log(
  'Passed: task constraints, note associations, foreign keys, deletion behavior, reopen persistence and schema reset.'
)
