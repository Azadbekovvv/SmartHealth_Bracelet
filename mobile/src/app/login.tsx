import { Link, router } from 'expo-router';
import { useState } from 'react';
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { saveToken } from '../session';

const API_URL = 'https://smarthealth-bracelet.onrender.com';

type Profile = {
    id: number;
    name: string;
    email: string;
};

export default function LoginScreen() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [profile, setProfile] = useState<Profile | null>(null);

    async function handleLogin() {
        if (loading) return;

        if (!email.trim() || !password) {
            setError('Введи email и пароль.');
            return;
        }

        setLoading(true);
        setError('');

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 90_000);

        try {
            const response = await fetch(`${API_URL}/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    email: email.trim(),
                    password,
                }),
                signal: controller.signal,
            });

            if (response.status === 400 || response.status === 401) {
                throw new Error('Неверный email или пароль.');
            }

            if (response.status === 422) {
                throw new Error('Проверь формат email и пароль.');
            }

            if (!response.ok) {
                throw new Error(`Ошибка входа: ${response.status}.`);
            }

            const data = await response.json();

            if (
                typeof data.access_token !== 'string' ||
                !data.access_token
            ) {
                throw new Error('Сервер не вернул токен доступа.');
            }

            const profileResponse = await fetch(`${API_URL}/auth/me`, {
                headers: {
                    Authorization: `Bearer ${data.access_token}`,
                },
                signal: controller.signal,
            });

            if (!profileResponse.ok) {
                throw new Error('Не удалось загрузить профиль.');
            }

            const user = await profileResponse.json();

            if (
                typeof user.id !== 'number' ||
                typeof user.name !== 'string' ||
                typeof user.email !== 'string'
            ) {
                throw new Error('Неожиданный формат профиля.');
            }

            saveToken(data.access_token);
            setPassword('');
            setShowPassword(false);
            router.replace('/');
        } catch (err) {
            if (controller.signal.aborted) {
                setError('Сервер долго не отвечает. Попробуй ещё раз.');
            } else if (err instanceof TypeError) {
                setError(
                    'Не удалось соединиться с API. Возможна проблема сети или CORS.',
                );
            } else if (err instanceof Error) {
                setError(err.message);
            } else {
                setError('Не удалось войти.');
            }
        } finally {
            clearTimeout(timeout);
            setLoading(false);
        }
    }

    return (
        <SafeAreaView style={styles.safeArea}>
            <KeyboardAvoidingView
                style={styles.flex}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <ScrollView
                    contentContainerStyle={styles.content}
                    keyboardShouldPersistTaps="handled"
                >
                    <View style={styles.card}>
                        <Text style={styles.brand}>♡ SmartHealth</Text>

                        {profile ? (
                            <>
                                <Text style={styles.title}>Вход выполнен</Text>

                                <Text style={styles.description}>
                                    Сервер подтвердил твой аккаунт.
                                </Text>

                                <View style={styles.profileBox}>
                                    <Text style={styles.name}>{profile.name}</Text>
                                    <Text style={styles.description}>
                                        {profile.email}
                                    </Text>
                                </View>

                                <Text style={styles.note}>
                                    Подключение входа проверено. Следующим шагом
                                    свяжем авторизацию с главной страницей.
                                </Text>

                                <Pressable
                                    accessibilityRole="button"
                                    style={styles.button}
                                    onPress={() => {
                                        setProfile(null);
                                        setError('');
                                    }}
                                >
                                    <Text style={styles.buttonText}>
                                        Вернуться ко входу
                                    </Text>
                                </Pressable>
                            </>
                        ) : (
                            <>
                                <Text style={styles.title}>С возвращением</Text>

                                <Text style={styles.description}>
                                    Войди в свой аккаунт SmartHealth.
                                </Text>

                                <Text style={styles.label}>Email</Text>

                                <TextInput
                                    accessibilityLabel="Email"
                                    style={styles.input}
                                    placeholder="name@example.com"
                                    placeholderTextColor="#82938E"
                                    keyboardType="email-address"
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                    autoComplete="email"
                                    textContentType="username"
                                    value={email}
                                    onChangeText={setEmail}
                                    editable={!loading}
                                />

                                <Text style={styles.label}>Пароль</Text>

                                <TextInput
                                    accessibilityLabel="Пароль"
                                    style={styles.input}
                                    placeholder="Твой пароль"
                                    placeholderTextColor="#82938E"
                                    secureTextEntry={!showPassword}
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                    autoComplete="current-password"
                                    textContentType="password"
                                    value={password}
                                    onChangeText={setPassword}
                                    editable={!loading}
                                    onSubmitEditing={() => void handleLogin()}
                                    returnKeyType="go"
                                />

                                <Pressable
                                    accessibilityRole="button"
                                    accessibilityLabel={
                                        showPassword
                                            ? 'Скрыть пароль'
                                            : 'Показать пароль'
                                    }
                                    onPress={() => {
                                        setShowPassword((value) => !value);
                                    }}
                                    style={styles.passwordToggle}
                                >
                                    <Text style={styles.link}>
                                        {showPassword
                                            ? 'Скрыть пароль'
                                            : 'Показать пароль'}
                                    </Text>
                                </Pressable>

                                {error ? (
                                    <Text
                                        accessibilityRole="alert"
                                        style={styles.error}
                                    >
                                        {error}
                                    </Text>
                                ) : null}

                                <Pressable
                                    accessibilityRole="button"
                                    disabled={loading}
                                    onPress={() => void handleLogin()}
                                    style={[
                                        styles.button,
                                        loading && styles.disabled,
                                    ]}
                                >
                                    {loading ? (
                                        <ActivityIndicator color="#FFFFFF" />
                                    ) : (
                                        <Text style={styles.buttonText}>Войти</Text>
                                    )}
                                </Pressable>

                                {loading ? (
                                    <Text style={styles.note}>
                                        Подключаемся к серверу. Первый ответ может
                                        занять некоторое время.
                                    </Text>
                                ) : null}

                                <Link href="/register" style={styles.registerLink}>
                                    Нет аккаунта? Зарегистрироваться
                                </Link>
                            </>
                        )}
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    flex: {
        flex: 1,
    },
    safeArea: {
        flex: 1,
        backgroundColor: '#F4F8F7',
    },
    content: {
        flexGrow: 1,
        justifyContent: 'center',
        padding: 24,
    },
    card: {
        width: '100%',
        maxWidth: 440,
        alignSelf: 'center',
        backgroundColor: '#FFFFFF',
        borderRadius: 28,
        padding: 24,
        borderWidth: 1,
        borderColor: '#E1ECE7',
    },
    brand: {
        fontSize: 25,
        fontWeight: '800',
        color: '#087F70',
        marginBottom: 32,
    },
    title: {
        fontSize: 28,
        fontWeight: '800',
        color: '#163442',
        marginBottom: 12,
    },
    description: {
        fontSize: 15,
        lineHeight: 23,
        color: '#6C7F87',
    },
    label: {
        fontSize: 14,
        fontWeight: '600',
        color: '#34534F',
        marginTop: 22,
        marginBottom: 9,
    },
    input: {
        minHeight: 52,
        borderWidth: 1,
        borderColor: '#D8E5DF',
        borderRadius: 14,
        paddingHorizontal: 15,
        paddingVertical: 13,
        fontSize: 16,
        color: '#163442',
        backgroundColor: '#FAFCFB',
    },
    passwordToggle: {
        alignSelf: 'flex-end',
        paddingVertical: 14,
        minHeight: 44,
    },
    link: {
        color: '#087F70',
        fontWeight: '600',
        fontSize: 13,
    },
    registerLink: {
        color: '#087F70',
        textAlign: 'center',
        paddingVertical: 16,
        marginTop: 12,
        fontSize: 14,
    },
    button: {
        minHeight: 54,
        backgroundColor: '#087F70',
        borderRadius: 15,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 15,
        marginTop: 14,
    },
    buttonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '700',
        textAlign: 'center',
    },
    disabled: {
        opacity: 0.65,
    },
    error: {
        color: '#A93434',
        backgroundColor: '#FFF0F0',
        padding: 13,
        borderRadius: 12,
        fontSize: 14,
        lineHeight: 21,
    },
    note: {
        color: '#73867F',
        fontSize: 13,
        lineHeight: 20,
        marginTop: 18,
    },
    profileBox: {
        padding: 18,
        backgroundColor: '#E6F3EC',
        borderRadius: 16,
        marginTop: 24,
        gap: 6,
    },
    name: {
        color: '#28534A',
        fontSize: 20,
        fontWeight: '700',
    },
});