# Dayflow 任务模块需求文档

版本：v0.2 · 日期：2026-10-07 · 状态：需求草案，部分业务规则已确认

本文梳理任务模块的业务规则、数据模型和数据库结构，不包含页面布局、视觉设计、组件选型或开发实现。已确认需求来自本次讨论；为补齐数据一致性提出的规则均作为本稿建议，尚不代表用户已定稿。本文不表示功能已经实现。

## 1. 范围与已确认需求

- 模块提供列表、日历、看板三种查看方式，三者使用同一套任务数据与状态规则。
- 所有查看方式均支持年、月、日粒度。
- 公共父类为 `Task`，包含名称、开始时间、结束时间、是否重复、重复频率、重复截止时间、地点、链接等。
- `Todo`（待办）继承 `Task`，增加完成情况等人工管理字段。
- `Schedule`（日程）继承 `Task`，目前没有额外的业务字段。
- 看板状态为待办、进行中、已完成。
- Todo 的状态由用户手动调整，不因开始时间或结束时间自动变化。
- Schedule 的状态自动判断：未到开始时间为待办，处于开始与结束之间为进行中，结束后为已完成；全天日程按全天规则处理。
- 全天日程仅在覆盖日期内为进行中，过去为已完成，未来为待办。
- Todo 允许无日期。
- 未完成待办自动滚动到今天，并让用户知道仍有未完成待办；滚动不改变人工状态。

页面设计在后续开发中逐步确定。本文仅定义三种查看方式共用的数据查询契约，以及看板的状态归类，不规定页面呈现方式。

## 2. 核心对象与关系

### 2.1 Task、Todo、Schedule

`Task` 是公共业务抽象，不单独创建没有具体类型的 Task。每条任务必须是 `todo` 或 `schedule`，类型在创建后保持不变；类型转换暂不纳入本稿范围。

业务模型使用继承关系表达，数据库不要求照搬类继承。建议采用公共任务表、重复规则表、任务实例表和待办实例状态表。日程没有额外字段，因此无需单独创建日程表。

### 2.2 定义与实例

- **任务定义**：保存名称、类型、地点、链接、初始时间及重复规则，表示“要做什么、何时发生”。
- **任务实例**：表示该任务某一次实际发生，有自己的有效时间及稳定标识。
- 非重复任务也有且只有一个实例，统一查询和状态处理。
- 重复任务对应多个实例；完成某一天的待办只改变这一次，不完成整个重复序列。
- 日程实例的状态由自身有效时间计算，不存储随时间变化的状态。

例如“每天读书”是一个 Todo 定义，10 月 7 日与 10 月 8 日各自是独立实例。7 日已完成不会使 8 日也变为已完成。

### 2.3 推荐模型

| 对象                  | 主要字段                                                                                                  | 职责                   |
| --------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------- |
| Task                  | id、type、name、时间字段、timeZone、isAllDay、location、link、repeatRule、createdAt、updatedAt、deletedAt | 公共定义               |
| Todo extends Task     | 实例的 manualStatus、completedAt；派生 isCompleted                                                        | 人工管理完成情况       |
| Schedule extends Task | 无额外业务字段                                                                                            | 按实例时间计算状态     |
| RepeatRule            | frequency、interval、untilDate                                                                            | 描述重复序列           |
| TaskOccurrence        | id、taskId、recurrenceKey、有效时间、isCancelled                                                          | 标识每次发生及单次调整 |

Todo 的状态必须属于实例。业务接口可将状态组合进返回的 Todo 实例对象，但不能把某次完成状态存到整个 Task 定义上。

## 3. 字段与时间语义

### 3.1 公共字段

