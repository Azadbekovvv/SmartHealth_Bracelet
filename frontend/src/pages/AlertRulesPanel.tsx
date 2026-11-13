import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'

type AlertRule = {
    id: number
    bracelet_id: number
    metric: string
    min_value: number | null
    max_value: number | null
    enabled: boolean
    cooldown_seconds: number
    last_triggered_at: string | null
}

type Props = {
    braceletId: number
    token: string
}

const API_URL = (
    import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8085'
).replace(/\/$/, '')

function metricName(metric: string) {
    switch (metric) {
        case 'heart_rate':
            return 'Пульс'
        case 'spo2':
            return 'SpO₂'
        case 'battery_level':
            return 'Заряд батареи'
        default:
            return metric
    }
}

function errorMessage(err: unknown) {
    return err instanceof TypeError
        ? 'Нет соединения с сервером. Обнови список перед повторной отправкой.'
        : err instanceof Error
            ? err.message
            : 'Не удалось выполнить запрос.'
}

async function checkResponse(response: Response) {
    if (response.ok) return

    if (response.status === 401) {
        throw new Error('Сеанс истёк. Выйди и войди снова.')
    }

    const body = await response.json().catch(() => null)

    if (typeof body?.detail === 'string') {
        throw new Error(body.detail)
    }

    if (response.status === 422) {
        throw new Error('Проверь границы и паузу: API отклонил значения.')
    }

    throw new Error(`Ошибка запроса: ${response.status}`)
}

