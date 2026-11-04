import { useState, type CSSProperties } from 'react'
import {
  Bell,
  BookOpen,
  CalendarDays,
  Download,
  Feather,
  HeartPulse,
  Info,
  Moon,
  Presentation,
  RotateCcw,
  Share2,
  Smartphone,
  Sun,
  SunMoon,
  Target,
  Upload,
  Vibrate,
} from 'lucide-react'
import { APP_NAME, APP_VERSION, BOT_USERNAME } from '../config'
import { SUBJECT_LIST, SUBJECTS } from '../domain/subjects'
import type { SubjectId } from '../domain/types'
import { buildDemoState } from '../lib/demo'
import { enterDemo, exitDemo, normalizeState, snapshot, useStore, type Grade11 } from '../lib/store'
import { addToHomeScreen, canAddToHomeScreen, openTelegram, requestWriteAccess, telegramUser } from '../lib/telegram'
import { useNav } from '../nav/nav'
import { WRITE_ACCESS_KEY } from '../lib/reminders'
import { Sheet, toast } from '../ui/chrome'
import { Badge, Button, Card, Chip, Row, SectionTitle, Segmented, Stagger, StaggerItem, notify } from '../ui/kit'
import { AccountCard } from '../ui/Account'
import { SubjectIcon } from '../ui/SubjectIcon'
import { cx } from '../lib/cx'

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={cx('relative h-[30px] w-[50px] shrink-0 rounded-full transition-colors', on ? 'bg-good' : 'bg-line-strong')}
    >
      <span className={cx('absolute top-[3px] h-6 w-6 rounded-full bg-white shadow transition-transform', on ? 'translate-x-[23px]' : 'translate-x-[3px]')} />
    </button>
  )
}

const GRADES: { value: Grade11; label: string }[] = [
  { value: '11', label: '11 класс' },
  { value: 'grad', label: 'Выпускник прошлых лет' },
]

