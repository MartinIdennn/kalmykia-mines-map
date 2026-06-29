export const meta = {
  name: 'agent-team',
  description: 'Команда агентов: план → реализация → тесты+ревью, цикл пока чек-лист не закрыт',
  phases: [
    { title: 'Plan' },
    { title: 'Execute' },
    { title: 'Audit' },
  ],
}

// Задачу можно передать через args (строкой или {task}); иначе берём из CHECKLIST.md.
const TASK =
  typeof args === 'string'
    ? args
    : (args && args.task) || 'См. CHECKLIST.md в корне проекта — выполни задачу из раздела «Задача».'

const CHECKLIST_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'title', 'kind'],
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          kind: { type: 'string', enum: ['code', 'skill', 'agent', 'test', 'docs', 'other'] },
        },
      },
    },
  },
}

const VERDICT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['done', 'summary'],
  properties: {
    done: { type: 'boolean' },
    summary: { type: 'string' },
    followups: { type: 'array', items: { type: 'string' } },
  },
}

phase('Plan')
const plan = await agent(
  `Ты — ведущий-планировщик команды агентов. Задача:\n${TASK}\n\n` +
    `Разбей её на атомарные проверяемые пункты чек-листа (не более 12). ` +
    `Для каждого укажи kind: code/skill/agent/test/docs/other. ` +
    `id — короткий (T1, T2, ...).`,
  { schema: CHECKLIST_SCHEMA, phase: 'Plan' }
)
log(`План составлен: ${plan.items.length} пунктов`)

const MAX_ROUNDS = 3
let pending = plan.items
const confirmed = []

for (let round = 1; round <= MAX_ROUNDS && pending.length; round++) {
  log(`Раунд ${round}/${MAX_ROUNDS}: в работе ${pending.length} пунктов`)

  const results = await pipeline(
    pending,
    // Стадия 1 — исполнение пункта
    (item) =>
      agent(
        `Ты — исполнитель команды. Выполни ОДИН пункт полностью.\n` +
          `id=${item.id}\nЗадача: ${item.title}\nТип: ${item.kind}\n\n` +
          `Если kind=skill — создай скилл в .claude/skills/<name>/SKILL.md.\n` +
          `Если kind=agent — создай агента в .claude/agents/<name>.md.\n` +
          `Если kind=code — внеси изменения в код.\n` +
          `Верни краткий отчёт: что сделано и какие файлы затронуты (с путями).`,
        { label: `do:${item.id}`, phase: 'Execute', agentType: 'implementer' }
      ).then((report) => ({ item, report })),
    // Стадия 2 — тест + ревью, вердикт
    (prev, item) =>
      agent(
        `Ты — тестировщик и приёмщик. Проверь, выполнен ли пункт.\n` +
          `Пункт: ${item.title}\nОтчёт исполнителя:\n${prev.report}\n\n` +
          `Запусти тесты/линт, если применимо, и посмотри изменения. ` +
          `done=true только если пункт реально закрыт; иначе перечисли followups.`,
        { label: `audit:${item.id}`, phase: 'Audit', schema: VERDICT_SCHEMA }
      ).then((v) => ({ ...v, item }))
  )

  const valid = results.filter(Boolean)
  confirmed.push(...valid.filter((v) => v.done))
  pending = valid.filter((v) => !v.done).map((v) => v.item)
}

return {
  task: TASK,
  done: confirmed.map((c) => ({ id: c.item.id, title: c.item.title, summary: c.summary })),
  unfinished: pending.map((i) => ({ id: i.id, title: i.title })),
}
