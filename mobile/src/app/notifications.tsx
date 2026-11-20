import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Linking,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { API_URL, clearToken, getToken } from '../session';

type NotificationItem = {
    id: number;
    bracelet_id: number;
    message: string;
    is_read: boolean;
    created_at: string;
};

const PAGE_SIZE = 20;

function getSosMapUrl(message: string): string | null {
    const match = /^Тестовый SOS\. Координаты:\s*(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)\s*$/.exec(message);
    if (!match) return null;

    const latitude = Number(match[1]);
    const longitude = Number(match[2]);

    if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
        return null;
    }

    const query = encodeURIComponent(`${latitude},${longitude}`);
    return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

function isNotification(value: unknown): value is NotificationItem {
    if (typeof value !== 'object' || value === null) {
        return false;
    }

    const item = value as Record<string, unknown>;

    return (
        typeof item.id === 'number' &&
        typeof item.bracelet_id === 'number' &&
        typeof item.message === 'string' &&
        typeof item.is_read === 'boolean' &&
        typeof item.created_at === 'string'
    );
}

function formatDate(value: string): string {
    const timestamp = Date.parse(value);

    return Number.isFinite(timestamp)
        ? new Date(timestamp).toLocaleString('ru-RU')
        : 'Дата отсутствует';
}

