import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Pressable,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { API_URL, clearToken, getToken } from '../session';

type Metric = 'heart_rate' | 'spo2' | 'battery_level';

type Rule = {
    id: number;
    bracelet_id: number;
    metric: Metric;
    min_value: number | null;
    max_value: number | null;
    enabled: boolean;
    cooldown_seconds: number;
};

const METRICS: { value: Metric; label: string }[] = [
    { value: 'heart_rate', label: 'Пульс' },
    { value: 'spo2', label: 'SpO₂' },
    { value: 'battery_level', label: 'Заряд' },
];

function isRule(value: unknown): value is Rule {
    if (typeof value !== 'object' || value === null) return false;

    const item = value as Record<string, unknown>;

    return (
        typeof item.id === 'number' &&
        typeof item.bracelet_id === 'number' &&
        METRICS.some((metric) => metric.value === item.metric) &&
        typeof item.enabled === 'boolean' &&
        typeof item.cooldown_seconds === 'number' &&
        [item.min_value, item.max_value].every(
            (boundary) =>
                boundary === null ||
                (typeof boundary === 'number' && Number.isFinite(boundary)),
        )
    );
}

function readNumber(text: string): number | null {
    const cleaned = text.trim().replace(',', '.');

    if (!cleaned) return null;

    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(cleaned)) {
        throw new Error('В границах укажи числа, например 20 или 95,5.');
    }

    const number = Number(cleaned);

    if (!Number.isFinite(number)) {
        throw new Error('Укажи корректное число.');
    }

    return number;
}

