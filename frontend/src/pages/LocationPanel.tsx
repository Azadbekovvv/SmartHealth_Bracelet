import { useEffect, useState } from 'react'

type Location = {
    id: number
    bracelet_id: number
    latitude: number
    longitude: number
    accuracy_m: number | null
    source: string
    recorded_at: string
}

type GeofenceStatus = {
    bracelet_id: number
    status: string
    distance_m: number | null
    radius_m: number | null
    accuracy_m: number | null
    source: string | null
    recorded_at: string | null
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

function getStatusLabel(status: string) {
    switch (status) {
        case 'inside':
            return 'Внутри безопасной зоны'
        case 'outside':
            return 'За пределами безопасной зоны'
        case 'stale':
            return 'Координаты устарели'
        case 'disabled':
            return 'Безопасная зона отключена'
        case 'uncertain':
            return 'Недостаточная точность координат'
        case 'no_location':
            return 'Нет координат для проверки'
        default:
            return `Статус сервера: ${status}`
    }
}

function getErrorMessage(err: unknown) {
    if (err instanceof TypeError) {
        return 'Нет соединения с сервером.'
    }

    return err instanceof Error ? err.message : 'Ошибка загрузки.'
}

export default function LocationPanel({ braceletId, token }: Props) {
    const [location, setLocation] = useState<Location | null>(null)
    const [zone, setZone] = useState<GeofenceStatus | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [zoneError, setZoneError] = useState('')
    const [reload, setReload] = useState(0)
    const [radius, setRadius] = useState('200')
    const [savingZone, setSavingZone] = useState(false)
    const [saveZoneError, setSaveZoneError] = useState('')
    const [saveZoneSuccess, setSaveZoneSuccess] = useState('')
    const [deviceKey, setDeviceKey] = useState('')
    const [sending, setSending] = useState(false)
    const [sendError, setSendError] = useState('')
    const [sendSuccess, setSendSuccess] = useState('')

    useEffect(() => {
        const controller = new AbortController()

        const options = {
            headers: {
                Authorization: `Bearer ${token}`,
            },
            signal: controller.signal,
        }

        async function loadLocation() {
            try {
                const response = await fetch(
                    `${API_URL}/bracelets/${braceletId}/locations/latest`,
                    options,
                )

                if (response.status === 404) {
                    const body = await response.json()

                    if (body.detail === 'У браслета пока нет координат') {
                        return
                    }

                    throw new Error('Браслет или адрес запроса не найден.')
                }

                if (response.status === 401) {
                    throw new Error('Сеанс истёк. Выйди и войди снова.')
                }

                if (!response.ok) {
                    throw new Error(`Ошибка загрузки координат: ${response.status}`)
                }

                const data: Location = await response.json()

                if (!controller.signal.aborted) {
                    setLocation(data)
                }
            } catch (err) {
                if (!controller.signal.aborted) {
                    setError(getErrorMessage(err))
                }
            }
        }

        async function loadZone() {
            try {
                const response = await fetch(
                    `${API_URL}/bracelets/${braceletId}/geofence/status`,
                    options,
                )

                if (response.status === 401) {
                    throw new Error('Сеанс истёк. Выйди и войди снова.')
                }

                if (!response.ok) {
                    const body = await response.json().catch(() => null)

                    throw new Error(
                        typeof body?.detail === 'string'
                            ? body.detail
                            : `Ошибка загрузки зоны: ${response.status}`,
                    )
                }

                const data: GeofenceStatus = await response.json()

                if (!controller.signal.aborted) {
                    setZone(data)
                }
            } catch (err) {
                if (!controller.signal.aborted) {
                    setZoneError(getErrorMessage(err))
                }
            }
        }

        async function loadAll() {
            setLoading(true)
            setError('')
            setZoneError('')
            setLocation(null)
            setZone(null)

            await Promise.all([loadLocation(), loadZone()])

            if (!controller.signal.aborted) {
                setLoading(false)
            }
        }

        void loadAll()

        return () => controller.abort()
    }, [braceletId, token, reload])

    async function sendMyLocation() {
        if (sending) return

        setSendError('')
        setSendSuccess('')

        const key = deviceKey.trim()

        if (!key) {
            setSendError('Введи ключ этого браслета.')
            return
        }

        if (!navigator.geolocation) {
            setSendError('Браузер не поддерживает определение местоположения.')
            return
        }

        setSending(true)

        try {
            const position = await new Promise<GeolocationPosition>(
                (resolve, reject) => {
                    navigator.geolocation.getCurrentPosition(resolve, reject, {
                        enableHighAccuracy: true,
                        timeout: 20000,
                        maximumAge: 0,
                    })
                },
            )

            const response = await fetch(
                `${API_URL}/bracelets/${braceletId}/locations`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`,
                        'X-Device-Key': key,
                    },
                    body: JSON.stringify({
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude,
                        accuracy_m: position.coords.accuracy,
                        source: 'phone',
                        recorded_at: new Date(position.timestamp).toISOString(),
                    }),
                },
            )

            if (!response.ok) {
                const body = await response.json().catch(() => null)

                throw new Error(
                    typeof body?.detail === 'string'
                        ? body.detail
                        : `Не удалось отправить координаты: ${response.status}`,
                )
            }

            setSendSuccess('Координаты отправлены. Карта и статус обновляются.')
            setDeviceKey('')
            setReload((value) => value + 1)
        } catch (err) {
            if (
                typeof err === 'object' &&
                err !== null &&
                'code' in err
            ) {
                switch (err.code) {
                    case 1:
                        setSendError(
                            'Доступ к местоположению запрещён. Разреши его в настройках сайта.',
                        )
                        break
                    case 2:
                        setSendError('Не удалось определить местоположение.')
                        break
                    case 3:
                        setSendError('Время ожидания истекло. Попробуй ещё раз.')
                        break
                    default:
                        setSendError('Ошибка определения местоположения.')
                }
            } else {
                setSendError(
                    err instanceof TypeError
                        ? 'Нет соединения с сервером.'
                        : err instanceof Error
                            ? err.message
                            : 'Не удалось отправить координаты.',
                )
            }
        } finally {
            setSending(false)
        }
    }

    async function saveZoneHere() {
        if (!location || savingZone) return

        setSaveZoneError('')
        setSaveZoneSuccess('')

        const radiusValue = Number(radius)

        if (!Number.isFinite(radiusValue) || radiusValue < 1) {
            setSaveZoneError('Укажи радиус не меньше 1 метра.')
            return
        }

        setSavingZone(true)

        try {
            const response = await fetch(
                `${API_URL}/bracelets/${braceletId}/geofence`,
                {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                        name: 'Моя безопасная зона',
                        center_latitude: location.latitude,
                        center_longitude: location.longitude,
                        radius_m: radiusValue,
                        enabled: true,
                    }),
                },
            )

            if (response.status === 401) {
                throw new Error('Сеанс истёк. Выйди и войди снова.')
            }

            if (!response.ok) {
                const body = await response.json().catch(() => null)

                throw new Error(
                    typeof body?.detail === 'string'
                        ? body.detail
                        : `Не удалось сохранить зону: ${response.status}`,
                )
            }

            setSaveZoneSuccess('Зона сохранена вокруг точки на карте.')
            setReload((value) => value + 1)
        } catch (err) {
            setSaveZoneError(
                err instanceof TypeError
                    ? 'Нет соединения с сервером.'
                    : err instanceof Error
                        ? err.message
                        : 'Не удалось сохранить зону.',
            )
        } finally {
            setSavingZone(false)
        }
    }

    const mapUrl = location
        ? 'https://www.openstreetmap.org/export/embed.html?' +
        new URLSearchParams({
            bbox: [
                Math.max(-180, location.longitude - 0.01),
                Math.max(-90, location.latitude - 0.01),
                Math.min(180, location.longitude + 0.01),
                Math.min(90, location.latitude + 0.01),
            ].join(','),
            layer: 'mapnik',
            marker: `${location.latitude},${location.longitude}`,
        }).toString()
        : ''

    const zoneClass =
        zone?.status === 'inside'
            ? 'zone-status zone-inside'
            : zone?.status === 'outside'
                ? 'zone-status zone-outside'
                : 'zone-status zone-neutral'

    return (
        <section className="location-panel">
            <div className="section-heading">
                <h3>Местоположение и безопасная зона</h3>

                <button
                    className="secondary-button"
                    type="button"
                    disabled={loading}
                    onClick={() => setReload((value) => value + 1)}
                >
                    {loading ? 'Загрузка…' : 'Обновить карту и статус'}
                </button>
            </div>

            <div className="location-share">
                <label htmlFor={`device-key-${braceletId}`}>
                    Ключ браслета для отправки координат
                </label>

                <input
                    id={`device-key-${braceletId}`}
                    type="password"
                    autoComplete="off"
                    placeholder="Вставь ключ устройства"
                    value={deviceKey}
                    onChange={(event) => setDeviceKey(event.target.value)}
                    disabled={sending}
                />

                <button
                    className="secondary-button"
                    type="button"
                    disabled={sending || loading || !deviceKey.trim()}
                    onClick={() => void sendMyLocation()}
                >
                    {sending
                        ? 'Определяем и отправляем…'
                        : 'Передать моё местоположение'}
                </button>

                <p className="measurement-time">
                    По нажатию браузер запросит разрешение на получение координат.
                    На ноутбуке точность может быть ниже, чем на телефоне.
                </p>

                {sendError && (
                    <p className="error-message" role="alert">
                        {sendError}
                    </p>
                )}

                {sendSuccess && <p role="status">{sendSuccess}</p>}
            </div>

            {loading && <p role="status">Получаем координаты и статус зоны…</p>}

            {!loading && (
                <>
                    {error && (
                        <div className="error-message" role="alert">
                            {error}
                        </div>
                    )}

                    {!error && !location && (
                        <p>Координат пока нет. Отправь тестовую точку через API.</p>
                    )}

                    {!error && location && (
                        <>
                            <iframe
                                className="location-map"
                                title={`Местоположение браслета №${braceletId}`}
                                src={mapUrl}
                                loading="lazy"
                                referrerPolicy="no-referrer"
                            />

                            <p>
                                Координаты: {location.latitude.toFixed(5)},{' '}
                                {location.longitude.toFixed(5)}
                            </p>

                            <p>
                                Точность:{' '}
                                {location.accuracy_m === null
                                    ? 'не указана'
                                    : `${location.accuracy_m} м`}
                            </p>

                            <p>
                                Источник:{' '}
                                {location.source === 'phone' ? 'Телефон' : location.source}
                            </p>

                            <p className="measurement-time">
                                Время точки:{' '}
                                {new Date(location.recorded_at).toLocaleString('ru-RU')}
                            </p>

                            <p className="measurement-time">
                                Сейчас отображаются отправленные нами тестовые координаты.
                            </p>
                        </>
                    )}

                    <div className="geofence-section">
                        <h4>Безопасная зона</h4>
                        {location && (
                            <div className="location-share">
                                <label htmlFor={`zone-radius-${braceletId}`}>
                                    Радиус зоны в метрах
                                </label>

                                <input
                                    id={`zone-radius-${braceletId}`}
                                    type="number"
                                    min="1"
                                    step="1"
                                    value={radius}
                                    onChange={(event) => setRadius(event.target.value)}
                                    disabled={savingZone}
                                />

                                <p className="measurement-time">
                                    Центр новой зоны: {location.latitude.toFixed(5)},{' '}
                                    {location.longitude.toFixed(5)}.
                                    Сохранение заменит прежние настройки зоны этого браслета.
                                </p>

                                <button
                                    className="secondary-button"
                                    type="button"
                                    disabled={savingZone || sending || loading || !radius.trim()}
                                    onClick={() => void saveZoneHere()}
                                >
                                    {savingZone
                                        ? 'Сохраняем…'
                                        : 'Сделать эту точку центром зоны'}
                                </button>
                            </div>
                        )}

                        {saveZoneError && (
                            <p className="error-message" role="alert">
                                {saveZoneError}
                            </p>
                        )}

                        {saveZoneSuccess && <p role="status">{saveZoneSuccess}</p>}

                        {zoneError && (
                            <div className="error-message" role="alert">
                                {zoneError}
                            </div>
                        )}

                        {!zoneError && zone && (
                            <>
                                <p className={zoneClass} role="status">
                                    {getStatusLabel(zone.status)}
                                </p>

                                {zone.radius_m != null && (
                                    <p>Радиус зоны: {zone.radius_m} м</p>
                                )}

                                {zone.distance_m != null && (
                                    <p>
                                        Расстояние от сохранённой точки до центра:{' '}
                                        {zone.distance_m.toFixed(1)} м
                                    </p>
                                )}

                                {zone.status === 'stale' && (
                                    <p className="measurement-time">
                                        Сохранённая точка устарела. Для проверки текущего
                                        положения отправь свежие координаты.
                                    </p>
                                )}

                                <p className="measurement-time">
                                    Статус получен при последнем обновлении.
                                    Нажми «Обновить карту и статус», чтобы проверить снова.
                                </p>
                            </>
                        )}
                    </div>
                </>
            )}
        </section>
    )
}