export default function ProfileScreen() {
  const profile = useStore((s) => s.profile)
  const settings = useStore((s) => s.settings)
  const demo = useStore((s) => s.demo)
  const updateProfile = useStore((s) => s.updateProfile)
  const updateSettings = useStore((s) => s.updateSettings)
  const resetAll = useStore((s) => s.resetAll)
  const replaceState = useStore((s) => s.replaceState)
  const push = useNav((s) => s.push)
  const [subjectsOpen, setSubjectsOpen] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const user = telegramUser()

  const exportData = () => {
    const blob = new Blob([JSON.stringify(snapshot(), null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `krok-progress-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    toast('Файл с прогрессом сохранён', 'success')
  }

  const importData = (file: File | undefined) => {
    if (!file) return
    file
      .text()
      .then((text) => {
        replaceState(normalizeState(JSON.parse(text)))
        toast('Прогресс восстановлен', 'success')
      })
      .catch(() => toast('Не похоже на файл прогресса', 'error'))
  }

  return (
    <Stagger className="space-y-4 pt-2">
      <StaggerItem className="flex items-center gap-3.5">
        {user?.photo_url ? (
          <img src={user.photo_url} alt="" className="h-16 w-16 rounded-full object-cover" />
        ) : (
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-[#7c6cff] to-[#3dd6f5] text-[26px] font-bold text-white">
            {(profile.name || 'Я').slice(0, 1).toUpperCase()}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[24px] font-extrabold tracking-[-0.02em] text-fg">{profile.name || 'Профиль'}</h1>
          <p className="text-[13.5px] text-muted">
            {profile.grade === 'grad' ? 'Выпускник' : `${profile.grade} класс`} · {profile.exam === 'both' ? 'ЦЭ и ЦТ' : profile.exam === 'ce' ? 'ЦЭ' : 'ЦТ'}
            {user?.username ? ` · @${user.username}` : ''}
          </p>
        </div>
        {demo && <Badge color="var(--c-warn)">демо</Badge>}
      </StaggerItem>

      {demo && (
        <StaggerItem>
          <Card glow="#ffc857" className="flex items-center gap-3">
            <Presentation size={22} className="shrink-0 text-warn" />
            <p className="flex-1 text-[13.5px] text-fg-2">Включён демо-профиль для показа. Твой настоящий прогресс сохранён и вернётся при выходе.</p>
            <Button size="sm" variant="secondary" onClick={() => exitDemo()}>
              Выйти
            </Button>
          </Card>
        </StaggerItem>
      )}

      {!demo && (
        <StaggerItem>
          <SectionTitle>Аккаунт</SectionTitle>
          <AccountCard />
        </StaggerItem>
      )}

      <StaggerItem>
        <SectionTitle>Экзамены</SectionTitle>
        <Card className="space-y-4">
          <div>
            <p className="mb-2 text-[13px] text-muted">Класс</p>
            <Segmented layoutId="grade" value={profile.grade} onChange={(grade) => updateProfile({ grade })} options={GRADES} />
          </div>
          <div>
            <p className="mb-2 text-[13px] text-muted">Что сдаю</p>
            <Segmented
              layoutId="exam"
              value={profile.exam}
              onChange={(exam) => updateProfile({ exam })}
              options={[
                { value: 'ce', label: 'ЦЭ' },
                { value: 'ct', label: 'ЦТ' },
                { value: 'both', label: 'ЦЭ + ЦТ' },
              ]}
            />
          </div>
          <Row
            icon={<Target size={19} className="text-accent" />}
            title="Предметы и цели"
            subtitle={profile.subjects.map((s) => `${SUBJECTS[s].short}${profile.targets[s] ? ` ${profile.targets[s]}` : ''}`).join(' · ') || 'не выбраны'}
            onClick={() => setSubjectsOpen(true)}
            className="!py-0"
          />
          <div>
            <p className="mb-2 text-[13px] text-muted">Цель дня: {profile.dailyGoal} заданий</p>
            <input
              type="range"
              min={5}
              max={60}
              step={5}
              value={profile.dailyGoal}
              onChange={(e) => updateProfile({ dailyGoal: Number(e.target.value) })}
              className="w-full accent-[var(--c-accent-solid)]"
              aria-label="Цель дня"
            />
          </div>
        </Card>
      </StaggerItem>

      <StaggerItem>
        <SectionTitle>Оформление и поведение</SectionTitle>
        <Card className="space-y-4">
          <Segmented
            layoutId="theme"
            value={settings.theme}
            onChange={(theme) => updateSettings({ theme })}
            options={[
              { value: 'auto', label: <span className="inline-flex items-center gap-1"><SunMoon size={14} /> Авто</span> },
              { value: 'light', label: <span className="inline-flex items-center gap-1"><Sun size={14} /> Светлая</span> },
              { value: 'dark', label: <span className="inline-flex items-center gap-1"><Moon size={14} /> Тёмная</span> },
            ]}
          />
          <div>
            <div className="mb-2 flex items-start gap-3">
              <Feather size={19} className="mt-0.5 shrink-0 text-accent" />
              <div className="flex-1">
                <p className="text-[15px] text-fg">Лёгкий режим</p>
                <p className="text-[12.5px] leading-snug text-muted">Без размытия фона — для слабых телефонов. «Авто» включает его сам.</p>
              </div>
            </div>
            <Segmented
              layoutId="lite"
              value={settings.lite}
              onChange={(lite) => updateSettings({ lite })}
              options={[
                { value: 'auto', label: 'Авто' },
                { value: 'on', label: 'Включён' },
                { value: 'off', label: 'Выключен' },
              ]}
            />
          </div>
          <div className="flex items-center gap-3">
            <Vibrate size={19} className="text-accent" />
            <p className="flex-1 text-[15px] text-fg">Тактильный отклик</p>
            <Toggle label="Тактильный отклик" on={settings.haptics} onChange={(haptics) => updateSettings({ haptics })} />
          </div>
          <div className="flex items-center gap-3">
            <Bell size={19} className="text-accent" />
            <div className="flex-1">
              <p className="text-[15px] text-fg">Напоминания в боте</p>
              <p className="text-[12.5px] text-muted">Только если сегодня ещё не занимался · в {settings.remindHour}:00</p>
            </div>
            <Toggle
              label="Напоминания"
              on={settings.reminders}
              onChange={async (reminders) => {
                updateSettings({ reminders })
                if (reminders) {
                  const ok = await requestWriteAccess()
                  if (ok) {
                    try {
                      localStorage.setItem(WRITE_ACCESS_KEY, '1')
                    } catch {
                      // ignore
                    }
                    toast('Бот сможет напомнить о занятиях', 'success')
                  }
                }
              }}
            />
          </div>
          {settings.reminders && (
            <div className="flex flex-wrap gap-1.5 pl-8">
              {[8, 15, 17, 18, 19, 20, 21].map((h) => (
                <Chip key={h} active={settings.remindHour === h} onClick={() => updateSettings({ remindHour: h })}>
                  {h}:00
                </Chip>
              ))}
            </div>
          )}
        </Card>
      </StaggerItem>

      <StaggerItem>
        <SectionTitle>Полезное</SectionTitle>
        <Card padded={false} className="divide-y divide-line px-4">
          <Row icon={<CalendarDays size={19} className="text-accent" />} title="Календарь ЦЭ, ЦТ и РТ" onClick={() => push({ name: 'calendar' })} />
          <Row icon={<BookOpen size={19} className="text-accent" />} title="Библиотека: учебники и тесты" onClick={() => push({ name: 'library' })} />
          <Row icon={<HeartPulse size={19} className="text-accent" />} title="Антистресс перед экзаменом" onClick={() => push({ name: 'calm' })} />
          {canAddToHomeScreen() && <Row icon={<Smartphone size={19} className="text-accent" />} title="Добавить на экран «Домой»" onClick={addToHomeScreen} />}
          {BOT_USERNAME && (
            <Row
              icon={<Share2 size={19} className="text-accent" />}
              title="Пригласить друга"
              onClick={() =>
                openTelegram(`https://t.me/share/url?url=${encodeURIComponent(`https://t.me/${BOT_USERNAME}`)}&text=${encodeURIComponent('Готовлюсь к ЦТ и ЦЭ с ИИ-репетитором — присоединяйся!')}`)
              }
            />
          )}
        </Card>
      </StaggerItem>

      <StaggerItem>
        <SectionTitle>Данные</SectionTitle>
        <Card padded={false} className="divide-y divide-line px-4">
          <Row icon={<Download size={19} className="text-accent" />} title="Сохранить прогресс в файл" onClick={exportData} />
          <label className="flex w-full cursor-pointer items-center gap-3 py-2.5">
            <Upload size={19} className="text-accent" />
            <span className="flex-1 text-[15px] font-medium text-fg">Восстановить из файла</span>
            <input type="file" accept="application/json,.json" className="hidden" onChange={(e) => importData(e.target.files?.[0])} />
          </label>
          {!demo && (
            <Row
              icon={<Presentation size={19} className="text-accent" />}
              title="Демо-профиль для показа"
              subtitle="Заполненная статистика — для защиты проекта"
              onClick={() =>
                buildDemoState().then((s) => {
                  enterDemo(s)
                  notify('success')
                })
              }
            />
          )}
          <Row icon={<RotateCcw size={19} className="text-bad" />} title={<span className="text-bad">Сбросить всё</span>} onClick={() => setResetOpen(true)} />
        </Card>
        <p className="mt-2 px-1 text-[12px] leading-relaxed text-muted">
          Прогресс хранится на устройстве и в облаке Telegram (CloudStorage) — доступен с любого твоего устройства. Сервер знает только Telegram ID, имя и настройки напоминаний — для лимитов ИИ и уведомлений.
        </p>
      </StaggerItem>

      <StaggerItem>
        <Card className="flex items-center gap-3">
          <Info size={19} className="text-muted" />
          <p className="flex-1 text-[12.5px] leading-relaxed text-muted">
            {APP_NAME} {APP_VERSION}. Даты и структура тестов — по документам Минобразования и РИКЗ; всегда сверяйтесь с первоисточником.
          </p>
        </Card>
      </StaggerItem>

      <Sheet open={subjectsOpen} onClose={() => setSubjectsOpen(false)} title="Предметы и цели">
        <div className="space-y-2 pb-2">
          {SUBJECT_LIST.map((s) => {
            const active = profile.subjects.includes(s.id)
            return (
              <div key={s.id} className={cx('glass rounded-2xl p-3', active && 'ring-2')} style={active ? ({ '--tw-ring-color': s.color } as CSSProperties) : undefined}>
                <button
                  type="button"
                  onClick={() => updateProfile({ subjects: active ? profile.subjects.filter((x) => x !== s.id) : [...profile.subjects, s.id as SubjectId] })}
                  className="flex w-full items-center gap-2.5 text-left"
                >
                  <SubjectIcon id={s.id} size={30} />
                  <span className="flex-1 text-[14.5px] font-semibold text-fg">{s.short}</span>
                  <span className="text-[13px] text-muted">{active ? `цель ${profile.targets[s.id] ?? 80}` : 'добавить'}</span>
                </button>
                {active && (
                  <input
                    type="range"
                    min={30}
                    max={100}
                    step={5}
                    value={profile.targets[s.id] ?? 80}
                    onChange={(e) => updateProfile({ targets: { ...profile.targets, [s.id]: Number(e.target.value) } })}
                    className="mt-2 w-full"
                    style={{ accentColor: s.color }}
                    aria-label={`Цель ${s.short}`}
                  />
                )}
              </div>
            )
          })}
        </div>
      </Sheet>

      <Sheet open={resetOpen} onClose={() => setResetOpen(false)} title="Сбросить весь прогресс?">
        <p className="mb-4 text-[14.5px] text-fg-2">Удалятся ответы, повторения, достижения и чат на этом устройстве. Действие нельзя отменить — сначала сохраните файл.</p>
        <div className="space-y-2">
          <Button
            block
            variant="danger"
            onClick={() => {
              resetAll()
              setResetOpen(false)
            }}
          >
            Сбросить
          </Button>
          <Button block variant="secondary" onClick={() => setResetOpen(false)}>
            Отмена
          </Button>
        </div>
      </Sheet>
    </Stagger>
  )
}
