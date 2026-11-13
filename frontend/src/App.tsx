import { useState } from 'react'
import type { FormEvent } from 'react'
import { Activity, Eye, EyeOff, ShieldCheck } from 'lucide-react'
import './App.css'
import BraceletsPage from './pages/BraceletsPage'

const API_URL = (
  import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8085'
).replace(/\/$/, '')

type User = {
  id: number
  name: string
  email: string
}

function App() {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [user, setUser] = useState<User | null>(null)
  const [accessToken, setAccessToken] = useState('')

  const isRegister = mode === 'register'

  function switchMode() {
    setMode((current) => (current === 'login' ? 'register' : 'login'))
    setPassword('')
    setConfirmPassword('')
    setShowPassword(false)
    setError('')
    setSuccess('')
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (loading) return

    setError('')
    setSuccess('')

    if (isRegister) {
      if (!name.trim()) {
        setError('Введи имя.')
        return
      }

      if (password.length < 8) {
        setError('Пароль должен содержать минимум 8 символов.')
        return
      }

      if (password !== confirmPassword) {
        setError('Пароли не совпадают.')
        return
      }
    }

    setLoading(true)

    try {
      if (isRegister) {
        const response = await fetch(`${API_URL}/auth/register`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: name.trim(),
            email: email.trim(),
            password,
          }),
        })

        if (!response.ok) {
          if (response.status === 409) {
            throw new Error(
              'Аккаунт с этим email уже существует. Перейди ко входу.',
            )
          }

          if (response.status === 422) {
            throw new Error(
              'Проверь имя, формат email и требования к паролю.',
            )
          }

          const body = await response.json().catch(() => null)

          throw new Error(
            typeof body?.detail === 'string'
              ? body.detail
              : `Ошибка регистрации. Код: ${response.status}`,
          )
        }

        setMode('login')
        setPassword('')
        setConfirmPassword('')
        setShowPassword(false)
        setSuccess('Аккаунт создан! Введи пароль, чтобы войти.')
        return
      }

      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email.trim(),
          password,
        }),
      })

      if (!response.ok) {
        if (response.status === 401 || response.status === 400) {
          throw new Error('Неверный email или пароль.')
        }

        if (response.status === 422) {
          throw new Error('Проверь формат email и заполнение пароля.')
        }

        throw new Error(`Ошибка входа. Код: ${response.status}`)
      }

      const tokenData = await response.json()

      if (
        typeof tokenData.access_token !== 'string' ||
        !tokenData.access_token
      ) {
        throw new Error('Сервер не вернул токен доступа.')
      }

      const profileResponse = await fetch(`${API_URL}/auth/me`, {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
        },
      })

      if (!profileResponse.ok) {
        throw new Error('Не удалось получить профиль пользователя.')
      }

      const profile: User = await profileResponse.json()

      setAccessToken(tokenData.access_token)
      setUser(profile)
      setPassword('')
      setConfirmPassword('')
      setShowPassword(false)
    } catch (err) {
      setError(
        err instanceof TypeError
          ? 'Нет соединения с API. Проверь запуск backend, адрес и настройку CORS.'
          : err instanceof Error
            ? err.message
            : 'Не удалось выполнить запрос.',
      )
    } finally {
      setLoading(false)
    }
  }

  if (user && accessToken) {
    return (
      <BraceletsPage
        token={accessToken}
        userName={user.name}
        onLogout={() => {
          setUser(null)
          setAccessToken('')
          setPassword('')
          setConfirmPassword('')
          setShowPassword(false)
          setError('')
          setSuccess('')
          setMode('login')
        }}
      />
    )
  }

  return (
    <main className="auth-page">
      <section className="brand-panel">
        <a className="brand" href="/">
          <span className="brand-icon">
            <Activity size={25} />
          </span>
          SmartHealth<span className="brand-dot">.</span>
        </a>

        <div className="brand-content">
          <span className="eyebrow">
            УМНЫЙ БРАСЛЕТ · ЛИЧНЫЙ КАБИНЕТ
          </span>

          <h1>
            Ближе,
            <br />
            даже на расстоянии.
          </h1>

          <p className="brand-description">
            Показатели браслета, местоположение и важные уведомления —
            в одном приложении.
          </p>

          <div className="feature-list">
            <span>01 — Пульс и SpO₂</span>
            <span>02 — Безопасная зона</span>
            <span>03 — История и уведомления</span>
          </div>
        </div>

        <p className="brand-footer">
          Технологии, которые помогают заботиться.
        </p>
      </section>

      <section className="form-panel">
        <div className="login-card">
          <span className="form-label">ЛИЧНЫЙ КАБИНЕТ</span>

          <h2>
            {isRegister ? 'Создать аккаунт' : 'С возвращением'}
          </h2>

          <p className="form-description">
            {isRegister
              ? 'Зарегистрируйся, чтобы управлять своими браслетами.'
              : 'Войди, чтобы открыть данные своих браслетов.'}
          </p>

          <form onSubmit={handleSubmit}>
            {isRegister && (
              <>
                <label htmlFor="name">Имя</label>
                <input
                  id="name"
                  type="text"
                  placeholder="Как тебя зовут?"
                  autoComplete="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  disabled={loading}
                  required
                />
              </>
            )}

            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              placeholder="name@example.com"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={loading}
              required
            />

            <label htmlFor="password">Пароль</label>
            <div className="password-field">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder={
                  isRegister ? 'Минимум 8 символов' : 'Введи свой пароль'
                }
                autoComplete={
                  isRegister ? 'new-password' : 'current-password'
                }
                minLength={isRegister ? 8 : undefined}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={loading}
                required
              />

              <button
                className="password-toggle"
                type="button"
                aria-label={
                  showPassword ? 'Скрыть пароль' : 'Показать пароль'
                }
                aria-pressed={showPassword}
                onClick={() => setShowPassword((current) => !current)}
                disabled={loading}
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>

            {isRegister && (
              <>
                <label htmlFor="confirm-password">
                  Повтори пароль
                </label>
                <input
                  id="confirm-password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Введи пароль ещё раз"
                  autoComplete="new-password"
                  minLength={8}
                  value={confirmPassword}
                  onChange={(event) =>
                    setConfirmPassword(event.target.value)
                  }
                  disabled={loading}
                  required
                />
              </>
            )}

            {error && (
              <div className="error-message" role="alert">
                {error}
              </div>
            )}

            {success && (
              <div className="auth-success-message" role="status">
                {success}
              </div>
            )}

            <button
              className="primary-button"
              type="submit"
              disabled={loading}
            >
              {loading
                ? 'Отправляем…'
                : isRegister
                  ? 'Создать аккаунт'
                  : 'Войти в аккаунт'}
            </button>
          </form>

          <div className="auth-switch">
            <span>
              {isRegister ? 'Уже есть аккаунт?' : 'Нет аккаунта?'}
            </span>

            <button
              className="secondary-button"
              type="button"
              onClick={switchMode}
              disabled={loading}
            >
              {isRegister ? 'Войти' : 'Зарегистрироваться'}
            </button>
          </div>

          <div className="privacy-note">
            <ShieldCheck size={19} />
            <span>
              {isRegister
                ? 'Используй пароль минимум из 8 символов.'
                : 'Войди с email и паролем своего аккаунта.'}
            </span>
          </div>
        </div>
      </section>
    </main>
  )
}

export default App