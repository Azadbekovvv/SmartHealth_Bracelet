import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Activity, Watch, LogOut } from 'lucide-react'
import MeasurementsPanel from './MeasurementsPanel'
import NotificationsPanel from './NotificationsPanel'
import LocationPanel from './LocationPanel'
import AlertRulesPanel from './AlertRulesPanel'

type Bracelet = {
    id: number
    name: string
    serial_number: string
    last_seen_at: string | null
}

type Props = {
    token: string
    userName: string
    onLogout: () => void
}

const API_URL = (
    import.meta.env.VITE_API_BASE_URL ||
    (import.meta.env.DEV
        ? 'http://127.0.0.1:8085'
        : window.location.origin)
).replace(/\/$/, '')

export default function BraceletsPage({
    token,
    userName,
    onLogout,
}: Props) {
    const [bracelets, setBracelets] = useState<Bracelet[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [reload, setReload] = useState(0)

    const [name, setName] = useState('')
    const [creating, setCreating] = useState(false)
    const [createError, setCreateError] = useState('')
    const [createdKey, setCreatedKey] = useState('')
    const [selectedBraceletId, setSelectedBraceletId] =
        useState<number | null>(null)

    useEffect(() => {
        const controller = new AbortController()

        async function loadBracelets() {
            setLoading(true)
            setError('')

            try {
                const response = await fetch(`${API_URL}/bracelets`, {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                    signal: controller.signal,
                })

                if (response.status === 401) {
                    throw new Error('Сеанс истёк. Выйди и войди снова.')
                }

                if (!response.ok) {
                    throw new Error(
                        `Не удалось загрузить браслеты: ${response.status}`,
                    )
                }

                const data: Bracelet[] = await response.json()

                if (!Array.isArray(data)) {
                    throw new Error('Сервер вернул неожиданный формат данных.')
                }

                if (!controller.signal.aborted) {
                    setBracelets(data)
                }
            } catch (err) {
                if (controller.signal.aborted) return

                setError(
                    err instanceof TypeError
                        ? 'Нет соединения с сервером.'
                        : err instanceof Error
                            ? err.message
                            : 'Ошибка загрузки.',
                )
            } finally {
                if (!controller.signal.aborted) {
                    setLoading(false)
                }
            }
        }

        void loadBracelets()

        return () => controller.abort()
    }, [token, reload])

    async function handleCreate(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()

        if (creating) return

        const cleanName = name.trim()

        if (!cleanName) {
            setCreateError('Введи название браслета.')
            return
        }

        setCreating(true)
        setCreateError('')
        setCreatedKey('')

        try {
            const response = await fetch(`${API_URL}/bracelets`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    name: cleanName,
                }),
            })

            if (!response.ok) {
                if (response.status === 401) {
                    throw new Error('Сеанс истёк. Войди снова.')
                }

                if (response.status === 422) {
                    throw new Error('Название не соответствует требованиям API.')
                }

                throw new Error(
                    `Не удалось создать браслет: ${response.status}`,
                )
            }

            const bracelet = await response.json()

            if (typeof bracelet.device_key === 'string') {
                setCreatedKey(bracelet.device_key)
            }

            setName('')
            setReload((value) => value + 1)
        } catch (err) {
            setCreateError(
                err instanceof TypeError
                    ? 'Нет соединения с сервером. Обнови список перед повторной отправкой: браслет мог сохраниться.'
                    : err instanceof Error
                        ? err.message
                        : 'Ошибка создания браслета.',
            )
        } finally {
            setCreating(false)
        }
    }

    return (
        <div className="dashboard">
            <header className="dashboard-header">
                <div className="dashboard-brand">
                    <Activity size={25} />
                    <strong>SmartHealth.</strong>
                </div>

                <button
                    className="secondary-button"
                    type="button"
                    onClick={onLogout}
                >
                    <LogOut size={17} />
                    Выйти
                </button>
            </header>

            <main className="dashboard-content">
                <span className="form-label">ЛИЧНЫЙ КАБИНЕТ</span>

                <h1>Привет, {userName}!</h1>

                <p className="form-description">
                    Здесь находятся браслеты, привязанные к твоему аккаунту.
                </p>

                <div className="section-heading">
                    <h2>Мои браслеты</h2>

                    <button
                        className="secondary-button"
                        type="button"
                        onClick={() => setReload((value) => value + 1)}
                        disabled={loading}
                    >
                        {loading ? 'Загрузка…' : 'Обновить'}
                    </button>
                </div>

                <form
                    className="create-bracelet-form"
                    onSubmit={handleCreate}
                >
                    <label htmlFor="bracelet-name">
                        Название нового браслета
                    </label>

                    <input
                        id="bracelet-name"
                        placeholder="Например, браслет ребёнка"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        maxLength={100}
                        disabled={creating}
                        required
                    />

                    <button
                        className="primary-button"
                        type="submit"
                        disabled={creating || !name.trim()}
                    >
                        {creating ? 'Создаём…' : 'Добавить браслет'}
                    </button>

                    {createError && (
                        <div className="error-message" role="alert">
                            {createError}
                        </div>
                    )}
                </form>

                {createdKey && (
                    <section
                        className="device-key-box"
                        aria-label="Ключ нового браслета"
                    >
                        <strong>Браслет создан</strong>

                        <p>
                            Сохрани ключ устройства в безопасном месте.
                            Он нужен для передачи показаний от браслета.
                            Не отправляй его в чат или GitHub.
                        </p>

                        <code>{createdKey}</code>

                        <button
                            className="secondary-button"
                            type="button"
                            onClick={() => setCreatedKey('')}
                        >
                            Я сохранил ключ — скрыть
                        </button>
                    </section>
                )}

                {loading && (
                    <p role="status">Загружаем устройства…</p>
                )}

                {error && (
                    <div className="error-message" role="alert">
                        {error}
                    </div>
                )}

                {!loading && !error && bracelets.length === 0 && (
                    <div className="bracelet-card">
                        <Watch size={30} />
                        <h3>Браслетов пока нет</h3>
                        <p>У этого аккаунта ещё нет привязанных устройств.</p>
                    </div>
                )}

                {!loading && !error && (
                    <div className="bracelets-grid">
                        {bracelets.map((bracelet) => (
                            <article
                                className="bracelet-card"
                                key={bracelet.id}
                            >
                                <span className="success-icon">
                                    <Watch size={27} />
                                </span>

                                <h3>{bracelet.name}</h3>

                                <p>
                                    Серийный номер: {bracelet.serial_number}
                                </p>

                                <p>ID устройства: {bracelet.id}</p>

                                <button
                                    className="secondary-button"
                                    type="button"
                                    aria-expanded={selectedBraceletId === bracelet.id}
                                    onClick={() => {
                                        setSelectedBraceletId((current) =>
                                            current === bracelet.id ? null : bracelet.id,
                                        )
                                    }}
                                >
                                    {selectedBraceletId === bracelet.id
                                        ? 'Скрыть показатели'
                                        : 'Показатели'}
                                </button>

                                {selectedBraceletId === bracelet.id && (
                                    <>
                                        <MeasurementsPanel
                                            braceletId={bracelet.id}
                                            token={token}
                                        />

                                        <LocationPanel
                                            braceletId={bracelet.id}
                                            token={token}
                                        />
                                        <AlertRulesPanel
                                            braceletId={bracelet.id}
                                            token={token}
                                        />
                                    </>
                                )}

                                <div className="last-seen">
                                    Последняя связь:
                                    <br />

                                    {bracelet.last_seen_at
                                        ? new Date(
                                            bracelet.last_seen_at,
                                        ).toLocaleString('ru-RU')
                                        : 'Данных пока нет'}
                                </div>
                            </article>
                        ))}
                    </div>
                )}
                <NotificationsPanel token={token} />
            </main>
        </div>
    )
}