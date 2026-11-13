import { useEffect, useState } from 'react'
import { Bell } from 'lucide-react'

type Notification = {
    id: number
    bracelet_id: number
    message: string
    is_read: boolean
    created_at: string
}

type Props = {
    token: string
}

const API_URL = (
    import.meta.env.VITE_API_BASE_URL ||
    (import.meta.env.DEV
        ? 'http://127.0.0.1:8085'
        : window.location.origin)
).replace(/\/$/, '')

export default function NotificationsPanel({ token }: Props) {
    const [notifications, setNotifications] = useState<Notification[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [reload, setReload] = useState(0)
    const [readingIds, setReadingIds] = useState<number[]>([])

    useEffect(() => {
        const controller = new AbortController()

        async function loadNotifications() {
            setLoading(true)
            setError('')

            try {
                const response = await fetch(`${API_URL}/notifications`, {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                    signal: controller.signal,
                })

                if (response.status === 401) {
                    throw new Error('Сеанс истёк. Выйди и войди снова.')
                }

                if (!response.ok) {
                    throw new Error(`Ошибка загрузки: ${response.status}`)
                }

                const data: Notification[] = await response.json()

                if (!Array.isArray(data)) {
                    throw new Error('Неожиданный формат уведомлений.')
                }

                const sorted = [...data].sort(
                    (a, b) =>
                        new Date(b.created_at).getTime() -
                        new Date(a.created_at).getTime(),
                )

                if (!controller.signal.aborted) {
                    setNotifications(sorted)
                }
            } catch (err) {
                if (controller.signal.aborted) return

                setError(
                    err instanceof Error
                        ? err.message
                        : 'Не удалось загрузить уведомления.',
                )
            } finally {
                if (!controller.signal.aborted) {
                    setLoading(false)
                }
            }
        }

        void loadNotifications()

        return () => controller.abort()
    }, [token, reload])

    async function markAsRead(id: number) {
        if (readingIds.includes(id)) return

        setReadingIds((current) => [...current, id])
        setError('')

        try {
            const response = await fetch(
                `${API_URL}/notifications/${id}/read`,
                {
                    method: 'PATCH',
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                },
            )

            if (response.status === 401) {
                throw new Error('Сеанс истёк. Выйди и войди снова.')
            }

            if (!response.ok) {
                throw new Error(`Не удалось отметить: ${response.status}`)
            }

            setNotifications((current) =>
                current.map((item) =>
                    item.id === id ? { ...item, is_read: true } : item,
                ),
            )
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : 'Не удалось отметить уведомление.',
            )
        } finally {
            setReadingIds((current) => current.filter((item) => item !== id))
        }
    }

    const unreadCount = notifications.filter((item) => !item.is_read).length

    return (
        <section className="notifications-panel">
            <div className="section-heading">
                <h2>
                    <Bell size={21} /> Уведомления
                </h2>

                <button
                    className="secondary-button"
                    type="button"
                    disabled={loading || readingIds.length > 0}
                    onClick={() => setReload((value) => value + 1)}
                >
                    {loading ? 'Загрузка…' : 'Обновить уведомления'}
                </button>
            </div>

            {loading && <p role="status">Загружаем уведомления…</p>}

            {error && (
                <div className="error-message" role="alert">
                    {error}
                </div>
            )}

            {!loading && !error && notifications.length === 0 && (
                <p>Уведомлений пока нет.</p>
            )}

            {!loading && notifications.length > 0 && (
                <>
                    <p className="measurement-time">
                        Непрочитанных: {unreadCount}
                    </p>

                    <ul className="notification-list">
                        {notifications.map((item) => (
                            <li
                                key={item.id}
                                className={
                                    item.is_read
                                        ? 'notification-card'
                                        : 'notification-card notification-unread'
                                }
                            >
                                <span className="notification-status">
                                    {item.is_read ? 'Прочитано' : 'Новое'}
                                </span>

                                <p>{item.message}</p>

                                <p className="measurement-time">
                                    Браслет №{item.bracelet_id} ·{' '}
                                    {new Date(item.created_at).toLocaleString('ru-RU')}
                                </p>

                                {!item.is_read && (
                                    <button
                                        className="secondary-button"
                                        type="button"
                                        disabled={readingIds.includes(item.id)}
                                        onClick={() => void markAsRead(item.id)}
                                    >
                                        {readingIds.includes(item.id)
                                            ? 'Сохраняем…'
                                            : 'Отметить прочитанным'}
                                    </button>
                                )}
                            </li>
                        ))}
                    </ul>
                </>
            )}
        </section>
    )
}