export default function AlertRulesScreen() {
    const params = useLocalSearchParams<{
        braceletId?: string | string[];
    }>();

    const rawId = Array.isArray(params.braceletId)
        ? params.braceletId[0]
        : params.braceletId;

    const braceletId = Number(rawId);
    const validId = Number.isSafeInteger(braceletId) && braceletId > 0;

    const [rules, setRules] = useState<Rule[]>([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [reload, setReload] = useState(0);

    const [editingId, setEditingId] = useState<number | null>(null);
    const [metric, setMetric] = useState<Metric>('battery_level');
    const [minimum, setMinimum] = useState('');
    const [maximum, setMaximum] = useState('');
    const [cooldown, setCooldown] = useState('300');
    const [enabled, setEnabled] = useState(true);

    const [deleteId, setDeleteId] = useState<number | null>(null);
    const busyRef = useRef(false);
    const mountedRef = useRef(false);
    const mutationRef = useRef<AbortController | null>(null);

    useEffect(() => {
        mountedRef.current = true;

        return () => {
            mountedRef.current = false;
            mutationRef.current?.abort();
        };
    }, []);

    function resetForm() {
        setEditingId(null);
        setMetric('battery_level');
        setMinimum('');
        setMaximum('');
        setCooldown('300');
        setEnabled(true);
    }

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

        async function load() {
            setLoading(true);
            setError('');

            try {
                const response = await fetch(
                    `${API_URL}/bracelets/${braceletId}/alert-rules`,
                    {
                        headers: { Authorization: `Bearer ${token}` },
                        signal: controller.signal,
                    },
                );

                if (!active) return;

                if (response.status === 401) {
                    clearToken();
                    router.replace('/login');
                    return;
                }

                if (!response.ok) {
                    throw new Error(`Ошибка загрузки: ${response.status}.`);
                }

                const data: unknown = await response.json();

                if (!active) return;

                if (!Array.isArray(data) || !data.every(isRule)) {
                    throw new Error('Неожиданный формат правил.');
                }

                setRules(data);
            } catch (err) {
                if (!active) return;

                setError(
                    controller.signal.aborted
                        ? 'Сервер долго отвечает. Попробуй обновить список.'
                        : err instanceof Error
                            ? err.message
                            : 'Не удалось загрузить правила.',
                );
            } finally {
                clearTimeout(timeout);
                if (active) setLoading(false);
            }
        }

        void load();

        return () => {
            active = false;
            clearTimeout(timeout);
            controller.abort();
        };
    }, [braceletId, validId, reload]);

    async function mutate(
        method: 'POST' | 'PATCH' | 'DELETE',
        ruleId: number | null,
        body?: object,
    ) {
        if (busyRef.current || loading || !validId) return;

        const token = getToken();

        if (!token) {
            router.replace('/login');
            return;
        }

        busyRef.current = true;
        setBusy(true);
        setError('');
        setSuccess('');

        const controller = new AbortController();
        mutationRef.current = controller;
        const timeout = setTimeout(() => controller.abort(), 90_000);

        const suffix = ruleId === null ? '' : `/${ruleId}`;

        try {
            const response = await fetch(
                `${API_URL}/bracelets/${braceletId}/alert-rules${suffix}`,
                {
                    method,
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                    body: body ? JSON.stringify(body) : undefined,
                    signal: controller.signal,
                },
            );

            if (!mountedRef.current) return;

            if (response.status === 401) {
                clearToken();
                router.replace('/login');
                return;
            }

            if (!response.ok) {
                throw new Error(
                    response.status === 422
                        ? 'Сервер отклонил настройки. Проверь границы и интервал.'
                        : `Не удалось сохранить изменение: ${response.status}.`,
                );
            }

            if (method === 'DELETE') {
                setRules((previous) =>
                    previous.filter((rule) => rule.id !== ruleId),
                );
                setDeleteId(null);
                if (editingId === ruleId) resetForm();
                setSuccess('Правило удалено.');
                return;
            }

            const result: unknown = await response.json();

            if (!mountedRef.current) return;

            if (!isRule(result)) {
                throw new Error(
                    'Неожиданный ответ. Обнови список перед повторной попыткой.',
                );
            }

            setRules((previous) =>
                method === 'POST'
                    ? [...previous, result]
                    : previous.map((rule) =>
                        rule.id === result.id ? result : rule,
                    ),
            );

            if (method === 'POST' || ruleId === editingId) {
                resetForm();
            }

            setSuccess('Настройки сохранены.');
        } catch (err) {
            if (!mountedRef.current) return;

            setError(
                controller.signal.aborted || err instanceof TypeError
                    ? 'Ответ не получен. Обнови список перед повторной попыткой: изменение могло сохраниться.'
                    : err instanceof Error
                        ? err.message
                        : 'Не удалось выполнить действие.',
            );
        } finally {
            clearTimeout(timeout);
            mutationRef.current = null;
            busyRef.current = false;
            if (mountedRef.current) setBusy(false);
        }
    }

    function saveRule() {
        if (busyRef.current || loading) return;

        setError('');
        setSuccess('');

        try {
            const min = readNumber(minimum);
            const max = readNumber(maximum);

            if (min === null && max === null) {
                throw new Error('Укажи хотя бы одну границу.');
            }

            if (min !== null && max !== null && min > max) {
                throw new Error('Минимум не может быть больше максимума.');
            }

            for (const boundary of [min, max]) {
                if (boundary === null) continue;

                if (metric === 'heart_rate' && boundary <= 0) {
                    throw new Error('Граница пульса должна быть больше нуля.');
                }

                if (
                    metric !== 'heart_rate' &&
                    (boundary < 0 || boundary > 100)
                ) {
                    throw new Error('Для SpO₂ и заряда допустимы границы от 0 до 100.');
                }
            }

            if (!/^\d+$/.test(cooldown.trim())) {
                throw new Error('Интервал — целое число секунд, от 0.');
            }

            const seconds = Number(cooldown.trim());

            if (!Number.isSafeInteger(seconds)) {
                throw new Error('Укажи меньший интервал.');
            }

            void mutate(
                editingId === null ? 'POST' : 'PATCH',
                editingId,
                {
                    metric,
                    min_value: min,
                    max_value: max,
                    enabled,
                    cooldown_seconds: seconds,
                },
            );
        } catch (err) {
            setError(
                err instanceof Error ? err.message : 'Проверь поля.',
            );
        }
    }

    function editRule(rule: Rule) {
        setEditingId(rule.id);
        setMetric(rule.metric);
        setMinimum(rule.min_value === null ? '' : String(rule.min_value));
        setMaximum(rule.max_value === null ? '' : String(rule.max_value));
        setCooldown(String(rule.cooldown_seconds));
        setEnabled(rule.enabled);
        setError('');
        setSuccess('');
        setDeleteId(null);
    }

    const disabled = loading || busy;

    return (
        <SafeAreaView style={styles.safeArea}>
            <View style={styles.container}>
                <View style={styles.header}>
                    <Pressable onPress={() => router.replace('/')}>
                        <Text style={styles.link}>‹ Главная</Text>
                    </Pressable>

                    <Pressable
                        disabled={disabled}
                        onPress={() => setReload((value) => value + 1)}
                    >
                        <Text style={styles.link}>Обновить</Text>
                    </Pressable>
                </View>

                <ScrollView
                    contentContainerStyle={styles.content}
                    keyboardShouldPersistTaps="handled"
                >
                    <Text style={styles.title}>Правила уведомлений</Text>

                    {!validId ? (
                        <Text style={styles.error}>
                            Браслет не выбран. Вернись на главную и выбери устройство.
                        </Text>
                    ) : (
                        <>
                            <Text style={styles.note}>Браслет №{braceletId}</Text>

                            {loading ? (
                                <ActivityIndicator color="#087F70" />
                            ) : null}

                            {error ? (
                                <Text accessibilityRole="alert" style={styles.error}>
                                    {error}
                                </Text>
                            ) : null}

                            {success ? (
                                <Text style={styles.success}>{success}</Text>
                            ) : null}

                            <View style={styles.card}>
                                <Text style={styles.subtitle}>
                                    {editingId === null
                                        ? 'Новое правило'
                                        : `Изменение правила №${editingId}`}
                                </Text>

                                <View style={styles.choices}>
                                    {METRICS.map((item) => (
                                        <Pressable
                                            key={item.value}
                                            disabled={disabled}
                                            onPress={() => setMetric(item.value)}
                                            style={[
                                                styles.choice,
                                                metric === item.value && styles.selected,
                                            ]}
                                        >
                                            <Text style={styles.choiceText}>{item.label}</Text>
                                        </Pressable>
                                    ))}
                                </View>

                                <Text style={styles.label}>Нижняя граница</Text>
                                <TextInput
                                    accessibilityLabel="Нижняя граница"
                                    value={minimum}
                                    onChangeText={setMinimum}
                                    placeholder="Не задана"
                                    keyboardType="decimal-pad"
                                    editable={!disabled}
                                    style={styles.input}
                                />

                                <Text style={styles.label}>Верхняя граница</Text>
                                <TextInput
                                    accessibilityLabel="Верхняя граница"
                                    value={maximum}
                                    onChangeText={setMaximum}
                                    placeholder="Не задана"
                                    keyboardType="decimal-pad"
                                    editable={!disabled}
                                    style={styles.input}
                                />

                                <Text style={styles.note}>
                                    Можно оставить одну границу пустой.
                                    Пульс — уд/мин, SpO₂ и заряд — проценты.
                                </Text>

                                <Text style={styles.label}>
                                    Интервал между предупреждениями, секунд
                                </Text>
                                <TextInput
                                    accessibilityLabel="Интервал в секундах"
                                    value={cooldown}
                                    onChangeText={setCooldown}
                                    keyboardType="number-pad"
                                    editable={!disabled}
                                    style={styles.input}
                                />

                                <View style={styles.row}>
                                    <Text style={styles.label}>Правило включено</Text>
                                    <Switch
                                        value={enabled}
                                        onValueChange={setEnabled}
                                        disabled={disabled}
                                    />
                                </View>

                                <Pressable
                                    disabled={disabled}
                                    onPress={saveRule}
                                    style={[styles.button, disabled && styles.disabled]}
                                >
                                    {busy ? (
                                        <ActivityIndicator color="#FFFFFF" />
                                    ) : (
                                        <Text style={styles.buttonText}>
                                            {editingId === null
                                                ? 'Создать правило'
                                                : 'Сохранить изменения'}
                                        </Text>
                                    )}
                                </Pressable>

                                {editingId !== null ? (
                                    <Pressable disabled={busy} onPress={resetForm}>
                                        <Text style={styles.link}>Отменить редактирование</Text>
                                    </Pressable>
                                ) : null}
                            </View>

                            <Text style={styles.subtitle}>Сохранённые правила</Text>

                            {!loading && rules.length === 0 ? (
                                <Text style={styles.note}>Правил пока нет.</Text>
                            ) : null}

                            {rules.map((rule) => (
                                <View key={rule.id} style={styles.card}>
                                    <View style={styles.row}>
                                        <Text style={styles.subtitle}>
                                            {METRICS.find((item) => item.value === rule.metric)?.label}
                                        </Text>

                                        <Switch
                                            value={rule.enabled}
                                            disabled={disabled}
                                            onValueChange={(value) => {
                                                void mutate('PATCH', rule.id, { enabled: value });
                                            }}
                                        />
                                    </View>

                                    <Text style={styles.note}>
                                        Нижняя граница: {rule.min_value ?? 'не задана'}
                                    </Text>
                                    <Text style={styles.note}>
                                        Верхняя граница: {rule.max_value ?? 'не задана'}
                                    </Text>
                                    <Text style={styles.note}>
                                        Интервал: {rule.cooldown_seconds} сек.
                                    </Text>
                                    <Text style={styles.note}>
                                        {rule.enabled ? 'Включено' : 'Выключено'}
                                    </Text>

                                    <Pressable
                                        disabled={disabled}
                                        onPress={() => editRule(rule)}
                                    >
                                        <Text style={styles.link}>
                                            Изменить — форма выше
                                        </Text>
                                    </Pressable>

                                    {deleteId === rule.id ? (
                                        <>
                                            <Text style={styles.note}>
                                                Удалить это правило?
                                            </Text>

                                            <Pressable
                                                disabled={disabled}
                                                onPress={() => void mutate('DELETE', rule.id)}
                                            >
                                                <Text style={styles.danger}>Да, удалить</Text>
                                            </Pressable>

                                            <Pressable
                                                disabled={disabled}
                                                onPress={() => setDeleteId(null)}
                                            >
                                                <Text style={styles.link}>Отмена</Text>
                                            </Pressable>
                                        </>
                                    ) : (
                                        <Pressable
                                            disabled={disabled}
                                            onPress={() => setDeleteId(rule.id)}
                                        >
                                            <Text style={styles.danger}>Удалить</Text>
                                        </Pressable>
                                    )}
                                </View>
                            ))}
                        </>
                    )}
                </ScrollView>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: '#F4F8F7' },
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
    },
    content: { padding: 22, paddingBottom: 40, gap: 16 },
    title: { fontSize: 28, fontWeight: '800', color: '#163442' },
    subtitle: { fontSize: 19, fontWeight: '700', color: '#163442' },
    label: { fontSize: 14, fontWeight: '600', color: '#34534F' },
    note: { fontSize: 14, lineHeight: 22, color: '#6C7F87' },
    card: {
        padding: 20,
        borderRadius: 22,
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: '#E1ECE7',
        gap: 14,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
    },
    choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    choice: {
        paddingHorizontal: 14,
        paddingVertical: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#D8E5DF',
    },
    selected: { backgroundColor: '#DDF3E9', borderColor: '#087F70' },
    choiceText: { color: '#28534A', fontWeight: '600' },
    input: {
        borderWidth: 1,
        borderColor: '#D8E5DF',
        borderRadius: 14,
        padding: 14,
        minHeight: 50,
        fontSize: 16,
        color: '#163442',
        backgroundColor: '#FAFCFB',
    },
    button: {
        minHeight: 50,
        padding: 15,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#087F70',
    },
    buttonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
    link: { color: '#087F70', fontWeight: '600', paddingVertical: 10 },
    danger: { color: '#A93434', fontWeight: '600', paddingVertical: 10 },
    error: {
        color: '#A93434',
        backgroundColor: '#FFF0F0',
        padding: 15,
        borderRadius: 14,
        lineHeight: 22,
    },
    success: {
        color: '#176C59',
        backgroundColor: '#DDF3E9',
        padding: 15,
        borderRadius: 14,
    },
    disabled: { opacity: 0.6 },
});