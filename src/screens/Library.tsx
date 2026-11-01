import { useState } from 'react'
import { ArrowUpRight, BookOpen, FileText, LineChart, Library as LibraryIcon, ListChecks } from 'lucide-react'
import { SUBJECTS } from '../domain/subjects'
import { PRINTED_COLLECTIONS, SOURCE_KIND_LABEL, SOURCES, sourcesFor, type SourceKind } from '../domain/sources'
import type { SubjectId } from '../domain/types'
import { openExternal } from '../lib/telegram'
import { Header } from '../ui/chrome'
import { Card, Chip, Stagger, StaggerItem, tap } from '../ui/kit'

const KIND_ICON: Record<SourceKind, typeof BookOpen> = {
  official: FileText,
  textbook: BookOpen,
  tests: ListChecks,
  stats: LineChart,
}

export default function LibraryScreen({ subject }: { subject?: SubjectId }) {
  const [kind, setKind] = useState<SourceKind | 'all'>('all')
  const base = subject ? sourcesFor(subject) : SOURCES
  const list = kind === 'all' ? base : base.filter((s) => s.kind === kind)

  return (
    <div>
      <Header title="Библиотека" subtitle={subject ? SUBJECTS[subject].title : 'Официальные и открытые источники'} />
      <div className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4">
        <Chip active={kind === 'all'} onClick={() => setKind('all')}>
          Все
        </Chip>
        {(Object.keys(SOURCE_KIND_LABEL) as SourceKind[]).map((k) => (
          <Chip key={k} active={kind === k} onClick={() => setKind(k)}>
            {SOURCE_KIND_LABEL[k]}
          </Chip>
        ))}
      </div>

      <Stagger key={kind} className="space-y-2.5">
        {list.map((s) => {
          const Icon = KIND_ICON[s.kind]
          return (
            <StaggerItem key={s.id}>
              <Card
                interactive
                onClick={() => {
                  tap()
                  openExternal(s.url)
                }}
                className="flex items-start gap-3"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-solid/12 text-accent">
                  <Icon size={19} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] leading-snug font-semibold text-fg">{s.title}</p>
                  <p className="mt-0.5 text-[13px] leading-snug text-muted">{s.description}</p>
                  <p className="mt-1.5 truncate text-[11.5px] text-faint">{new URL(s.url).hostname}</p>
                </div>
                <ArrowUpRight size={18} className="mt-0.5 shrink-0 text-faint" />
              </Card>
            </StaggerItem>
          )
        })}
        <StaggerItem>
          <Card className="flex gap-3">
            <LibraryIcon size={20} className="mt-0.5 shrink-0 text-warn" />
            <p className="text-[13.5px] leading-relaxed text-fg-2">{PRINTED_COLLECTIONS}</p>
          </Card>
        </StaggerItem>
      </Stagger>
    </div>
  )
}