| 字段                         | 规则                                                     |
| ---------------------------- | -------------------------------------------------------- |
| id                           | 稳定唯一 ID，重试创建使用同一 ID                         |
| type                         | `todo` / `schedule`，必填                                |
| name                         | 必填，去除首尾空白后不能为空；建议最多 200 字符          |
| startAt / endAt              | 有具体时刻的开始与结束，UTC Unix 毫秒                    |
| startDate / endDateExclusive | 全天任务的本地日期，`YYYY-MM-DD`；结束日期不包含在范围内 |
| timeZone                     | 必填，创建时固定的 IANA 时区，如 `Asia/Shanghai`         |
| isAllDay                     | 是否全天，与是否重复相互独立                             |
| isRepeating                  | 从重复规则是否存在派生，不在数据库再保存一份布尔值       |
| repeatRule                   | 非重复为 null；重复时包含频率、间隔和可选截止日期        |
| location                     | 可选，纯文本；建议最多 500 字符                          |
| link                         | 可选，单个 HTTP/HTTPS 链接；建议最多 2,048 字符          |
| createdAt / updatedAt        | 系统维护，UTC Unix 毫秒                                  |
| deletedAt                    | 可选，软删除时刻；与时间自然结束、已完成不同             |

暂不引入优先级、标签、提醒、附件、参与者、子任务或任务依赖。后续需要时另行扩展。

### 3.2 时间组合（建议）

- 有时刻的 Schedule 必须有开始和结束，且 `endAt > startAt`。
- 全天 Schedule 必须有开始日期和排他结束日期；单日全天日程的结束日期为次日。
- Todo 可无日期、仅有开始时间，或有完整时间范围；暂不支持仅有结束时间。
- 全天 Todo 同样使用日期范围；无日期 Todo 的 `isAllDay=false`。
- 时间戳与全天日期两组字段互斥，不能同时填入。
- 重复任务必须有完整的时间范围或全天日期范围；无日期或仅有开始时间的 Todo 暂不允许重复。
- 时间验证由主进程执行，不仅依赖输入控件。

区间统一采用 `[start, end)`：开始时刻包含，结束时刻不包含。这样恰好到达结束时刻即为已完成，相邻日程不会在同一时刻同时处于进行中。

日期不能通过加固定 24 小时换算：全天边界按任务时区的本地午夜解析，以兼容夏令时。切换应用时区不改写已保存任务的时间或重复锚点。

## 4. 状态规则

### 4.1 Todo：人工状态

| 状态   | 值            | 规则         |
| ------ | ------------- | ------------ |
| 待办   | `pending`     | 新建默认值   |
| 进行中 | `in_progress` | 用户手动开始 |
| 已完成 | `completed`   | 用户手动完成 |

允许在三种状态间手动切换。开始时间到达、结束时间过去、全天范围结束都不会自动修改 Todo 状态。

- `isCompleted = (manualStatus === 'completed')`，不独立持久化，避免与状态冲突。
- 进入已完成时设置 `completedAt` 为真实操作时间。
- 离开已完成时清空 `completedAt`；再次完成记录新的完成时间。
- 重复提交相同状态不改变完成时间与修改时间。
- 结束时间过去但未完成的 Todo 仍属于待办或进行中。“逾期”如后续需要，是附加属性，不是第四种状态。

### 4.2 Schedule：自动状态

对有具体时间的实例，以当前真实时间 `now` 判断：

| 条件                     | 状态   |
| ------------------------ | ------ |
| `now < startAt`          | 待办   |
| `startAt <= now < endAt` | 进行中 |
| `now >= endAt`           | 已完成 |

已确认：全天日程在覆盖的本地日期内始终为进行中；覆盖日期之前为待办，之后为已完成。多日全天日程在整个日期区间内为进行中。

- Schedule 不允许用户直接写入状态，不保存 `completedAt`。
- Schedule 的“已完成”表示时间已经结束，不表示用户实际执行或参加。
- 浏览历史或未来日期时，仍按当前真实时间判断状态，不按当前选中的日期模拟时间。
- 状态变化不更新 `updatedAt`，不要求后台定时写数据库。窗口重新激活、系统时间变化及时间边界到达后重新计算。
- 每次查询使用同一个 `now`，避免同批实例在边界附近采用不同判断时刻。

## 5. 重复规则（建议首版范围）

### 5.1 频率和截止

支持 `daily`、`weekly`、`monthly`、`yearly`，`interval` 为正整数，默认 1。例如 weekly + 2 表示每两周一次。

