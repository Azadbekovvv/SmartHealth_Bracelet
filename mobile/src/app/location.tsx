import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Linking,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { API_URL, clearToken, getToken } from '../session';

type SavedLocation = {
    id: number;
    bracelet_id: number;
    latitude: number;
    longitude: number;
    accuracy_m: number | null;
    source: 'phone' | 'bracelet';
    recorded_at: string;
    received_at: string;
};

function isLocation(value: unknown): value is SavedLocation {
    if (typeof value !== 'object' || value === null) {
        return false;
    }

    const item = value as Record<string, unknown>;

    return (
        typeof item.id === 'number' &&
        typeof item.bracelet_id === 'number' &&
        typeof item.latitude === 'number' &&
        Number.isFinite(item.latitude) &&
        item.latitude >= -90 &&
        item.latitude <= 90 &&
        typeof item.longitude === 'number' &&
        Number.isFinite(item.longitude) &&
        item.longitude >= -180 &&
        item.longitude <= 180 &&
        (
            item.accuracy_m === null ||
            (
                typeof item.accuracy_m === 'number' &&
                Number.isFinite(item.accuracy_m) &&
                item.accuracy_m >= 0
            )
        ) &&
        (item.source === 'phone' || item.source === 'bracelet') &&
        typeof item.recorded_at === 'string' &&
        typeof item.received_at === 'string'
    );
}

function formatDate(value: string): string {
    const timestamp = Date.parse(value);

    return Number.isFinite(timestamp)
        ? new Date(timestamp).toLocaleString('ru-RU')
        : 'Дата не распознана';
}

function freshness(value: string, now: number): string {
    const timestamp = Date.parse(value);

    if (!Number.isFinite(timestamp)) {
        return 'Не удалось определить давность точки.';
    }

    const age = now - timestamp;

    if (age < -30_000) {
        return 'Дата точки находится в будущем. Проверь время источника.';
    }

    if (age > 300_000) {
        return 'Точка старше 5 минут. Местоположение могло измениться.';
    }

    return 'Точка получена недавно. Это не гарантирует текущее положение.';
}

