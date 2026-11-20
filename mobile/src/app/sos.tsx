import { useState } from 'react';
import { Link, useLocalSearchParams } from 'expo-router';
import { Platform, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { API_URL, getToken } from '../session';

type SosLocation = {
    latitude: number;
    longitude: number;
};

function getSosLocation(): Promise<SosLocation | null> {
    if (
        Platform.OS !== 'web' ||
        typeof navigator === 'undefined' ||
        !navigator.geolocation
    ) {
        return Promise.resolve(null);
    }

    return new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
            ({ coords }) =>
                resolve({ latitude: coords.latitude, longitude: coords.longitude }),
            () => resolve(null),
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
        );
    });
}

export default function SosScreen() {
    const { braceletId: rawId } = useLocalSearchParams<{ braceletId?: string }>();
    const braceletId = Number(rawId);
    const validId = Number.isSafeInteger(braceletId) && braceletId > 0;

    const [busy, setBusy] = useState(false);
    const [saved, setSaved] = useState(false);
    const [message, setMessage] = useState('');

    async function sendTestSos() {
        if (!validId || busy || saved) return;

        const token = getToken();
        if (!token) {
            setMessage('Войди в аккаунт SmartHealth и попробуй ещё раз.');
            return;
        }

        setBusy(true);
        setMessage('Определяем местоположение…');

        try {
            const location = await getSosLocation().catch(() => null);
            setMessage('Сохраняем тестовый SOS…');

            const response = await fetch(
                `${API_URL}/notifications/test-sos/${braceletId}`,
                {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(location ?? {}),
                },
            );

            if (response.status === 401) {
                setMessage('Сессия истекла. Войди в аккаунт заново.');
                return;
            }
            if (response.status !== 201) {
                setMessage(`Не удалось сохранить SOS. Код сервера: ${response.status}.`);
                return;
            }

            setSaved(true);
            setMessage(
                location
                    ? 'Тестовый SOS сохранён с координатами.'
                    : 'Тестовый SOS сохранён. Местоположение недоступно.',
            );
        } catch {
            setMessage('Нет подтверждения от сервера. Проверь «Уведомления» перед повтором.');
        } finally {
            setBusy(false);
        }
    }

    return (
        <SafeAreaView
            style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#F4F8F7' }}
        >
            <View style={{ gap: 16, padding: 24, borderRadius: 24, backgroundColor: '#FFFFFF' }}>
                <Text style={{ fontSize: 28, fontWeight: '800', color: '#163442' }}>
                    Тестовый SOS
                </Text>

                <Text style={{ fontSize: 16, color: '#34534F' }}>
                    {validId
                        ? `Браслет №${braceletId}. Тест создаст запись в «Уведомлениях». Звонка в 112 не будет.`
                        : 'Вернись на главную и выбери браслет.'}
                </Text>

                {validId && !saved && (
                    <Pressable
                        accessibilityRole="button"
                        disabled={busy}
                        onPress={() => void sendTestSos()}
                        style={{
                            padding: 16,
                            borderRadius: 14,
                            backgroundColor: '#B42318',
                            opacity: busy ? 0.6 : 1,
                        }}
                    >
                        <Text style={{ color: '#FFFFFF', fontWeight: '700', textAlign: 'center' }}>
                            {busy ? 'Отправляем…' : 'Подтвердить тест'}
                        </Text>
                    </Pressable>
                )}

                {message !== '' && (
                    <Text accessibilityLiveRegion="polite" style={{ color: '#34534F' }}>
                        {message}
                    </Text>
                )}

                <Link href="/" replace style={{ color: '#087F70', textAlign: 'center' }}>
                    На главную
                </Link>
            </View>
        </SafeAreaView>
    );
}