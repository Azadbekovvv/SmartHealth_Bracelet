import { Platform } from 'react-native';

export const API_URL =
  'https://smarthealth-bracelet.onrender.com';

const TOKEN_KEY = 'smarthealth_access_token';

let accessToken: string | null = null;

export function saveToken(token: string) {
  accessToken = token;

  if (Platform.OS === 'web') {
    try {
      sessionStorage.setItem(TOKEN_KEY, token);
    } catch {
      // Если хранилище недоступно, используем память.
    }
  }
}

export function getToken(): string | null {
  if (Platform.OS === 'web') {
    try {
      return sessionStorage.getItem(TOKEN_KEY) ?? accessToken;
    } catch {
      return accessToken;
    }
  }

  return accessToken;
}

export function clearToken() {
  accessToken = null;

  if (Platform.OS === 'web') {
    try {
      sessionStorage.removeItem(TOKEN_KEY);
    } catch {
      // Токен в памяти уже удалён.
    }
  }
}