export default function LocationScreen() {
    const params = useLocalSearchParams<{
        braceletId?: string | string[];
    }>();

    const rawId = Array.isArray(params.braceletId)
        ? params.braceletId[0]
        : params.braceletId;

    const braceletId = Number(rawId);
    const validId =
        Number.isSafeInteger(braceletId) && braceletId > 0;

    const [location, setLocation] = useState<SavedLocation | null>(null);
    const [loading, setLoading] = useState(true);
    const [empty, setEmpty] = useState('');
    const [error, setError] = useState('');
    const [reload, setReload] = useState(0);
    const [now, setNow] = useState(0);

    useEffect(() => {
        setNow(Date.now());

        const timer = setInterval(() => {
            setNow(Date.now());
        }, 30_000);

        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        if (!validId) {
            setLoading(false);
            return;
        }

        const token = getToken();

        if (!token) {
            router.replace('/login');
            return;
        }

        let active = true;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 90_000);

        async function loadLocation() {
            setLoading(true);
            setLocation(null);
            setEmpty('');
            setError('');

            try {
                const response = await fetch(
                    `${API_URL}/bracelets/${braceletId}/locations/latest`,
                    {
                        headers: {
                            Authorization: `Bearer ${token}`,
                        },
                        signal: controller.signal,
                    },
                );

                if (!active) return;

                if (response.status === 401) {
                    clearToken();
                    router.replace('/login');
                    return;
                }

                if (response.status === 404) {
                    const body: unknown = await response.json();

                    if (!active) return;

                    const detail =
                        typeof body === 'object' &&
                            body !== null &&
                            'detail' in body &&
                            typeof body.detail === 'string'
                            ? body.detail
                            : 'Местоположение не найдено.';

                    setEmpty(detail);
                    return;
                }

                if (!response.ok) {
                    throw new Error(
                        `Не удалось загрузить местоположение: ${response.status}.`,
                    );
                }

                const data: unknown = await response.json();

                if (!active) return;

                if (!isLocation(data) || data.bracelet_id !== braceletId) {
                    throw new Error('Неожиданный формат местоположения.');
                }

                setLocation(data);
                setNow(Date.now());
            } catch (err) {
                if (!active) return;

                setError(
                    controller.signal.aborted
                        ? 'Сервер долго отвечает. Нажми «Обновить».'
                        : err instanceof TypeError
                            ? 'Не удалось соединиться с сервером.'
                            : err instanceof Error
                                ? err.message
                                : 'Не удалось загрузить местоположение.',
                );
            } finally {
                clearTimeout(timeout);
                if (active) setLoading(false);
            }
        }

        void loadLocation();

        return () => {
            active = false;
            clearTimeout(timeout);
            controller.abort();
        };
    }, [braceletId, validId, reload]);

    const [sendingLocation, setSendingLocation] = useState(false);

    async function sendMyLocation() {
        if (!validId || loading || sendingLocation) return;

        const token = getToken();

        if (!token) {
            router.replace('/login');
            return;
        }

        if (typeof navigator === 'undefined' || !navigator.geolocation) {
            setError('Открой SmartHealth в Safari, чтобы определить местоположение.');
            return;
        }

        setSendingLocation(true);
        setError('');

        try {
            const point = await new Promise<GeolocationPosition>((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(
                    resolve,
                    (error) =>
                        reject(
                            new Error(
                                error.code === 1
                                    ? 'Доступ к геолокации запрещён. Разреши его для сайта в Safari.'
                                    : 'Не удалось определить местоположение. Попробуй ещё раз.',
                            ),
                        ),
                    { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
                );
            });

            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 30_000);

            try {
                const response = await fetch(
                    `${API_URL}/bracelets/${braceletId}/locations`,
                    {
                        method: 'POST',
                        headers: {
                            Authorization: `Bearer ${token}`,
                            'Content-Type': 'application/json',
                        },
                        signal: controller.signal,
                        body: JSON.stringify({
                            latitude: point.coords.latitude,
                            longitude: point.coords.longitude,
                            accuracy_m: point.coords.accuracy,
                            source: 'phone',
                            recorded_at: new Date(point.timestamp).toISOString(),
                        }),
                    },
                );

                if (response.status === 401) {
                    clearToken();
                    router.replace('/login');
                    return;
                }

                if (!response.ok) {
                    throw new Error(`Не удалось сохранить координаты: ${response.status}.`);
                }

                setReload((value) => value + 1);
            } finally {
                clearTimeout(timer);
            }
        } catch (error) {
            setError(
                error instanceof Error && error.name === 'AbortError'
                    ? 'Сервер не ответил вовремя. Нажми «Обновить», чтобы проверить, сохранилась ли точка.'
                    : error instanceof Error
                        ? error.message
                        : 'Не удалось отправить местоположение.',
            );
        } finally {
            setSendingLocation(false);
        }
    }

    const [zoneText, setZoneText] = useState('');

    useEffect(() => {
        setZoneText('');

        if (!validId) return;

        const token = getToken();
        if (!token) return;

        const controller = new AbortController();

        async function loadZoneStatus() {
            try {
                const response = await fetch(
                    `${API_URL}/bracelets/${braceletId}/geofence/status`,
                    {
                        headers: { Authorization: `Bearer ${token}` },
                        signal: controller.signal,
                    },
                );

                if (controller.signal.aborted) return;

                if (response.status === 404) {
                    setZoneText('Статус недоступен: проверь, настроена ли зона.');
                    return;
                }

                if (!response.ok) {
                    setZoneText('Не удалось загрузить статус зоны.');
                    return;
                }

                const data = await response.json();

                if (controller.signal.aborted) return;

                switch (data.status) {
                    case 'inside':
                        setZoneText('Внутри безопасной зоны');
                        break;
                    case 'outside':
                        setZoneText('За пределами безопасной зоны');
                        break;
                    case 'disabled':
                        setZoneText('Безопасная зона выключена');
                        break;
                    default:
                        setZoneText('Недостаточно данных для определения статуса зоны.');
                }
            } catch {
                if (!controller.signal.aborted) {
                    setZoneText('Не удалось загрузить статус зоны.');
                }
            }
        }

        void loadZoneStatus();
        return () => controller.abort();
    }, [braceletId, validId, reload]);

    const [zoneRadius, setZoneRadius] = useState('200');
    const [savingZone, setSavingZone] = useState(false);
    const [zoneFeedback, setZoneFeedback] = useState('');

    async function saveZone() {
        if (!validId || !location || savingZone || sendingLocation || loading) {
            return;
        }

        setZoneFeedback('');

        const radius = Number(zoneRadius.trim());

        if (!/^\d+$/.test(zoneRadius.trim()) ||
            !Number.isSafeInteger(radius) || radius < 1) {
            setZoneFeedback('Введи радиус целым числом, например 200.');
            return;
        }

        const token = getToken();

        if (!token) {
            router.replace('/login');
            return;
        }

        setSavingZone(true);

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30_000);

        try {
            const response = await fetch(
                `${API_URL}/bracelets/${braceletId}/geofence`,
                {
                    method: 'PUT',
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                    signal: controller.signal,
                    body: JSON.stringify({
                        name: 'Моя безопасная зона',
                        center_latitude: location.latitude,
                        center_longitude: location.longitude,
                        radius_m: radius,
                        enabled: true,
                    }),
                },
            );

            if (response.status === 401) {
                clearToken();
                router.replace('/login');
                return;
            }

            if (response.status === 422) {
                throw new Error('Сервер не принял параметры зоны. Попробуй радиус 200 м.');
            }

            if (!response.ok) {
                throw new Error(`Не удалось сохранить зону: ${response.status}.`);
            }

            setZoneFeedback(`Зона сохранена. Радиус: ${radius} м.`);
            setReload((value) => value + 1);
        } catch (error) {
            setZoneFeedback(
                controller.signal.aborted
                    ? 'Сервер не ответил вовремя. Нажми «Обновить», чтобы проверить статус зоны.'
                    : error instanceof Error
                        ? error.message
                        : 'Не удалось сохранить зону.',
            );
        } finally {
            clearTimeout(timeout);
            setSavingZone(false);
        }
    }

    const [savedZoneText, setSavedZoneText] = useState('');

    useEffect(() => {
        setSavedZoneText('');
        if (!validId) return;

        const token = getToken();
        if (!token) return;

        const controller = new AbortController();

        async function loadSavedZone() {
            try {
                const response = await fetch(
                    `${API_URL}/bracelets/${braceletId}/geofence`,
                    {
                        headers: { Authorization: `Bearer ${token}` },
                        signal: controller.signal,
                    },
                );

                if (controller.signal.aborted) return;

                if (response.status === 404) {
                    setSavedZoneText('Сохранённой зоны пока нет.');
                    return;
                }

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                const zone = await response.json();

                if (
                    !zone ||
                    !Number.isFinite(zone.center_latitude) ||
                    !Number.isFinite(zone.center_longitude) ||
                    !Number.isFinite(zone.radius_m)
                ) {
                    throw new Error('Неожиданный формат зоны');
                }

                if (controller.signal.aborted) return;

                setSavedZoneText(
                    `Сохранённый центр: ${zone.center_latitude.toFixed(6)}, ` +
                    `${zone.center_longitude.toFixed(6)}\n` +
                    `Сохранённый радиус: ${zone.radius_m} м`,
                );
            } catch {
                if (!controller.signal.aborted) {
                    setSavedZoneText('Не удалось загрузить настройки зоны.');
                }
            }
        }

        void loadSavedZone();
        return () => controller.abort();
    }, [braceletId, validId, reload]);

    async function openMap() {
        if (!location) return;

        const query = encodeURIComponent(
            `${location.latitude},${location.longitude}`,
        );

        try {
            await Linking.openURL(
                `https://www.google.com/maps/search/?api=1&query=${query}`,
            );
        } catch {
            setError('Не удалось открыть карту.');
        }
    }

    return (
        <SafeAreaView style={styles.safeArea}>
            <View style={styles.container}>
                <View style={styles.header}>
                    <Pressable
                        accessibilityRole="button"
                        onPress={() => router.replace('/')}
                    >
                        <Text style={styles.link}>‹ Главная</Text>
                    </Pressable>

                    <Pressable
                        accessibilityRole="button"
                        disabled={loading || !validId}
                        onPress={() => setReload((value) => value + 1)}
                    >
                        <Text style={styles.link}>Обновить</Text>
                    </Pressable>
                </View>

                <ScrollView contentContainerStyle={styles.content}>
                    <Text style={styles.title}>Местоположение</Text>

                    {!validId ? (
                        <Text style={styles.error}>
                            Браслет не выбран. Вернись на главную и выбери устройство.
                        </Text>
                    ) : (
                        <>
                            <Text style={styles.description}>
                                Браслет №{braceletId}
                            </Text>

                            <Pressable
                                accessibilityRole="button"
                                disabled={loading || sendingLocation}
                                onPress={() => void sendMyLocation()}
                                style={styles.button}
                            >
                                <Text style={styles.buttonText}>
                                    {sendingLocation ? 'Отправляем…' : 'Отправить моё местоположение'}
                                </Text>
                            </Pressable>

                            {zoneText ? (
                                <View style={styles.card}>
                                    <Text style={styles.subtitle}>Безопасная зона</Text>
                                    <Text style={styles.description}>
                                        {savedZoneText || 'Загружаем сохранённую зону…'}
                                    </Text>
                                    {savedZoneText ? (
                                        <Text style={styles.description}>{savedZoneText}</Text>
                                    ) : null}


                                    <Text style={styles.description}>
                                        Статус: {zoneText || 'Ожидаем ответ сервера…'}
                                    </Text>

                                    <Text style={styles.description}>
                                        {location
                                            ? `Новый центр при сохранении: ${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`
                                            : 'Сначала отправь местоположение телефона.'}
                                    </Text>

                                    <Text style={styles.label}>Радиус, м</Text>
                                    <TextInput
                                        accessibilityLabel="Радиус безопасной зоны в метрах"
                                        value={zoneRadius}
                                        onChangeText={setZoneRadius}
                                        keyboardType="number-pad"
                                        editable={!savingZone}
                                        style={{
                                            color: '#163442',
                                            borderColor: '#E1ECE7',
                                            borderWidth: 1,
                                            borderRadius: 12,
                                            padding: 12,
                                        }}
                                    />

                                    <Text style={styles.note}>
                                        Сохранение заменит настройки зоны для этого браслета.
                                    </Text>

                                    <Pressable
                                        accessibilityRole="button"
                                        disabled={!location || loading || sendingLocation || savingZone}
                                        onPress={() => void saveZone()}
                                        style={styles.button}
                                    >
                                        <Text style={styles.buttonText}>
                                            {savingZone ? 'Сохраняем…' : 'Сохранить безопасную зону'}
                                        </Text>
                                    </Pressable>

                                    {zoneFeedback ? (
                                        <Text style={styles.description}>{zoneFeedback}</Text>
                                    ) : null}
                                </View>
                            ) : null}

                            {error ? (
                                <Text accessibilityRole="alert" style={styles.error}>
                                    {error}
                                </Text>
                            ) : null}

                            {loading ? (
                                <View style={styles.card}>
                                    <ActivityIndicator color="#087F70" />
                                    <Text style={styles.description}>
                                        Загружаем последнюю точку…
                                    </Text>
                                </View>
                            ) : empty ? (
                                <View style={styles.card}>
                                    <Text style={styles.subtitle}>{empty}</Text>
                                    <Text style={styles.description}>
                                        Если координат ещё нет, сначала нужно отправить
                                        местоположение в базу.
                                    </Text>
                                </View>
                            ) : location ? (
                                <>
                                    <View style={styles.card}>
                                        <Text style={styles.subtitle}>
                                            Последняя сохранённая точка
                                        </Text>

                                        <Text style={styles.label}>Широта</Text>
                                        <Text selectable style={styles.value}>
                                            {location.latitude.toFixed(6)}
                                        </Text>

                                        <Text style={styles.label}>Долгота</Text>
                                        <Text selectable style={styles.value}>
                                            {location.longitude.toFixed(6)}
                                        </Text>

                                        <Text style={styles.label}>Точность</Text>
                                        <Text style={styles.description}>
                                            {location.accuracy_m === null
                                                ? 'Не указана'
                                                : `Заявленная погрешность: ${location.accuracy_m} м`}
                                        </Text>

                                        <Text style={styles.label}>Источник</Text>
                                        <Text style={styles.description}>
                                            {location.source === 'phone'
                                                ? 'Телефон'
                                                : 'Браслет'}
                                        </Text>

                                        <Text style={styles.label}>Время определения</Text>
                                        <Text style={styles.description}>
                                            {formatDate(location.recorded_at)}
                                        </Text>

                                        <Text style={styles.label}>Получено сервером</Text>
                                        <Text style={styles.description}>
                                            {formatDate(location.received_at)}
                                        </Text>

                                        <Pressable
                                            accessibilityRole="button"
                                            onPress={() => void openMap()}
                                            style={styles.button}
                                        >
                                            <Text style={styles.buttonText}>
                                                Открыть точку на карте
                                            </Text>
                                        </Pressable>
                                    </View>

                                    <View style={styles.notice}>
                                        <Text style={styles.note}>
                                            {freshness(location.recorded_at, now)}
                                        </Text>
                                        <Text style={styles.note}>
                                            Этот экран показывает сохранённые координаты.
                                            Постоянное отслеживание и получение GPS телефона
                                            пока не подключены.
                                        </Text>
                                    </View>
                                </>
                            ) : null}
                        </>
                    )}
                </ScrollView>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: '#F4F8F7',
    },
    container: {
        flex: 1,
        width: '100%',
        maxWidth: 600,
        alignSelf: 'center',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingHorizontal: 22,
        paddingVertical: 14,
        gap: 12,
    },
    content: {
        padding: 22,
        paddingBottom: 40,
        gap: 18,
    },
    title: {
        color: '#163442',
        fontSize: 28,
        fontWeight: '800',
    },
    subtitle: {
        color: '#163442',
        fontSize: 19,
        fontWeight: '700',
    },
    label: {
        color: '#34534F',
        fontSize: 14,
        fontWeight: '600',
    },
    value: {
        color: '#087F70',
        fontSize: 24,
        fontWeight: '700',
    },
    description: {
        color: '#6C7F87',
        fontSize: 15,
        lineHeight: 23,
    },
    card: {
        backgroundColor: '#FFFFFF',
        borderRadius: 24,
        borderWidth: 1,
        borderColor: '#E1ECE7',
        padding: 22,
        gap: 12,
    },
    notice: {
        backgroundColor: '#EAF1F4',
        borderRadius: 20,
        padding: 18,
        gap: 10,
    },
    note: {
        color: '#6B818A',
        fontSize: 13,
        lineHeight: 21,
    },
    link: {
        color: '#087F70',
        fontSize: 15,
        fontWeight: '600',
        paddingVertical: 10,
    },
    button: {
        backgroundColor: '#087F70',
        borderRadius: 15,
        padding: 16,
        alignItems: 'center',
        marginTop: 10,
    },
    buttonText: {
        color: '#FFFFFF',
        fontSize: 15,
        fontWeight: '700',
        textAlign: 'center',
    },
    error: {
        color: '#A93434',
        backgroundColor: '#FFF0F0',
        borderRadius: 14,
        padding: 16,
        lineHeight: 22,
    },
});