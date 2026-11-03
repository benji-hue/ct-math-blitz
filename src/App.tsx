import { AnimatePresence, MotionConfig, motion, type Variants } from 'motion/react'
import { lazy, Suspense, useEffect, type ReactNode } from 'react'
import { preloadSubjects } from './content'
import { useStore } from './lib/store'
import { startCloudSync } from './lib/sync'
import { onTelegramReady, setBackButton, telegramUser } from './lib/telegram'
import { useThemeSync } from './lib/theme'
import { useReminderSync } from './lib/reminders'
import { currentEntry, IMMERSIVE, useNav, type StackEntry } from './nav/nav'
import { TabBar } from './nav/TabBar'
import { Aurora, Screen, Toasts, useUi } from './ui/chrome'
import { Skeleton } from './ui/kit'
import { spring } from './ui/motion'
import { TodayScreen } from './screens/Today'
import { SubjectsScreen } from './screens/Subjects'
import { SubjectScreen } from './screens/Subject'
import { TopicScreen } from './screens/Topic'
import { Onboarding } from './screens/Onboarding'

const TutorScreen = lazy(() => import('./screens/Tutor'))
const ProgressScreen = lazy(() => import('./screens/Progress'))
const ProfileScreen = lazy(() => import('./screens/Profile'))
const PracticeScreen = lazy(() => import('./screens/Practice'))
const MockScreen = lazy(() => import('./screens/Mock'))
const LibraryScreen = lazy(() => import('./screens/Library'))
const CalendarScreen = lazy(() => import('./screens/Calendar'))
const CalmScreen = lazy(() => import('./screens/Calm'))
const BlitzScreen = lazy(() => import('./screens/Blitz'))
const GenerateScreen = lazy(() => import('./screens/Generate'))
const SelfTestScreen = lazy(() => import('./screens/SelfTest'))
const AnalysisScreen = lazy(() => import('./screens/Analysis'))
const AchievementsScreen = lazy(() => import('./screens/Achievements'))

function Loading() {
  return (
    <div className="space-y-3 pt-4">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-28 w-full rounded-[22px]" />
      <Skeleton className="h-20 w-full rounded-[22px]" />
    </div>
  )
}

function renderRoute(entry: StackEntry): ReactNode {
  const r = entry.route
  switch (r.name) {
    case 'today':
      return <TodayScreen />
    case 'subjects':
      return <SubjectsScreen />
    case 'tutor':
      return <TutorScreen />
    case 'progress':
      return <ProgressScreen />
    case 'profile':
      return <ProfileScreen />
    case 'subject':
      return <SubjectScreen id={r.id} />
    case 'topic':
      return <TopicScreen subject={r.subject} topicId={r.topicId} />
    case 'practice':
      return <PracticeScreen {...r} routeKey={entry.key} />
    case 'mock':
      return <MockScreen subject={r.subject} />
    case 'library':
      return <LibraryScreen subject={r.subject} />
    case 'calendar':
      return <CalendarScreen />
    case 'calm':
      return <CalmScreen />
    case 'blitz':
      return <BlitzScreen />
    case 'generate':
      return <GenerateScreen subject={r.subject} topicId={r.topicId} />
    case 'selftest':
      return <SelfTestScreen subject={r.subject} topic={r.topic} topicId={r.topicId ?? null} />
    case 'analysis':
      return <AnalysisScreen />
    case 'achievements':
      return <AchievementsScreen />
  }
}

const variants: Variants = {
  enter: (dir: number) => (dir === 0 ? { opacity: 0, scale: 0.985 } : { x: dir > 0 ? '42%' : '-24%', opacity: dir > 0 ? 0 : 0.5 }),
  center: { x: 0, opacity: 1, scale: 1 },
  exit: (dir: number) => (dir === 0 ? { opacity: 0, scale: 1.01 } : { x: dir > 0 ? '-24%' : '42%', opacity: 0 }),
}

function Navigator() {
  const tab = useNav((s) => s.tab)
  const stacks = useNav((s) => s.stacks)
  const direction = useNav((s) => s.direction)
  const back = useNav((s) => s.back)
  const entry = currentEntry({ ...useNav.getState(), tab, stacks })
  const depth = stacks[tab].length
  const immersive = IMMERSIVE.has(entry.route.name)
  const keyboard = useUi((s) => s.keyboard)

  useEffect(() => {
    setBackButton(depth > 1 ? back : null)
  }, [depth, back, entry.key])

  return (
    <>
      <div className="fixed inset-0 z-10 overflow-hidden">
        <AnimatePresence initial={false} custom={direction} mode="popLayout">
          <motion.div
            key={entry.key}
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={spring}
            className="absolute inset-0"
          >
            <Screen routeKey={entry.key} immersive={immersive}>
              <Suspense fallback={<Loading />}>{renderRoute(entry)}</Suspense>
            </Screen>
          </motion.div>
        </AnimatePresence>
      </div>
      <TabBar hidden={immersive || keyboard} />
    </>
  )
}

export default function App() {
  useThemeSync()
  useReminderSync()
  const onboarded = useStore((s) => s.profile.onboarded)
  const subjects = useStore((s) => s.profile.subjects)

  useEffect(() => {
    let stop: (() => void) | undefined
    const off = onTelegramReady(() => {
      stop = startCloudSync()
      const user = telegramUser()
      const { profile, updateProfile } = useStore.getState()
      if (user && !profile.name) updateProfile({ name: user.first_name })
    })
    return () => {
      off()
      stop?.()
    }
  }, [])

  useEffect(() => {
    preloadSubjects(subjects)
  }, [subjects])

  return (
    <MotionConfig reducedMotion="user">
      <Aurora />
      <AnimatePresence mode="wait" initial={false}>
        {onboarded ? (
          <motion.div key="app" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.35 }}>
            <Navigator />
          </motion.div>
        ) : (
          <motion.div key="onboarding" exit={{ opacity: 0, scale: 0.98 }} transition={{ duration: 0.3 }}>
            <Onboarding />
          </motion.div>
        )}
      </AnimatePresence>
      <Toasts />
    </MotionConfig>
  )
}
