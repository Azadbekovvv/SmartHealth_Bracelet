import { useEffect, useState } from 'react'
import { Heart, Droplets, Battery } from 'lucide-react'
import {
    ResponsiveContainer,
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
} from 'recharts'

type Measurement = {
    id: number
    bracelet_id: number
    heart_rate: number | null
    spo2: number | null
    battery_level: number | null
    measured_at: string
}

type Props = {
    braceletId: number
    token: string
}

const API_URL = (
    import.meta.env.VITE_API_BASE_URL ||
    (import.meta.env.DEV
        ? 'http://127.0.0.1:8085'
        : window.location.origin)
).replace(/\/$/, '')

export default function MeasurementsPanel({ braceletId, token }: Props) {
    const [history, setHistory] = useState<Measurement[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [reload, setReload] = useState(0)
    const [now, setNow] = useState(() => Date.now())

    useEffect(() => {
        const timer = window.setInterval(() => {
            setNow(Date.now())
        }, 30_000)

        return () => window.clearInterval(timer)
    }, [])

    useEffect(() => {
        const controller = new AbortController()

        async function loadMeasurements() {
            setLoading(true)
            setError('')
            setHistory([])

            try {
                const response = await fetch(
                    `${API_URL}/bracelets/${braceletId}/measurements`,
                    {
                        headers: {
                            Authorization: `Bearer ${token}`,
                        },
                        signal: controller.signal,
                    },
                )

                if (response.status === 401) {
                    throw new Error('Сеанс истёк. Выйди и войди снова.')
                }

                if (!response.ok) {
                    throw new Error(`Ошибка загрузки: ${response.status}`)
                }

                const data: Measurement[] = await response.json()

                if (!Array.isArray(data)) {
                    throw new Error('Сервер вернул неожиданный формат истории.')
                }

                const sorted = [...data].sort(
                    (a, b) =>
                        new Date(b.measured_at).getTime() -
                        new Date(a.measured_at).getTime(),
                )

                if (!controller.signal.aborted) {
                    setHistory(sorted)
                }
            } catch (err) {
                if (controller.signal.aborted) return

                setError(
                    err instanceof TypeError
                        ? 'Нет соединения с сервером.'
                        : err instanceof Error
                            ? err.message
                            : 'Не удалось получить показатели.',
                )
            } finally {
                if (!controller.signal.aborted) {
                    setLoading(false)
                }
            }
        }

        void loadMeasurements()

        return () => controller.abort()
    }, [braceletId, token, reload])

    const measurement = history[0]

    const age = measurement
        ? now - new Date(measurement.measured_at).getTime()
        : 0

    // Для графика располагаем измерения от старых к новым.
    const chartData = [...history]
        .reverse()
        .map((item) => ({
            time: new Date(item.measured_at).getTime(),
            pulse: item.heart_rate,
        }))

    return (
        <section className="measurements-panel">
            <div className="section-heading">
                <h3>Показатели и история</h3>

                <button
                    className="secondary-button"
                    type="button"
                    disabled={loading}
                    onClick={() => setReload((value) => value + 1)}
                >
                    {loading ? 'Загрузка…' : 'Обновить показатели'}
                </button>
            </div>

            {loading && <p role="status">Получаем показатели…</p>}

            {!loading && error && (
                <div className="error-message" role="alert">
                    {error}
                </div>
            )}

            {!loading && !error && !measurement && (
                <div className="measurement-empty">
                    <strong>Измерений пока нет</strong>
                    <p>
                        Здесь появятся тестовые показания, а после подключения
                        браслета — данные его датчиков.
                    </p>
                </div>
            )}

            {!loading && !error && measurement && (
                <>
                    <h4>Последнее из полученных измерений</h4>

                    <div className="metrics-grid">
                        <div className="metric-card">
                            <Heart size={22} />
                            <span>Пульс</span>
                            <strong>{measurement.heart_rate ?? '—'}</strong>
                            <small>уд/мин</small>
                        </div>

                        <div className="metric-card">
                            <Droplets size={22} />
                            <span>SpO₂</span>
                            <strong>{measurement.spo2 ?? '—'}</strong>
                            <small>%</small>
                        </div>

                        <div className="metric-card">
                            <Battery size={22} />
                            <span>Заряд батареи</span>
                            <strong>{measurement.battery_level ?? '—'}</strong>
                            <small>%</small>
                        </div>
                    </div>

                    <p className="measurement-time">
                        Время измерения:{' '}
                        {new Date(measurement.measured_at).toLocaleString('ru-RU')}
                    </p>

                    {age > 5 * 60 * 1000 && (
                        <p className="measurement-time">
                            Показание старше 5 минут. Это сохранённое измерение.
                        </p>
                    )}

                    {age < -60 * 1000 && (
                        <p className="measurement-time">
                            У измерения указано время в будущем. Проверь время
                            при отправке тестовых данных.
                        </p>
                    )}

                    <div className="pulse-chart">
                        <h4>История пульса</h4>

                        <ResponsiveContainer width="100%" height={260}>
                            <LineChart
                                data={chartData}
                                margin={{ top: 10, right: 15, bottom: 10, left: 0 }}
                            >
                                <CartesianGrid strokeDasharray="3 3" />

                                <XAxis
                                    dataKey="time"
                                    type="number"
                                    domain={['dataMin', 'dataMax']}
                                    tickFormatter={(value: number) =>
                                        new Date(value).toLocaleTimeString('ru-RU', {
                                            hour: '2-digit',
                                            minute: '2-digit',
                                        })
                                    }
                                />

                                <YAxis width={45} allowDecimals={false} />

                                <Tooltip
                                    labelFormatter={(value) =>
                                        new Date(Number(value)).toLocaleString('ru-RU')
                                    }
                                />

                                <Line
                                    type="linear"
                                    dataKey="pulse"
                                    name="Пульс, уд/мин"
                                    stroke="#21846b"
                                    strokeWidth={2}
                                    dot={{ r: 4 }}
                                    activeDot={{ r: 6 }}
                                    connectNulls={false}
                                    isAnimationActive={false}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>

                    <div className="measurement-history">
                        <h4>История измерений</h4>

                        <div className="measurement-table-wrapper">
                            <table className="measurement-table">
                                <caption>
                                    Получено записей: {history.length}. Сначала новые.
                                </caption>

                                <thead>
                                    <tr>
                                        <th scope="col">Время измерения</th>
                                        <th scope="col">Пульс, уд/мин</th>
                                        <th scope="col">SpO₂, %</th>
                                        <th scope="col">Батарея, %</th>
                                    </tr>
                                </thead>

                                <tbody>
                                    {history.map((item) => (
                                        <tr key={item.id}>
                                            <td>
                                                {new Date(item.measured_at).toLocaleString('ru-RU')}
                                            </td>
                                            <td>{item.heart_rate ?? '—'}</td>
                                            <td>{item.spo2 ?? '—'}</td>
                                            <td>{item.battery_level ?? '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}
        </section>
    )
}