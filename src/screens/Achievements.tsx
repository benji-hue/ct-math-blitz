import { motion } from 'motion/react'
import { Award, Flame, Lock } from 'lucide-react'
import { ACHIEVEMENTS, levelFromXp, liveStreak } from '../lib/analytics'
import { useStore } from '../lib/store'
import { Header } from '../ui/chrome'
import { Bar, Card, Counter } from '../ui/kit'
import { springSoft } from '../ui/motion'
import { cx } from '../lib/cx'

export default function AchievementsScreen() {
  const progress = useStore((s) => s.progress)
  const level = levelFromXp(progress.xp)
  const streak = liveStreak(progress)

  return (
    <div>
      <Header title="Достижения" />
      <div className="mb-4 grid grid-cols-2 gap-2.5">
        <Card glow="#ff8a3d">
          <Flame size={22} className="text-[#ff8a3d]" fill="currentColor" />
          <Counter value={streak} className="mt-2 block text-[32px] leading-none font-extrabold text-fg" />
          <p className="mt-1 text-[12.5px] text-muted">дней подряд · рекорд {progress.streak.best}</p>
        </Card>
        <Card glow="#a497ff">
          <Award size={22} className="text-accent" />
          <p className="mt-2 text-[32px] leading-none font-extrabold text-fg">{level.level}</p>
          <p className="mt-1 text-[12.5px] text-muted">уровень</p>
          <Bar value={level.into / level.need} className="mt-2" height={4} />
        </Card>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        {Object.entries(ACHIEVEMENTS).map(([id, a], i) => {
          const got = progress.achievements.includes(id)
          return (
            <motion.div key={id} initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={{ ...springSoft, delay: i * 0.04 }}>
              <Card className={cx('h-full text-center', !got && 'opacity-55')}>
                <span
                  className={cx('mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-2xl', got ? 'text-white' : 'bg-surface-2 text-faint')}
                  style={got ? { background: 'var(--c-warn)' } : undefined}
                >
                  {got ? <Award size={26} /> : <Lock size={22} />}
                </span>
                <p className="text-[14px] font-semibold text-fg">{a.title}</p>
                <p className="mt-0.5 text-[12px] leading-snug text-muted">{a.description}</p>
              </Card>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