- 重复以任务首次开始的本地日期与时间为锚点，不以最后完成时间为锚点。
- 周重复固定为锚点对应的星期几；首版不包含一周多个指定日期。
- 月重复固定为锚点的月内日期；年重复固定为锚点的月与日。
- 月份没有对应日期时跳过该月，例如每月 31 日跳过 2 月；每年 2 月 29 日跳过非闰年。
- `untilDate` 是任务时区的本地日期，含当日；为空表示无截止。
- 截止判断使用每次实例的原始开始日期，允许该实例结束于截止日期之后。
- 截止日期不得早于首次开始日期。
- 每次实例保持首个实例的时长；全天实例保持覆盖的本地日期数。有时刻实例保持毫秒时长。
- 重复按本地日历推进，保持本地开始钟点；夏令时导致该钟点不存在时移至缺口之后的对应时刻，出现两次时取较早的一次。该策略需由后续实现统一执行。

### 5.2 实例生成与标识

不一次性保存无限序列。查询时根据日期范围展开规则，只有有人工状态、单次调整或取消记录的重复实例需要持久化；普通重复日程实例可动态返回。

- 对重复实例，`recurrenceKey` 为原始计划开始值：有时刻用原始 UTC 毫秒的十进制字符串，全天用原始本地日期。
- 非重复实例使用固定键 `single`。
- `(taskId, recurrenceKey)` 唯一；实例 ID 由这两个值稳定生成，不能每次查询生成新 ID。
- 单次改期后保留原 recurrenceKey 和 ID，有效时间可变化。
- 虚拟 Todo 实例默认待办；首次修改时在同一事务中保存实例和状态。
- 生成应覆盖可能跨入查询区间的实例，不能只生成开始日期落在区间内的实例。
- 已持久化的改期实例另按有效时间查询并合并，避免移动到查询区间的实例被遗漏；按稳定 ID 去重，取消记录覆盖原生成实例。
- 大范围查询可分段展开与分页，但不能静默截断后当作完整结果返回。

### 5.3 修改与删除边界

- 名称、地点、链接修改作用于整个任务定义，历史实例读取最新公共信息；首版不保存历史文案快照。
- 单次实例允许改期或取消，不改变其他实例。
- 已存在实例状态或例外记录的重复任务，不允许直接覆盖重复锚点、频率或时区。建议后续通过“此后实例”拆分序列完成，避免完成记录失去归属；序列拆分不在本稿首版范围。
- 未有实例状态或例外的重复任务，可以整体修改规则；非重复任务可直接修改时间。
- 非重复与重复之间的转换暂不支持；关闭重复可通过截止日期限制后续发生。
- 删除整个任务设置 Task 的 `deletedAt`，其所有实例默认不可见；恢复后保留实例状态与取消记录。
- 单次取消使用实例 `isCancelled`，不能用“已完成”代替删除；恢复单次取消后恢复原状态。

## 6. 年、月、日共用查询规则

查询输入为查看方式、粒度、锚点日期和查看时区。查看方式不改变查询归属或状态逻辑。

| 粒度 | 本地日期范围                     |
| ---- | -------------------------------- |
| 日   | 选中日到次日，不包含次日         |
| 月   | 所在月第一日到下月第一日         |
| 年   | 所在年 1 月 1 日到次年 1 月 1 日 |

- 有时刻任务按查看时区把查询范围换算成 UTC，再筛选与范围重叠的实例：`startAt < rangeEnd AND endAt > rangeStart`。
- 仅有开始时间的 Todo 视为归属该时间点：`rangeStart <= startAt < rangeEnd`。
- 全天任务按日期范围重叠判断，不因查看时区改变标记的日期。
- 跨日、跨月、跨年的实例在所有与其重叠的范围出现；同一次查询只返回一条实例。页面如何表达跨期跨度后续设计。
- 有日期 Todo 除按计划时间归属外，历史未完成实例还自动纳入包含今天的查询范围，具体规则见第 6.1 节。
- Todo 允许无日期；建议未完成的无日期 Todo 同样纳入包含今天的查询范围，同时保留未排期集合查询。不为其补写虚构的计划日期。
- 过滤软删除任务和已取消实例；历史已完成任务仍可以查询。
- 返回统一实例结构：公共 Task 字段、稳定实例 ID、有效时间、计算后的状态，Todo 额外返回完成时间。

