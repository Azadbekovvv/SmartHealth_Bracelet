import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { API_URL, clearToken, getToken } from '../session';

type Tab = 'home' | 'activity' | 'profile';

type Profile = {
  id: number;
  name: string;
  email: string;
};

type Bracelet = {
  id: number;
  name?: string | null;
};

type CreatedBracelet = Bracelet & {
  device_key: string;
};

type Measurement = {
  id: number;
  heart_rate?: number | null;
  spo2?: number | null;
  battery_level?: number | null;
  measured_at?: string | null;
  received_at?: string | null;
};

class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isProfile(value: unknown): value is Profile {
  return (
    isObject(value) &&
    typeof value.id === 'number' &&
    typeof value.name === 'string' &&
    typeof value.email === 'string'
  );
}

function isBracelet(value: unknown): value is Bracelet {
  return (
    isObject(value) &&
    typeof value.id === 'number' &&
    (value.name == null || typeof value.name === 'string')
  );
}

function isCreatedBracelet(value: unknown): value is CreatedBracelet {
  if (!isObject(value)) {
    return false;
  }

  const deviceKey = value.device_key;

  return (
    isBracelet(value) &&
    typeof deviceKey === 'string' &&
    deviceKey.length > 0
  );
}

function isMeasurement(value: unknown): value is Measurement {
  if (!isObject(value) || typeof value.id !== 'number') {
    return false;
  }

  const validNumbers = [
    value.heart_rate,
    value.spo2,
    value.battery_level,
  ].every(
    (item) =>
      item == null ||
      (typeof item === 'number' && Number.isFinite(item)),
  );

  const validDates = [
    value.measured_at,
    value.received_at,
  ].every((item) => item == null || typeof item === 'string');

  return validNumbers && validDates;
}