export default function NotificationsScreen() {
    const [items, setItems] = useState<NotificationItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(false);
    const [error, setError] = useState('');
    const [readingIds, setReadingIds] = useState<number[]>([]);

    const mountedRef = useRef(false);
    const listBusyRef = useRef(false);
    const offsetRef = useRef(0);
    const controllersRef = useRef(new Set<AbortController>());
    const readingRef = useRef(new Set<number>());

    const requireLogin = useCallback(() => {
        clearToken();
        router.replace('/login');
    }, []);

    const loadNotifications = useCallback(
        async (append: boolean) => {
            if (listBusyRef.current) return;

            const token = getToken();

            if (!token) {
                requireLogin();
                return;
            }

            listBusyRef.current = true;

            if (append) {
                setLoadingMore(true);
            } else {
                setLoading(true);
            }

            setError('');

            const offset = append ? offsetRef.current : 0;
            const controller = new AbortController();
            controllersRef.current.add(controller);

            const timeout = setTimeout(
                () => controller.abort(),
                90_000,
            );

            try {
                const response = await fetch(
                    `${API_URL}/notifications?limit=${PAGE_SIZE}&offset=${offset}`,
                    {
                        headers: {
                            Authorization: `Bearer ${token}`,
                        },
                        signal: controller.signal,
                    },
                );

                if (!mountedRef.current) return;

                if (response.status === 401) {
                    requireLogin();
                    return;
                }

                if (!response.ok) {
                    throw new Error(
                        `Не удалось загрузить уведомления: ${response.status}.`,
                    );
                }

                const result: unknown = await response.json();

                if (!mountedRef.current) return;

                if (
                    !Array.isArray(result) ||
                    !result.every(isNotification)
                ) {
                    throw new Error('Неожиданный формат уведомлений.');
                }

                setItems((previous) => {
                    if (!append) return result;

                    const merged = new Map<number, NotificationItem>();

                    for (const item of [...previous, ...result]) {
                        merged.set(item.id, item);
                    }

                    return Array.from(merged.values());
                });

                offsetRef.current = offset + result.length;
                setHasMore(result.length === PAGE_SIZE);
            } catch (err) {
                if (!mountedRef.current) return;

                setError(
                    controller.signal.aborted
                        ? 'Сервер долго отвечает. Попробуй обновить список.'
                        : err instanceof TypeError
                            ? 'Не удалось соединиться с сервером.'
                            : err instanceof Error
                                ? err.message
                                : 'Не удалось загрузить уведомления.',
                );
            } finally {
                clearTimeout(timeout);
                controllersRef.current.delete(controller);
                listBusyRef.current = false;

                if (mountedRef.current) {
                    setLoading(false);
                    setLoadingMore(false);
                }
            }
        },
        [requireLogin],
    );

    useEffect(() => {
        mountedRef.current = true;
        void loadNotifications(false);

        const controllers = controllersRef.current;

        return () => {
            mountedRef.current = false;

            for (const controller of controllers) {
                controller.abort();
            }
        };
    }, [loadNotifications]);

    async function markAsRead(id: number) {
        if (readingRef.current.has(id) || listBusyRef.current) {
            return;
        }

        const token = getToken();

        if (!token) {
            requireLogin();
            return;
        }

        readingRef.current.add(id);
        setReadingIds(Array.from(readingRef.current));
        setError('');

        const controller = new AbortController();
        controllersRef.current.add(controller);

        const timeout = setTimeout(
            () => controller.abort(),
            90_000,
        );

        try {
            const response = await fetch(
                `${API_URL}/notifications/${id}/read`,
                {
                    method: 'PATCH',
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                    signal: controller.signal,
                },
            );

            if (!mountedRef.current) return;

            if (response.status === 401) {
                requireLogin();
                return;
            }

            if (!response.ok) {
                throw new Error(
                    `Не удалось отметить сообщение: ${response.status}.`,
                );
            }

            const updated: unknown = await response.json();

            if (!mountedRef.current) return;

            if (!isNotification(updated) || updated.id !== id) {
                throw new Error('Неожиданный ответ сервера.');
            }

            setItems((previous) =>
                previous.map((item) =>
                    item.id === id ? updated : item,
                ),
            );
        } catch (err) {
            if (!mountedRef.current) return;

            setError(
                controller.signal.aborted
                    ? 'Ответ не получен. Обнови список, чтобы проверить статус.'
                    : err instanceof Error
                        ? err.message
                        : 'Не удалось отметить сообщение.',
            );
        } finally {
            clearTimeout(timeout);
            controllersRef.current.delete(controller);
            readingRef.current.delete(id);

            if (mountedRef.current) {
                setReadingIds(Array.from(readingRef.current));
            }
        }
    }

    const busy = loading || loadingMore;
    const unreadLoaded = items.filter((item) => !item.is_read).length;

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
                        disabled={busy || readingIds.length > 0}
                        onPress={() => void loadNotifications(false)}
                    >
                        <Text style={styles.link}>Обновить</Text>
                    </Pressable>
                </View>

                <ScrollView contentContainerStyle={styles.content}>
                    <Text style={styles.title}>Уведомления</Text>

                    <Text style={styles.description}>
                        Предупреждения твоего аккаунта.
                    </Text>

                    {!loading ? (
                        <Text style={styles.note}>
                            Непрочитанных в загруженном списке: {unreadLoaded}
                        </Text>
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
                                Загружаем уведомления…
                            </Text>
                        </View>
                    ) : items.length === 0 && !error ? (
                        <View style={styles.card}>
                            <Text style={styles.cardTitle}>
                                Уведомлений пока нет
                            </Text>
                            <Text style={styles.description}>
                                Здесь появятся сообщения, когда сработают
                                настроенные правила уведомлений.
                            </Text>
                        </View>
                    ) : (
                        items.map((item) => {
                            const reading = readingIds.includes(item.id);
                            console.log('SOS map:', item.message, getSosMapUrl(item.message));
                            const mapUrl = getSosMapUrl(item.message);

                            return (
                                <View
                                    key={item.id}
                                    style={[
                                        styles.card,
                                        !item.is_read && styles.unreadCard,
                                    ]}
                                >
                                    <Text style={styles.status}>
                                        {item.is_read ? 'Прочитано' : 'Новое'}
                                    </Text>

                                    <Text style={styles.message}>
                                        {item.message}
                                    </Text>

                                    {mapUrl && (
                                        <Pressable
                                            accessibilityRole="button"
                                            style={styles.button}
                                            onPress={() => {
                                                void Linking.openURL(mapUrl).catch(() => {
                                                    setError('Не удалось открыть карту.');
                                                });
                                            }}
                                        >
                                            <Text style={styles.buttonText}>Открыть на карте</Text>
                                        </Pressable>
                                    )}

                                    <Text style={styles.note}>
                                        Браслет №{item.bracelet_id}
                                    </Text>

                                    <Text style={styles.note}>
                                        {formatDate(item.created_at)}
                                    </Text>

                                    {!item.is_read ? (
                                        <Pressable
                                            accessibilityRole="button"
                                            disabled={reading || busy}
                                            onPress={() => void markAsRead(item.id)}
                                            style={[
                                                styles.button,
                                                (reading || busy) && styles.disabled,
                                            ]}
                                        >
                                            {reading ? (
                                                <ActivityIndicator color="#FFFFFF" />
                                            ) : (
                                                <Text style={styles.buttonText}>
                                                    Отметить прочитанным
                                                </Text>
                                            )}
                                        </Pressable>
                                    ) : null}
                                </View>
                            );
                        })
                    )}

                    {!loading && hasMore ? (
                        <Pressable
                            accessibilityRole="button"
                            disabled={busy || readingIds.length > 0}
                            onPress={() => void loadNotifications(true)}
                            style={styles.button}
                        >
                            {loadingMore ? (
                                <ActivityIndicator color="#FFFFFF" />
                            ) : (
                                <Text style={styles.buttonText}>
                                    Загрузить ещё
                                </Text>
                            )}
                        </Pressable>
                    ) : null}
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
    link: {
        color: '#087F70',
        fontSize: 15,
        fontWeight: '600',
        paddingVertical: 10,
    },
    content: {
        padding: 22,
        paddingBottom: 40,
        gap: 16,
    },
    title: {
        color: '#163442',
        fontSize: 30,
        fontWeight: '800',
    },
    description: {
        color: '#6C7F87',
        fontSize: 15,
        lineHeight: 23,
    },
    card: {
        backgroundColor: '#FFFFFF',
        borderRadius: 22,
        padding: 20,
        borderWidth: 1,
        borderColor: '#E1ECE7',
        gap: 10,
    },
    unreadCard: {
        borderColor: '#087F70',
        backgroundColor: '#F0FAF5',
    },
    cardTitle: {
        color: '#163442',
        fontSize: 19,
        fontWeight: '700',
    },
    status: {
        color: '#087F70',
        fontSize: 12,
        fontWeight: '700',
    },
    message: {
        color: '#163442',
        fontSize: 16,
        lineHeight: 24,
    },
    note: {
        color: '#73867F',
        fontSize: 13,
        lineHeight: 20,
    },
    error: {
        color: '#A93434',
        backgroundColor: '#FFF0F0',
        padding: 16,
        borderRadius: 14,
        lineHeight: 22,
    },
    button: {
        backgroundColor: '#087F70',
        padding: 15,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 48,
    },
    buttonText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '700',
        textAlign: 'center',
    },
    disabled: {
        opacity: 0.6,
    },
});