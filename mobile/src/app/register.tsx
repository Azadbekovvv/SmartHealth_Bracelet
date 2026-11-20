import { Link } from 'expo-router';
import { useRef, useState } from 'react';
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

const API_URL = 'https://smarthealth-bracelet.onrender.com';

export default function RegisterScreen() {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmation, setConfirmation] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [created, setCreated] = useState(false);
    const submitting = useRef(false);

    async function handleRegister() {
        if (submitting.current) return;

        setError('');

        if (!name.trim() || !email.trim()) {
            setError('Введи имя и email.');
            return;
        }

        if (password.length < 8) {
            setError('Пароль должен содержать минимум 8 символов.');
            return;
        }

        if (password !== confirmation) {
            setError('Пароли не совпадают.');
            return;
        }

        submitting.current = true;
        setLoading(true);

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 90_000);

        try {
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
                signal: controller.signal,
            });

            if (response.status === 409) {
                throw new Error(
                    'Этот email уже зарегистрирован. Перейди ко входу.',
                );
            }

            if (response.status === 422) {
                throw new Error(
                    'Проверь формат email, имя и требования к паролю.',
                );
            }

            if (!response.ok) {
                throw new Error(`Ошибка регистрации: ${response.status}.`);
            }

            setPassword('');
            setConfirmation('');
            setCreated(true);
        } catch (err) {
            setError(
                controller.signal.aborted
                    ? 'Ответ сервера не получен вовремя. Аккаунт мог создаться — попробуй войти.'
                    : err instanceof TypeError
                        ? 'Не удалось получить ответ сервера. Аккаунт мог создаться — проверь вход перед повторной регистрацией.'
                        : err instanceof Error
                            ? err.message
                            : 'Не удалось создать аккаунт.',
            );
        } finally {
            clearTimeout(timeout);
            submitting.current = false;
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

                        {created ? (
                            <>
                                <Text style={styles.title}>Аккаунт создан</Text>
                                <Text style={styles.description}>
                                    Теперь можешь войти с указанными email и паролем.
                                </Text>

                                <Link href="/login" asChild>
                                    <Pressable
                                        accessibilityRole="button"
                                        style={styles.button}
                                    >
                                        <Text style={styles.buttonText}>Перейти ко входу</Text>
                                    </Pressable>
                                </Link>
                            </>
                        ) : (
                            <>
                                <Text style={styles.title}>Создать аккаунт</Text>
                                <Text style={styles.description}>
                                    Начни заботиться о своих привычках вместе со SmartHealth.
                                </Text>

                                <Text style={styles.label}>Имя</Text>
                                <TextInput
                                    accessibilityLabel="Имя"
                                    style={styles.input}
                                    placeholder="Как тебя зовут?"
                                    placeholderTextColor="#82938E"
                                    autoComplete="name"
                                    textContentType="name"
                                    value={name}
                                    onChangeText={setName}
                                    editable={!loading}
                                />

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
                                    textContentType="emailAddress"
                                    value={email}
                                    onChangeText={setEmail}
                                    editable={!loading}
                                />

                                <Text style={styles.label}>Пароль</Text>
                                <TextInput
                                    accessibilityLabel="Пароль"
                                    style={styles.input}
                                    placeholder="Минимум 8 символов"
                                    placeholderTextColor="#82938E"
                                    secureTextEntry
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                    autoComplete="new-password"
                                    textContentType="newPassword"
                                    value={password}
                                    onChangeText={setPassword}
                                    editable={!loading}
                                />

                                <Text style={styles.label}>Повтори пароль</Text>
                                <TextInput
                                    accessibilityLabel="Подтверждение пароля"
                                    style={styles.input}
                                    placeholder="Введи пароль ещё раз"
                                    placeholderTextColor="#82938E"
                                    secureTextEntry
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                    autoComplete="new-password"
                                    textContentType="newPassword"
                                    value={confirmation}
                                    onChangeText={setConfirmation}
                                    editable={!loading}
                                    returnKeyType="go"
                                    onSubmitEditing={() => void handleRegister()}
                                />

                                {error ? (
                                    <Text accessibilityRole="alert" style={styles.error}>
                                        {error}
                                    </Text>
                                ) : null}

                                <Pressable
                                    accessibilityRole="button"
                                    disabled={loading}
                                    onPress={() => void handleRegister()}
                                    style={[
                                        styles.button,
                                        loading && styles.disabled,
                                    ]}
                                >
                                    {loading ? (
                                        <ActivityIndicator color="#FFFFFF" />
                                    ) : (
                                        <Text style={styles.buttonText}>Создать аккаунт</Text>
                                    )}
                                </Pressable>

                                <Link href="/login" style={styles.link}>
                                    Уже есть аккаунт? Войти
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
    flex: { flex: 1 },
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
        color: '#087F70',
        fontSize: 25,
        fontWeight: '800',
        marginBottom: 28,
    },
    title: {
        color: '#163442',
        fontSize: 28,
        fontWeight: '800',
        marginBottom: 12,
    },
    description: {
        color: '#6C7F87',
        fontSize: 15,
        lineHeight: 23,
    },
    label: {
        color: '#34534F',
        fontSize: 14,
        fontWeight: '600',
        marginTop: 20,
        marginBottom: 8,
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
    button: {
        minHeight: 54,
        backgroundColor: '#087F70',
        borderRadius: 15,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 15,
        marginTop: 24,
    },
    buttonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '700',
        textAlign: 'center',
    },
    disabled: { opacity: 0.65 },
    link: {
        color: '#087F70',
        fontSize: 14,
        textAlign: 'center',
        paddingVertical: 16,
        marginTop: 8,
    },
    error: {
        color: '#A93434',
        backgroundColor: '#FFF0F0',
        padding: 13,
        borderRadius: 12,
        marginTop: 18,
        lineHeight: 21,
    },
});