async function request(
  path: string,
  token: string,
  signal: AbortSignal,
): Promise<unknown> {
  const response = await fetch(`${API_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    signal,
  });

  if (!response.ok) {
    throw new ApiError(
      response.status === 401
        ? 'Сессия закончилась. Войди снова.'
        : `Не удалось загрузить данные: ${response.status}.`,
      response.status,
    );
  }

  return response.json();
}

function measurementTime(item: Measurement): number {
  for (const value of [item.measured_at, item.received_at]) {
    if (typeof value !== 'string' || !value) continue;

    const timestamp = Date.parse(value);

    if (Number.isFinite(timestamp)) {
      return timestamp;
    }
  }

  return NaN;
}

function latestMeasurement(items: Measurement[]): Measurement | null {
  return [...items].sort((a, b) => {
    const first = measurementTime(a);
    const second = measurementTime(b);

    if (Number.isFinite(first) && Number.isFinite(second)) {
      return second - first || b.id - a.id;
    }

    if (Number.isFinite(first)) return -1;
    if (Number.isFinite(second)) return 1;

    return b.id - a.id;
  })[0] ?? null;
}

function showValue(
  value: number | null | undefined,
  unit: string,
): string {
  return typeof value === 'number'
    ? `${value} ${unit}`
    : 'Нет данных';
}

export default function HomeScreen() {
  const [tab, setTab] = useState<Tab>('home');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [bracelets, setBracelets] = useState<Bracelet[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [measurement, setMeasurement] =
    useState<Measurement | null>(null);
  const [history, setHistory] = useState<Measurement[]>([]);

  const [loading, setLoading] = useState(true);
  const [measurementsLoading, setMeasurementsLoading] = useState(false);
  const [error, setError] = useState('');
  const [measurementError, setMeasurementError] = useState('');
  const [reload, setReload] = useState(0);

  const [braceletName, setBraceletName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [deviceKey, setDeviceKey] = useState('');
  const [createdName, setCreatedName] = useState('');

  const creatingRef = useRef(false);
  const mountedRef = useRef(true);
  const createControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      createControllerRef.current?.abort();
    };
  }, []);

  const logout = useCallback(() => {
    createControllerRef.current?.abort();
    clearToken();
    setDeviceKey('');
    router.replace('/login');
  }, []);

  useEffect(() => {
    const token = getToken();

    if (!token) {
      router.replace('/login');
      return;
    }

    const authToken = token;
    let active = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90_000);

    async function loadAccount() {
      setLoading(true);
      setError('');
      setMeasurementError('');
      setMeasurement(null);
      setProfile(null);
      setBracelets([]);

      try {
        const [user, devices] = await Promise.all([
          request('/auth/me', authToken, controller.signal),
          request('/bracelets', authToken, controller.signal),
        ]);

        if (!isProfile(user)) {
          throw new Error('Неожиданный формат профиля.');
        }

        if (!Array.isArray(devices) || !devices.every(isBracelet)) {
          throw new Error('Неожиданный формат списка браслетов.');
        }

        if (!active) return;

        setProfile(user);
        setBracelets(devices);
        setSelectedId((previous) =>
          devices.some((device) => device.id === previous)
            ? previous
            : devices[0]?.id ?? null,
        );
      } catch (err) {
        if (!active) return;

        if (err instanceof ApiError && err.status === 401) {
          logout();
          return;
        }

        setError(
          controller.signal.aborted
            ? 'Сервер долго отвечает. Нажми «Обновить».'
            : err instanceof Error
              ? err.message
              : 'Не удалось загрузить аккаунт.',
        );
      } finally {
        clearTimeout(timeout);
        if (active) setLoading(false);
      }
    }

    void loadAccount();

    return () => {
      active = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [reload, logout]);

  useEffect(() => {
    if (loading || !profile || selectedId === null) return;

    const token = getToken();

    if (!token) {
      logout();
      return;
    }

    const authToken = token;
    let active = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90_000);

    setMeasurement(null);
    setMeasurementError('');
    setMeasurementsLoading(true);

    async function loadMeasurements() {
      try {
        const result = await request(
          `/bracelets/${selectedId}/measurements`,
          authToken,
          controller.signal,
        );

        if (!Array.isArray(result) || !result.every(isMeasurement)) {
          throw new Error('Неожиданный формат измерений.');
        }

        if (active) {
          setMeasurement(latestMeasurement(result));

          const sorted = [...result].sort((a, b) => {
            const first = measurementTime(a);
            const second = measurementTime(b);

            if (Number.isFinite(first) && Number.isFinite(second)) {
              return second - first || b.id - a.id;
            }

            if (Number.isFinite(first)) return -1;
            if (Number.isFinite(second)) return 1;

            return b.id - a.id;
          });

          setHistory(sorted);
        }
      } catch (err) {
        if (!active) return;

        if (err instanceof ApiError && err.status === 401) {
          logout();
          return;
        }

        setMeasurementError(
          controller.signal.aborted
            ? 'Сервер долго отвечает. Нажми «Обновить».'
            : err instanceof Error
              ? err.message
              : 'Не удалось загрузить измерения.',
        );
      } finally {
        clearTimeout(timeout);
        if (active) setMeasurementsLoading(false);
      }
    }

    void loadMeasurements();

    return () => {
      active = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [selectedId, loading, profile, logout]);

  async function createBracelet() {
    if (creatingRef.current) return;

    const name = braceletName.trim();

    if (!name) {
      setCreateError('Введи название браслета.');
      return;
    }

    const token = getToken();

    if (!token) {
      logout();
      return;
    }

    creatingRef.current = true;
    setCreating(true);
    setCreateError('');

    const controller = new AbortController();
    createControllerRef.current = controller;
    const timeout = setTimeout(() => controller.abort(), 90_000);

    try {
      const response = await fetch(`${API_URL}/bracelets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name }),
        signal: controller.signal,
      });

      if (!mountedRef.current) return;

      if (response.status === 401) {
        logout();
        return;
      }

      if (response.status === 422) {
        throw new Error('Сервер не принял название браслета.');
      }

      if (!response.ok) {
        throw new Error(
          `Ошибка создания: ${response.status}. Обнови список перед повторной попыткой.`,
        );
      }

      const result: unknown = await response.json();

      if (!mountedRef.current) return;

      if (!isCreatedBracelet(result)) {
        throw new Error(
          'Неожиданный ответ сервера. Обнови список перед повторным созданием.',
        );
      }

      const newBracelet: Bracelet = {
        id: result.id,
        name: result.name,
      };

      setBracelets((previous) => [
        newBracelet,
        ...previous.filter((item) => item.id !== newBracelet.id),
      ]);
      setSelectedId(newBracelet.id);
      setCreatedName(newBracelet.name || name);
      setDeviceKey(result.device_key);
      setBraceletName('');
    } catch (err) {
      if (!mountedRef.current) return;

      setCreateError(
        controller.signal.aborted || err instanceof TypeError
          ? 'Ответ не получен. Нажми «Обновить» и проверь список: браслет мог уже создаться. Если ключ потерян, его можно заменить через сервер.'
          : err instanceof Error
            ? err.message
            : 'Не удалось создать браслет.',
      );
    } finally {
      clearTimeout(timeout);
      createControllerRef.current = null;
      creatingRef.current = false;
      if (mountedRef.current) setCreating(false);
    }
  }

  const selected = bracelets.find(
    (bracelet) => bracelet.id === selectedId,
  );

  const timestamp = measurement ? measurementTime(measurement) : NaN;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.brand}>♡ SmartHealth</Text>

          <Pressable
            accessibilityRole="button"
            disabled={loading || creating}
            onPress={() => setReload((value) => value + 1)}
          >
            <Text style={styles.link}>Обновить</Text>
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {loading ? (
            <View style={styles.card}>
              <ActivityIndicator color="#087F70" />
              <Text style={styles.description}>
                Загружаем аккаунт с сервера…
              </Text>
            </View>
          ) : null}

          {error ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {error}
            </Text>
          ) : null}

          {!loading && profile && tab === 'home' ? (
            <>
              <Text style={styles.title}>Привет, {profile.name}!</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push('/notifications')}
                style={styles.button}
              >
                <Text style={styles.buttonText}>Уведомления</Text>
              </Pressable>
              <Text style={styles.description}>
                Здесь отображаются данные твоего аккаунта.
              </Text>

              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Мои браслеты</Text>

                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    if (!selected) return;

                    router.push({
                      pathname: '/sos',
                      params: { braceletId: String(selected.id) },
                    });
                  }}
                  style={{
                    backgroundColor: '#B42318',
                    borderRadius: 14,
                    padding: 16,
                    marginVertical: 12,
                  }}
                >
                  <Text style={{ color: '#FFFFFF', fontWeight: '700', textAlign: 'center' }}>
                    SOS · Тестовый режим
                  </Text>
                </Pressable>

                {deviceKey ? (
                  <View style={styles.keyBox}>
                    <Text style={styles.deviceName}>
                      Браслет создан: {createdName}
                    </Text>

                    <Text style={styles.note}>
                      Сохрани ключ в надёжном месте. Он нужен для
                      отправки данных от устройства. После закрытия
                      сообщения или перезагрузки страницы ключ здесь
                      больше не появится. Не публикуй его.
                    </Text>

                    <Text selectable style={styles.keyText}>
                      {deviceKey}
                    </Text>

                    <Pressable
                      accessibilityRole="button"
                      style={styles.button}
                      onPress={() => setDeviceKey('')}
                    >
                      <Text style={styles.buttonText}>
                        Сохранил ключ — закрыть
                      </Text>
                    </Pressable>
                  </View>
                ) : (
                  <>
                    <TextInput
                      accessibilityLabel="Название нового браслета"
                      placeholder="Например: Мой SmartHealth"
                      placeholderTextColor="#82938E"
                      value={braceletName}
                      onChangeText={setBraceletName}
                      editable={!creating}
                      style={styles.input}
                      onSubmitEditing={() => void createBracelet()}
                    />

                    {createError ? (
                      <Text
                        accessibilityRole="alert"
                        style={styles.error}
                      >
                        {createError}
                      </Text>
                    ) : null}

                    <Pressable
                      accessibilityRole="button"
                      disabled={creating}
                      onPress={() => void createBracelet()}
                      style={[
                        styles.button,
                        creating && styles.disabled,
                      ]}
                    >
                      {creating ? (
                        <ActivityIndicator color="#FFFFFF" />
                      ) : (
                        <Text style={styles.buttonText}>
                          Добавить браслет
                        </Text>
                      )}
                    </Pressable>
                  </>
                )}

                <Text style={styles.note}>
                  Добавление создаёт запись в базе. Подключение
                  физического браслета по Bluetooth ещё не выполнено.
                </Text>

                {bracelets.length === 0 ? (
                  <Text style={styles.description}>
                    У тебя пока нет браслетов. Введи название выше,
                    чтобы добавить первый.
                  </Text>
                ) : (
                  bracelets.map((bracelet) => (
                    <Pressable
                      key={bracelet.id}
                      accessibilityRole="button"
                      accessibilityState={{
                        selected: selectedId === bracelet.id,
                      }}
                      onPress={() => setSelectedId(bracelet.id)}
                      style={[
                        styles.device,
                        selectedId === bracelet.id &&
                        styles.selectedDevice,
                      ]}
                    >
                      <Text style={styles.deviceName}>
                        ⌚ {bracelet.name || `Браслет №${bracelet.id}`}
                      </Text>
                    </Pressable>
                  ))
                )}
              </View>

              {selected ? (
                <View style={styles.card}>
                  <Text style={styles.sectionTitle}>
                    Последние измерения
                  </Text>
                  <Text style={styles.description}>
                    {selected.name || `Браслет №${selected.id}`}
                  </Text>

                  <Pressable
                    accessibilityRole="button"
                    onPress={() =>
                      router.push({
                        pathname: '/alert-rules',
                        params: {
                          braceletId: String(selected.id),
                        },
                      })
                    }
                    style={styles.button}
                  >
                    <Text style={styles.buttonText}>
                      Настроить предупреждения
                    </Text>
                  </Pressable>

                  <Pressable
                    accessibilityRole="button"
                    onPress={() =>
                      router.push({
                        pathname: '/location',
                        params: {
                          braceletId: String(selected.id),
                        },
                      })
                    }
                    style={styles.button}
                  >
                    <Text style={styles.buttonText}>
                      Местоположение
                    </Text>
                  </Pressable>

                  {measurementsLoading ? (
                    <>
                      <ActivityIndicator color="#087F70" />
                      <Text style={styles.note}>
                        Загружаем измерения…
                      </Text>
                    </>
                  ) : measurementError ? (
                    <Text
                      accessibilityRole="alert"
                      style={styles.error}
                    >
                      {measurementError}
                    </Text>
                  ) : (
                    <>
                      <View style={styles.metricRow}>
                        <Text style={styles.description}>Пульс</Text>
                        <Text style={styles.value}>
                          {showValue(measurement?.heart_rate, 'уд/мин')}
                        </Text>
                      </View>

                      <View style={styles.metricRow}>
                        <Text style={styles.description}>SpO₂</Text>
                        <Text style={styles.value}>
                          {showValue(measurement?.spo2, '%')}
                        </Text>
                      </View>

                      <View style={styles.metricRow}>
                        <Text style={styles.description}>Заряд</Text>
                        <Text style={styles.value}>
                          {showValue(measurement?.battery_level, '%')}
                        </Text>
                      </View>

                      <Text style={styles.note}>
                        {!measurement
                          ? 'Для этого браслета измерений пока нет.'
                          : Number.isFinite(timestamp)
                            ? `Время измерения: ${new Date(timestamp).toLocaleString('ru-RU')}`
                            : 'Время измерения отсутствует.'}
                      </Text>

                      <Text style={styles.note}>
                        Сохранённые показания из базы не подтверждают,
                        что браслет сейчас подключён.
                      </Text>
                      <Text style={styles.sectionTitle}>
                        История измерений
                      </Text>

                      {history.length === 0 ? (
                        <Text style={styles.description}>
                          Измерений пока нет.
                        </Text>
                      ) : (
                        history.slice(0, 20).map((item) => {
                          const time = measurementTime(item);

                          return (
                            <View key={item.id} style={styles.device}>
                              <Text style={styles.deviceName}>
                                {Number.isFinite(time)
                                  ? new Date(time).toLocaleString('ru-RU')
                                  : `Измерение №${item.id}`}
                              </Text>

                              <Text style={styles.description}>
                                Пульс: {showValue(item.heart_rate, 'уд/мин')}
                              </Text>

                              <Text style={styles.description}>
                                SpO₂: {showValue(item.spo2, '%')}
                              </Text>

                              <Text style={styles.description}>
                                Заряд: {showValue(item.battery_level, '%')}
                              </Text>
                            </View>
                          );
                        })
                      )}

                      {history.length > 20 ? (
                        <Text style={styles.note}>
                          Показаны последние 20 измерений из загруженного списка.
                        </Text>
                      ) : null}
                    </>
                  )}
                </View>
              ) : null}

              <View style={styles.card}>
                <Text style={styles.sectionTitle}>
                  Активность сегодня
                </Text>
                <Text style={styles.description}>
                  Шаги: нет данных
                </Text>
                <Text style={styles.description}>
                  Калории: нет данных
                </Text>
                <Text style={styles.note}>
                  Подсчёт шагов и калорий ещё не подключён.
                </Text>
              </View>
            </>
          ) : null}

          {!loading && profile && tab === 'activity' ? (
            <View style={styles.card}>
              <Text style={styles.title}>Активность</Text>
              <Text style={styles.description}>
                История шагов и серии выполнения цели появятся
                после подключения сбора активности.
              </Text>
            </View>
          ) : null}

          {!loading && profile && tab === 'profile' ? (
            <View style={styles.card}>
              <Text style={styles.title}>Профиль</Text>
              <Text style={styles.sectionTitle}>{profile.name}</Text>
              <Text style={styles.description}>{profile.email}</Text>
              <Text style={styles.note}>
                Браслетов: {bracelets.length}
              </Text>

              <Pressable
                accessibilityRole="button"
                onPress={logout}
                style={styles.button}
              >
                <Text style={styles.buttonText}>Выйти</Text>
              </Pressable>
            </View>
          ) : null}
        </ScrollView>

        <View style={styles.bottomNav}>
          {[
            { key: 'home' as const, label: 'Главная' },
            { key: 'activity' as const, label: 'Активность' },
            { key: 'profile' as const, label: 'Профиль' },
          ].map((item) => (
            <Pressable
              key={item.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === item.key }}
              onPress={() => setTab(item.key)}
              style={styles.navItem}
            >
              <Text
                style={[
                  styles.navText,
                  tab === item.key && styles.activeTab,
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          ))}
        </View>
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
    paddingHorizontal: 22,
    paddingVertical: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  brand: {
    color: '#087F70',
    fontSize: 23,
    fontWeight: '800',
  },
  link: {
    color: '#087F70',
    fontSize: 14,
    fontWeight: '600',
    paddingVertical: 10,
  },
  content: {
    padding: 22,
    gap: 18,
    paddingBottom: 36,
  },
  title: {
    color: '#163442',
    fontSize: 28,
    fontWeight: '800',
  },
  sectionTitle: {
    color: '#183943',
    fontSize: 20,
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
    padding: 22,
    gap: 14,
    borderWidth: 1,
    borderColor: '#E1ECE7',
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
  keyBox: {
    padding: 16,
    borderRadius: 16,
    backgroundColor: '#E6F3EC',
    gap: 12,
  },
  keyText: {
    color: '#163442',
    fontSize: 14,
    lineHeight: 22,
  },
  device: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E1ECE7',
  },
  selectedDevice: {
    backgroundColor: '#E6F3EC',
    borderColor: '#087F70',
  },
  deviceName: {
    color: '#28534A',
    fontSize: 15,
    fontWeight: '600',
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF3F0',
  },
  value: {
    color: '#173E42',
    fontSize: 19,
    fontWeight: '700',
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
    padding: 16,
    borderRadius: 15,
    alignItems: 'center',
    marginTop: 12,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  disabled: {
    opacity: 0.6,
  },
  bottomNav: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2ECE7',
    paddingVertical: 12,
  },
  navItem: {
    flex: 1,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  navText: {
    color: '#899A95',
    fontSize: 13,
    fontWeight: '600',
  },
  activeTab: {
    color: '#087F70',
  },
});