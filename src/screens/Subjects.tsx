import { useState } from 'react'
import { useSubjects } from '../content'
import { GROUP_LABEL, SUBJECT_LIST, SUBJECTS } from '../domain/subjects'
import type { SubjectId } from '../domain/types'
import { forecast, subjectMastery } from '../lib/analytics'
import { useStore } from '../lib/store'
import { useNav } from '../nav/nav'
import { Card, ProgressRing, Segmented, Stagger, StaggerItem } from '../ui/kit'
import { SubjectIcon } from '../ui/SubjectIcon'

export function SubjectsScreen() {
  const mine = useStore((s) => s.profile.subjects)
  const progress = useStore((s) => s.progress)
  const targets = useStore((s) => s.profile.targets)
  const push = useNav((s) => s.push)
  const [filter, setFilter] = useState<'mine' | 'all'>(mine.length ? 'mine' : 'all')
  const contents = useSubjects(mine)

  const list = filter === 'mine' ? SUBJECT_LIST.filter((s) => mine.includes(s.id)) : SUBJECT_LIST
  const groups = (['core', 'stem', 'humanities', 'foreign'] as const)
    .map((g) => ({ g, items: list.filter((s) => s.group === g) }))
    .filter((x) => x.items.length)

  return (
    <div className="pt-2">
      <h1 className="mb-1 text-[30px] leading-tight font-extrabold tracking-[-0.03em] text-fg">Предметы</h1>
      <p className="mb-4 text-[14px] text-muted">14 предметов ЦЭ и ЦТ · спецификации РИКЗ</p>
      <Segmented
        layoutId="subjects-filter"
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'mine', label: `Мои · ${mine.length}` },
          { value: 'all', label: 'Все' },
        ]}
        className="mb-5"
      />

      <Stagger key={filter} className="space-y-5">
        {groups.map(({ g, items }) => (
          <StaggerItem key={g}>
            <p className="eyebrow mb-2 px-1">{GROUP_LABEL[g]}</p>
            <div className="grid grid-cols-2 gap-2.5">
              {items.map((s) => {
                const content = contents[s.id as SubjectId]
                const isMine = mine.includes(s.id)
                const mastery = content ? subjectMastery(content, progress) : 0
                const fc = content && isMine ? forecast(s.id, content, progress) : null
                return (
                  <Card key={s.id} glow={s.color} interactive onClick={() => push({ name: 'subject', id: s.id })} className="flex min-h-[132px] flex-col !p-3.5">
                    <div className="flex items-start justify-between">
                      <SubjectIcon id={s.id} size={42} />
                      {isMine && content && (
                        <ProgressRing value={mastery} size={34} stroke={4} color={s.color}>
                          <span className="tabular text-[9.5px] font-bold text-fg-2">{Math.round(mastery * 100)}</span>
                        </ProgressRing>
                      )}
                    </div>
                    <p className="mt-auto pt-3 text-[15px] leading-tight font-semibold text-fg">{SUBJECTS[s.id].short}</p>
                    <p className="mt-0.5 text-[12px] text-muted">
                      {fc && fc.basis > 0
                        ? `прогноз ${fc.score}${targets[s.id] ? ` / цель ${targets[s.id]}` : ''}`
                        : `${s.format.tasks} заданий · ${s.format.minutes} мин`}
                    </p>
                  </Card>
                )
              })}
            </div>
          </StaggerItem>
        ))}
      </Stagger>
    </div>
  )
}