export default function AlertRulesPanel({ braceletId, token }: Props) {
    const [rules, setRules] = useState<AlertRule[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [reload, setReload] = useState(0)

    const [metric, setMetric] = useState('battery_level')
    const [minValue, setMinValue] = useState('')
    const [maxValue, setMaxValue] = useState('')
    const [cooldown, setCooldown] = useState('300')
    const [enabled, setEnabled] = useState(true)

    const [creating, setCreating] = useState(false)
    const [busyId, setBusyId] = useState<number | null>(null)
    const [success, setSuccess] = useState('')

    const busy = loading || creating || busyId !== null
    const inputPrefix = `rule-${braceletId}`

    useEffect(() => {
        const controller = new AbortController()

        async function loadRules() {
            setLoading(true)
            setError('')
            setRules([])

            try {
                const response = await fetch(
                    `${API_URL}/bracelets/${braceletId}/alert-rules`,
                    {
                        headers: {
                            Authorization: `Bearer ${token}`,
                        },
                        signal: controller.signal,
                    },
                )

                await checkResponse(response)

                const data: AlertRule[] = await response.json()

                if (!Array.isArray(data)) {
                    throw new Error('Сервер вернул неожиданный формат правил.')
                }

                if (!controller.signal.aborted) {
                    setRules(data)
                }
            } catch (err) {
                if (!controller.signal.aborted) {
                    setError(errorMessage(err))
                }
            } finally {
                if (!controller.signal.aborted) {
                    setLoading(false)
                }
            }
        }

        void loadRules()

        return () => controller.abort()
    }, [braceletId, token, reload])

    async function createRule(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()

        if (busy) return

        setError('')
        setSuccess('')

        const min = minValue.trim() === '' ? null : Number(minValue)
        const max = maxValue.trim() === '' ? null : Number(maxValue)
        const pause = Number(cooldown)

        if (min === null && max === null) {
            setError('Заполни хотя бы одну границу.')
            return
        }

        if (
            (min !== null && !Number.isFinite(min)) ||
            (max !== null && !Number.isFinite(max))
        ) {
            setError('Границы должны быть числами.')
            return
        }

        if (min !== null && max !== null && min >= max) {
            setError('Нижняя граница должна быть меньше верхней.')
            return
        }

        if (
            (min !== null && min < 0) ||
            (max !== null && max < 0)
        ) {
            setError('Границы не должны быть отрицательными.')
            return
        }

        if (
            metric !== 'heart_rate' &&
            ((min !== null && min > 100) ||
                (max !== null && max > 100))
        ) {
            setError('Для SpO₂ и батареи границы должны быть от 0 до 100%.')
            return
        }

        if (
            cooldown.trim() === '' ||
            !Number.isInteger(pause) ||
            pause < 0
        ) {
            setError('Пауза должна быть целым неотрицательным числом секунд.')
            return
        }

        const duplicate = rules.some(
            (rule) =>
                rule.metric === metric &&
                rule.min_value === min &&
                rule.max_value === max,
        )

        if (duplicate) {
            setError('Правило с такими показателем и границами уже есть.')
            return
        }

        setCreating(true)

        try {
            const response = await fetch(
                `${API_URL}/bracelets/${braceletId}/alert-rules`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                        metric,
                        min_value: min,
                        max_value: max,
                        enabled,
                        cooldown_seconds: pause,
                    }),
                },
            )

            await checkResponse(response)

            setMinValue('')
            setMaxValue('')
            setSuccess('Правило создано.')
            setReload((value) => value + 1)
        } catch (err) {
            setError(errorMessage(err))
        } finally {
            setCreating(false)
        }
    }

    async function toggleRule(rule: AlertRule) {
        if (busy) return

        setBusyId(rule.id)
        setError('')
        setSuccess('')

        try {
            const nextEnabled = !rule.enabled

            const response = await fetch(
                `${API_URL}/bracelets/${braceletId}/alert-rules/${rule.id}`,
                {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({ enabled: nextEnabled }),
                },
            )

            await checkResponse(response)

            setRules((current) =>
                current.map((item) =>
                    item.id === rule.id
                        ? { ...item, enabled: nextEnabled }
                        : item,
                ),
            )
        } catch (err) {
            setError(errorMessage(err))
        } finally {
            setBusyId(null)
        }
    }

    async function deleteRule(rule: AlertRule) {
        if (busy) return

        const confirmed = window.confirm(
            `Удалить правило №${rule.id} «${metricName(rule.metric)}»?`,
        )

        if (!confirmed) return

        setBusyId(rule.id)
        setError('')
        setSuccess('')

        try {
            const response = await fetch(
                `${API_URL}/bracelets/${braceletId}/alert-rules/${rule.id}`,
                {
                    method: 'DELETE',
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                },
            )

            await checkResponse(response)

            setRules((current) => current.filter((item) => item.id !== rule.id))
            setSuccess(`Правило №${rule.id} удалено.`)
        } catch (err) {
            setError(errorMessage(err))
        } finally {
            setBusyId(null)
        }
    }

    return (
        <section className="alert-rules-panel">
            <div className="section-heading">
                <h3>Правила уведомлений</h3>

                <button
                    className="secondary-button"
                    type="button"
                    disabled={busy}
                    onClick={() => {
                        setSuccess('')
                        setReload((value) => value + 1)
                    }}
                >
                    {loading ? 'Загрузка…' : 'Обновить правила'}
                </button>
            </div>

            <form className="alert-rule-form" onSubmit={createRule}>
                <h4>Новое правило</h4>

                <fieldset disabled={busy}>
                    <label htmlFor={`${inputPrefix}-metric`}>Показатель</label>
                    <select
                        id={`${inputPrefix}-metric`}
                        value={metric}
                        onChange={(event) => {
                            setMetric(event.target.value)
                            setMinValue('')
                            setMaxValue('')
                        }}
                    >
                        <option value="battery_level">Заряд батареи, %</option>
                        <option value="heart_rate">Пульс, уд/мин</option>
                        <option value="spo2">SpO₂, %</option>
                    </select>

                    <label htmlFor={`${inputPrefix}-min`}>
                        Уведомлять при значении ниже
                    </label>
                    <input
                        id={`${inputPrefix}-min`}
                        type="number"
                        min="0"
                        max={metric === 'heart_rate' ? undefined : 100}
                        step="any"
                        placeholder="Необязательно"
                        value={minValue}
                        onChange={(event) => setMinValue(event.target.value)}
                    />

                    <label htmlFor={`${inputPrefix}-max`}>
                        Уведомлять при значении выше
                    </label>
                    <input
                        id={`${inputPrefix}-max`}
                        type="number"
                        min="0"
                        max={metric === 'heart_rate' ? undefined : 100}
                        step="any"
                        placeholder="Необязательно"
                        value={maxValue}
                        onChange={(event) => setMaxValue(event.target.value)}
                    />

                    <p className="measurement-time">
                        Заполни хотя бы одну границу.
                        Пустая граница отправляется как null.
                    </p>

                    <label htmlFor={`${inputPrefix}-cooldown`}>
                        Пауза между уведомлениями, сек.
                    </label>
                    <input
                        id={`${inputPrefix}-cooldown`}
                        type="number"
                        min="0"
                        step="1"
                        value={cooldown}
                        onChange={(event) => setCooldown(event.target.value)}
                        required
                    />

                    <label className="rule-checkbox">
                        <input
                            type="checkbox"
                            checked={enabled}
                            onChange={(event) => setEnabled(event.target.checked)}
                        />
                        Включить правило
                    </label>

                    <button className="primary-button" type="submit">
                        {creating ? 'Создаём…' : 'Создать правило'}
                    </button>
                </fieldset>
            </form>

            {loading && <p role="status">Получаем правила…</p>}

            {error && (
                <div className="error-message" role="alert">
                    {error}
                </div>
            )}

            {success && <p role="status">{success}</p>}

            {!loading && !error && rules.length === 0 && (
                <p>Для этого браслета правила пока не созданы.</p>
            )}

            {!loading && (
                <ul className="alert-rule-list">
                    {rules.map((rule) => (
                        <li className="alert-rule-card" key={rule.id}>
                            <h4>{metricName(rule.metric)}</h4>

                            <p className="measurement-time">Правило №{rule.id}</p>

                            <p>
                                Статус: {rule.enabled ? 'Включено' : 'Отключено'}
                            </p>

                            {rule.min_value !== null && (
                                <p>Уведомлять при значении ниже {rule.min_value}</p>
                            )}

                            {rule.max_value !== null && (
                                <p>Уведомлять при значении выше {rule.max_value}</p>
                            )}

                            <p>
                                Пауза между уведомлениями: {rule.cooldown_seconds} сек.
                            </p>

                            <p className="measurement-time">
                                Последнее срабатывание:{' '}
                                {rule.last_triggered_at
                                    ? new Date(rule.last_triggered_at).toLocaleString('ru-RU')
                                    : 'Ещё не срабатывало'}
                            </p>

                            <div className="rule-actions">
                                <button
                                    className="secondary-button"
                                    type="button"
                                    disabled={busy}
                                    onClick={() => void toggleRule(rule)}
                                >
                                    {busyId === rule.id
                                        ? 'Обрабатываем…'
                                        : rule.enabled
                                            ? 'Отключить правило'
                                            : 'Включить правило'}
                                </button>

                                <button
                                    className="secondary-button rule-delete"
                                    type="button"
                                    disabled={busy}
                                    onClick={() => void deleteRule(rule)}
                                >
                                    Удалить
                                </button>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    )
}