### 6.1 未完成待办滚动到今天

已确认：历史未完成 Todo 自动滚动到今天，列表、日历、看板遵循同一规则。`pending` 和 `in_progress` 均属于未完成，不因滚动变成另一种状态。

本稿对数据行为作如下细化，作为实现建议：

- “滚动”是查询时增加今天的归属，不修改原始计划时间、重复锚点或实例标识，也不每天新增一条任务记录。
- 有完整范围的 Todo，在原计划范围已于今天开始之前或恰好开始时结束且仍未完成时滚入今天；仅有开始时间的 Todo，在开始日期早于今天时滚入今天。今天尚未到时刻的任务按正常计划显示，不标记为历史遗留。
- 今天及今天所在月、年的查询必须包含历史未完成实例，即使其原计划在上月或去年。其他日期范围仍按原计划查询，不把未完成实例滚入每个未来日期。
- 原计划日期仍可查到该实例；在同一查询结果中按稳定实例 ID 去重，正常命中与滚动命中不能重复计数。
- 跨日且尚未结束的 Todo 按原范围正常归属，不额外生成滚动记录。
- 建议无日期且未完成的 Todo 随今天查询返回，标记为未排期，不标记为历史延期；无日期已完成 Todo 建议按完成日期归属，避免完成后无法按日期找到。
- 完成后不再作为滚动待办返回。有日期实例仍保留原计划日期归属及真实完成时间；重新设为未完成时，重新计算是否滚入今天。
- 重复 Todo 的每个历史未完成实例分别滚动，不能只返回最近一次或把多次实例合为一个。查询要追溯序列起点至今天的未完成实例，可分页，但不能只展开当前日期范围而漏掉积压任务。
- 查询返回派生字段 `isCarriedOver`（历史未完成）、`isUnscheduled`（未排期）、`effectiveDate`（滚动归属日期，滚动时为今天），同时保留原计划时间。以上字段不持久化。
- 为满足“让用户知道有未完成待办”，查询需提供今天未完成总数、历史滚动数、未排期数，按实例去重；总数包含待办与进行中。必须能区分历史遗留与今天新计划，具体呈现后续设计，不规定布局或提示样式。
- 今天由查询采用的查看时区与统一 `now` 确定；跨午夜、窗口重新激活或系统时区变化后重新计算，无需每日批量写数据库。

正常日期实例、历史滚动实例和未排期实例应合并后再筛选状态、计数与分页。未完成数量统计完整集合，不以当前页条数代替。

## 7. 数据库结构建议

沿用项目现有 SQLite 与主进程数据访问，不创建第二套数据库。开发阶段只保留最新结构，以 SQLite `user_version` 记录版本；旧版本数据库首次打开时清空重建，无需兼容或迁移脚本。以下 SQL 表达目标结构，建表定义已接入数据库初始化。

### 7.1 tasks：公共任务定义

```sql
CREATE TABLE tasks (
  id TEXT NOT NULL PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('todo', 'schedule')),
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
  is_all_day INTEGER NOT NULL DEFAULT 0 CHECK (is_all_day IN (0, 1)),
  start_at INTEGER,
  end_at INTEGER,
  start_date TEXT,
  end_date_exclusive TEXT,
  time_zone TEXT NOT NULL,
  location TEXT,
  link TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  CHECK (
    (is_all_day = 1 AND start_at IS NULL AND end_at IS NULL
      AND start_date IS NOT NULL AND end_date_exclusive IS NOT NULL
      AND end_date_exclusive > start_date)
    OR
    (is_all_day = 0 AND start_date IS NULL AND end_date_exclusive IS NULL
      AND (end_at IS NULL OR (start_at IS NOT NULL AND end_at > start_at)))
  ),
  CHECK (type = 'todo' OR is_all_day = 1
    OR (start_at IS NOT NULL AND end_at IS NOT NULL))
);
```

严格日期合法性、时区、链接与字符上限由数据服务补充校验，不能仅依赖字符串比较。空的可选文本统一保存为 NULL。

### 7.2 task_repeat_rules：重复定义

