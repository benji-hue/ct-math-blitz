import { useEffect, useState } from 'react'
import type { Category, RuntimeQuestion } from './types'
import { buildRound, prepare } from './lib/questions'
import {
  buildMistakeRound,
  clearProgress,
  EMPTY_PROGRESS,
  finishRound,
  loadProgress,
  mistakeBankIds,
  recordAnswer,
  saveProgress,
  type Progress,
} from './lib/storage'
import { GameScreen, type RoundSummary } from './components/GameScreen'
import { HomeScreen } from './components/HomeScreen'
import { ResultScreen } from './components/ResultScreen'
import { FormulaBook } from './components/FormulaBook'
import { AiTestScreen } from './components/AiTestScreen'

type Screen = 'home' | 'game' | 'result' | 'book' | 'aitest'

export default function App() {
  const [screen, setScreen] = useState<Screen>('home')
  const [progress, setProgress] = useState<Progress>(loadProgress)
  const [queue, setQueue] = useState<RuntimeQuestion[]>([])
  const [roundTitle, setRoundTitle] = useState('Скоростной блиц')
  const [roundNonce, setRoundNonce] = useState(0)
  const [summary, setSummary] = useState<RoundSummary | null>(null)
  const [isRecord, setIsRecord] = useState(false)
  const [aiFocusId, setAiFocusId] = useState<string | null>(null)
  const [lastConfig, setLastConfig] = useState<{ size: number; categories: Category[] }>({
    size: 12,
    categories: [],
  })

  useEffect(() => {
    saveProgress(progress)
  }, [progress])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [screen])

  function startBlitz(size: number, categories: Category[]) {
    const round = buildRound({
      size,
      categories: categories.length > 0 ? categories : null,
      mastered: progress.firstTry,
    })
    if (round.length === 0) return
    setLastConfig({ size, categories })
    setQueue(round)
    setRoundTitle('Скоростной блиц')
    setRoundNonce((n) => n + 1)
    setScreen('game')
  }

  function startMistakeRound() {
    const round = buildMistakeRound(progress, 12)
    if (round.length === 0) return
    setQueue(round)
    setRoundTitle('Работа над ошибками')
    setRoundNonce((n) => n + 1)
    setScreen('game')
  }

  function replayMistakes(s: RoundSummary) {
    if (s.mistakes.length === 0) return
    setQueue(s.mistakes.map((q) => prepare(q)))
    setRoundTitle('Работа над ошибками')
    setRoundNonce((n) => n + 1)
    setScreen('game')
  }

  function handleFinish(s: RoundSummary) {
    setIsRecord(s.score > progress.bestScore && s.score > 0)
    setProgress((p) => finishRound(p, s.score, s.bestStreak))
    setSummary(s)
    setScreen('result')
  }

  if (screen === 'game' && queue.length > 0) {
    return (
      <GameScreen
        key={roundNonce}
        initialQueue={queue}
        title={roundTitle}
        onAnswer={(id, correct) => setProgress((p) => recordAnswer(p, id, correct))}
        onFinish={handleFinish}
        onExit={() => setScreen('home')}
      />
    )
  }

  if (screen === 'result' && summary) {
    return (
      <ResultScreen
        summary={summary}
        isRecord={isRecord}
        onRestart={() => startBlitz(lastConfig.size, lastConfig.categories)}
        onReviewMistakes={() => replayMistakes(summary)}
        onOpenBook={() => setScreen('book')}
        onHome={() => setScreen('home')}
      />
    )
  }

  if (screen === 'aitest') {
    return (
      <AiTestScreen
        key={aiFocusId ?? 'free'}
        initialFocusId={aiFocusId}
        onBack={() => {
          setAiFocusId(null)
          setScreen('home')
        }}
      />
    )
  }

  if (screen === 'book') {
    return (
      <FormulaBook
        progress={progress}
        onBack={() => setScreen(summary ? 'result' : 'home')}
        onTestFormula={(id) => {
          setAiFocusId(id)
          setScreen('aitest')
        }}
      />
    )
  }

  return (
    <HomeScreen
      progress={progress}
      mistakeCount={mistakeBankIds(progress).length}
      onStart={startBlitz}
      onStartMistakes={startMistakeRound}
      onOpenBook={() => setScreen('book')}
      onOpenAiTest={() => {
        setAiFocusId(null)
        setScreen('aitest')
      }}
      onReset={() => {
        clearProgress()
        setProgress(EMPTY_PROGRESS)
        setSummary(null)
      }}
    />
  )
}
