import { useEffect, useState } from 'react'
import { Cloud, ExternalLink, LogIn, LogOut, Send } from 'lucide-react'
import { BOT_USERNAME } from '../config'
import { logout, openOnSite, startLogin, useAccount, waitForLogin, type AccountUser, type LoginRequest } from '../lib/account'
import { pullFromServer } from '../lib/sync'
import { telegramUser } from '../lib/telegram'
import { Sheet, toast } from './chrome'
import { Button, Card, notify, Skeleton } from './kit'

/**
 * Вход на сайте через Telegram: код на экране → бот → «Да, это я».
 * Состояние живёт внутри потока и создаётся заново при каждом открытии шторки.
 */
function LoginFlow({ onDone, onRetry }: { onDone: (user: AccountUser) => void; onRetry: () => void }) {
  const [request, setRequest] = useState<LoginRequest | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    startLogin()
      .then((r) => {
        if (controller.signal.aborted) return null
        setRequest(r)
        return waitForLogin(r.nonce, controller.signal)
      })
      .then(async (user) => {
        if (!user) return
        // Прогресс из аккаунта — сразу, не дожидаясь следующей синхронизации.
        const result = await pullFromServer({ preferServer: true }).catch(() => 'unavailable' as const)
        notify('success')
        toast(result === 'restored' ? `Вход выполнен — прогресс подтянут из аккаунта` : `Вход выполнен: ${user.first_name || 'Telegram'}`, 'success')
        onDone(user)
      })
      .catch((e: Error) => {
        if (e.name !== 'AbortError') setError(e.message)
      })
    return () => controller.abort()
    // Поток запускается один раз на открытие шторки.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (error) {
    return (
      <div className="space-y-3">
        <p className="text-[14.5px] leading-relaxed text-bad">{error}</p>
        <Button block onClick={onRetry}>
          Попробовать ещё раз
        </Button>
      </div>
    )
  }
  if (!request) {
    return (
      <div className="space-y-3 py-2">
        <Skeleton className="mx-auto h-12 w-40" />
        <Skeleton className="h-12 w-full" />
      </div>
    )
  }
  return (
    <div className="space-y-4">
      <p className="text-[14.5px] leading-relaxed text-fg-2">
        Открой бота и нажми <b className="text-fg">«Да, это я»</b>. Бот покажет этот же код — так никто не войдёт в твой аккаунт чужой ссылкой.
      </p>
      <p className="tabular text-center text-[40px] font-extrabold tracking-[0.3em] text-fg" aria-label={`Код ${request.code}`}>
        {request.code}
      </p>
      <a
        href={request.link}
        target="_blank"
        rel="noopener noreferrer"
        className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-accent-solid text-[16px] font-semibold text-on-accent"
      >
        <Send size={18} /> Открыть бота
      </a>
      <p className="flex items-center justify-center gap-2 text-[13px] text-muted">
        <span className="h-2 w-2 animate-pulse rounded-full bg-accent" /> Жду подтверждения в боте…
      </p>
      <p className="text-center text-[12px] leading-relaxed text-faint">Код действует 10 минут. Бот — @{BOT_USERNAME}.</p>
    </div>
  )
}

export function LoginSheet({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone?: (user: AccountUser) => void }) {
  const [attempt, setAttempt] = useState(0)
  return (
    <Sheet open={open} onClose={onClose} title="Вход через Telegram">
      {open && (
        <LoginFlow
          key={attempt}
          onRetry={() => setAttempt((n) => n + 1)}
          onDone={(user) => {
            onDone?.(user)
            onClose()
          }}
        />
      )}
    </Sheet>
  )
}

/** Блок «Аккаунт» в профиле: в Telegram — кто ты, на сайте — вход и выход. */
export function AccountCard() {
  const siteUser = useAccount((s) => s.user)
  const tg = telegramUser()
  const [login, setLogin] = useState(false)
  const [opening, setOpening] = useState(false)

  if (tg) {
    return (
      <Card className="space-y-3">
        <div className="flex items-start gap-3">
          <Cloud size={20} className="mt-0.5 shrink-0 text-accent" />
          <p className="text-[13.5px] leading-relaxed text-fg-2">
            Аккаунт Telegram{tg.username ? ` @${tg.username}` : ''}: прогресс сохраняется в нём и общий с сайтом в браузере.
          </p>
        </div>
        <Button
          block
          variant="secondary"
          icon={<ExternalLink size={17} />}
          loading={opening}
          onClick={() => {
            setOpening(true)
            openOnSite()
              .catch((e: Error) => toast(e.message, 'error'))
              .finally(() => setOpening(false))
          }}
        >
          Открыть в браузере — тот же прогресс
        </Button>
      </Card>
    )
  }
  if (siteUser) {
    return (
      <Card className="flex items-center gap-3">
        <Cloud size={20} className="shrink-0 text-good" />
        <p className="min-w-0 flex-1 text-[13.5px] leading-relaxed text-fg-2">
          Вход через Telegram: <b className="text-fg">{siteUser.first_name || 'аккаунт'}</b>
          {siteUser.username ? ` (@${siteUser.username})` : ''}. Прогресс общий с ботом.
        </p>
        <Button
          size="sm"
          variant="secondary"
          icon={<LogOut size={15} />}
          onClick={() => {
            logout().then(() => toast('Ты вышел из аккаунта. Прогресс остался в нём.'))
          }}
        >
          Выйти
        </Button>
      </Card>
    )
  }
  return (
    <Card className="space-y-3">
      <p className="text-[13.5px] leading-relaxed text-fg-2">
        Сейчас прогресс хранится только в этом браузере. Войди через Telegram — он сохранится в твоём аккаунте и будет общим с ботом и другими устройствами.
      </p>
      <Button block icon={<LogIn size={18} />} onClick={() => setLogin(true)}>
        Войти через Telegram
      </Button>
      <LoginSheet open={login} onClose={() => setLogin(false)} />
    </Card>
  )
}