```sql
CREATE TABLE task_repeat_rules (
  task_id TEXT NOT NULL PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE,
  frequency TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly', 'yearly')),
  interval INTEGER NOT NULL DEFAULT 1 CHECK (interval > 0),
  until_date TEXT
);
```

每个 Task 至多一条重复规则。是否重复由该记录是否存在派生，频率和截止日期不在 tasks 重复存储。任务完整时间、截止日期等跨表约束由事务内的数据服务验证。

### 7.3 task_occurrences：已持久化实例

```sql
CREATE TABLE task_occurrences (
  id TEXT NOT NULL PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  recurrence_key TEXT NOT NULL,
  is_all_day INTEGER NOT NULL CHECK (is_all_day IN (0, 1)),
  start_at INTEGER,
  end_at INTEGER,
  start_date TEXT,
  end_date_exclusive TEXT,
  is_cancelled INTEGER NOT NULL DEFAULT 0 CHECK (is_cancelled IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (task_id, recurrence_key),
  CHECK (
    (is_all_day = 1 AND start_at IS NULL AND end_at IS NULL
      AND start_date IS NOT NULL AND end_date_exclusive IS NOT NULL
      AND end_date_exclusive > start_date)
    OR
    (is_all_day = 0 AND start_date IS NULL AND end_date_exclusive IS NULL
      AND (end_at IS NULL OR (start_at IS NOT NULL AND end_at > start_at)))
  )
);
```

实例时间是完整的有效时间快照，不是含义模糊的局部覆盖字段。非重复任务创建时同步创建 `single` 实例；编辑时间时同步更新定义与实例。重复实例因状态、改期或取消首次落库后保留自己的时间快照。

数据服务还需保证：实例时间符合父任务类型、对应合法重复键，非重复任务仅有 single 实例。首版单次改期保持原来的全天/有时刻形式。

### 7.4 todo_occurrence_states：Todo 的实例扩展

```sql
CREATE TABLE todo_occurrence_states (
  occurrence_id TEXT NOT NULL PRIMARY KEY
    REFERENCES task_occurrences(id) ON DELETE CASCADE,
  manual_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (manual_status IN ('pending', 'in_progress', 'completed')),
  completed_at INTEGER,
  CHECK (
    (manual_status = 'completed' AND completed_at IS NOT NULL)
    OR (manual_status <> 'completed' AND completed_at IS NULL)
  )
);
```

仅 Todo 实例允许状态行；已持久化 Todo 实例必须有且只有一行状态，Schedule 实例不得有状态行。该跨表类型与完整性约束在写入服务中验证，并与实例写入同事务完成。状态修改同步更新实例 `updated_at`，不修改整个序列的 `updated_at`。

### 7.5 索引与关系

```sql
CREATE INDEX idx_tasks_active_time ON tasks(start_at, end_at)
  WHERE deleted_at IS NULL AND is_all_day = 0;
CREATE INDEX idx_tasks_active_date ON tasks(start_date, end_date_exclusive)
  WHERE deleted_at IS NULL AND is_all_day = 1;
CREATE INDEX idx_occurrences_time ON task_occurrences(start_at, end_at)
  WHERE is_cancelled = 0 AND is_all_day = 0;
CREATE INDEX idx_occurrences_date ON task_occurrences(start_date, end_date_exclusive)
  WHERE is_cancelled = 0 AND is_all_day = 1;
```

关系为 `tasks 1 → 0..1 task_repeat_rules`、`tasks 1 → N task_occurrences`、`Todo 实例 1 → 1 todo_occurrence_states`。重复序列查询必须读取重复规则并展开，不能仅用 tasks 的首次时间范围筛选，否则会漏掉后续实例。复合唯一约束同时提供按 task_id 查找实例的索引。

实例状态表不另存 is_completed；日程不存自动状态；Task 不另存 is_repeating。这些值统一派生，减少互相矛盾的数据。

## 8. 保存、迁移与现有模块边界

- 创建任务、重复规则、非重复实例及 Todo 状态使用同一事务；失败全部回滚。
- 主进程管理校验、查询、状态计算、重复展开与写入；渲染层通过受控接口访问，不直接执行 SQL。
- 首次创建和实例首次落库使用稳定 ID 与唯一约束防重复；重试相同请求返回已有结果，不覆盖不同内容。
- 读后修改需携带版本标识，例如读取时的 updatedAt；主进程保证每个对象真实修改时版本单调递增，检测冲突后拒绝覆盖并返回冲突。
- 软删除保留子表，彻底删除才通过外键级联清理。是否提供任务回收站及其交互留待后续确定。
- 开发阶段不保留迁移序列或 `schema_migrations` 表。最新建表定义与版本记录同事务提交；旧版本数据库清空重建，同版本再次打开保留数据。
- 任务不直接复用 `logs`：日志表示已经记录的事情，Task 表示计划及实例，两者生命周期不同。
- 本稿不要求任务操作自动生成日志，也不要求日程结束自动生成日报。未来接入日志时使用任务/实例稳定 ID 关联，不依赖正文猜测。
- 列表、日历、看板共享查询与修改服务，避免出现不同查看方式读到不同状态的情况。

## 9. 业务核对示例

以下作为后续需求核对依据，不表示已经执行测试。

| 场景                                   | 预期                                                 |
| -------------------------------------- | ---------------------------------------------------- |
| Todo 时间已过，用户未开始              | 仍为待办                                             |
| Todo 手动开始，再手动完成              | 进行中 → 已完成，保存完成时刻                        |
| Todo 已完成后重新设为待办              | 清空完成时刻                                         |
| 日程 10:00–11:00，当前 10:00           | 进行中                                               |
| 同一日程，当前 11:00                   | 已完成                                               |
| 今天的单日全天日程                     | 全天进行中                                           |
| 昨天的全天日程                         | 已完成                                               |
| 明天的全天日程                         | 待办                                                 |
| 昨天计划的 Todo 尚未完成               | 今天可查到，保留原计划时间与人工状态，标记历史未完成 |
| 去年计划的 Todo 尚未完成，查看本月     | 本月包含今天时可查到，不遗漏跨年积压                 |
| 历史 Todo 同时命中原计划范围与滚动条件 | 同一查询只返回并计数一次                             |
| 历史 Todo 今天手动完成                 | 不再计入滚动待办，保留真实完成时间与原计划归属       |
| 多个每日 Todo 历史实例未完成           | 每个实例独立滚入今天，完成其中一个不影响其他实例     |
| 无日期 Todo 未完成                     | 建议随今天查询返回，标记未排期，不填入计划日期       |
| 每日 Todo，今天完成                    | 只完成今天实例，明天仍为待办                         |
| 截止日期为 10 月 7 日                  | 保留原始开始日期在 7 日的实例，不生成 8 日实例       |
| 日程跨 10 月 7 日与 8 日               | 两日日范围均可查到同一实例                           |
| 实例从 7 日改到 9 日                   | 9 日能查到，7 日不再返回原时间实例                   |
| 浏览未来日期中的日程                   | 按真实当前时间为待办                                 |
| 删除并恢复重复任务                     | 已保存的单次完成情况保持不变                         |

## 10. 后续需确认的业务选择

以下尚未由用户明确，本稿已给出可供讨论的默认建议，不作为已确认要求：

1. **Todo 时间组合**：允许无日期已确认；仅开始时间、完整范围及暂不支持仅结束时间仍为建议。
2. **滚动细则与未排期归属**：自动滚动到今天并提示未完成已确认；建议保留原计划归属、无日期未完成随今天查询、无日期已完成按完成日期归属，详见第 6.1 节。
3. **重复能力**：建议首版为按日、周、月、年及间隔重复，截止为包含当日的日期；工作日、多星期选择、按次数截止暂不包含。
4. **重复序列编辑**：建议先支持公共信息修改、单次改期与取消；已有实例记录后修改重复规则需要后续引入序列拆分。
5. **月底和闰日**：建议缺少对应日期时跳过，不自动移至月底；确认后所有查看方式采用同一规则。

页面设计另行推进，不作为本文定稿的前置内容。

## 11. 变更记录

- 2026-10-07，v0.2：确认全天日程按覆盖日期计算状态、Todo 允许无日期、未完成待办自动滚动到今天并让用户识别未完成情况；补充滚动查询、实例去重和跨期积压规则，未改变数据库中的原计划时间。
