const AUTH_STORAGE_KEY = "pm-authenticated";
const AUTH_USERNAME_STORAGE_KEY = "pm-username";

// Legacy env-var credentials for the demo account (client-side fallback)
export const AUTH_USERNAME = "user";
export const AUTH_PASSWORD = "password";

/** Client-side credential check for the demo/legacy account only. */
export const validateCredentials = (username: string, password: string): boolean => {
  return username === AUTH_USERNAME && password === AUTH_PASSWORD;
};

export const readAuthState = (): boolean => {
  if (typeof window === "undefined") return false;
  return window.sessionStorage.getItem(AUTH_STORAGE_KEY) === "true";
};

export const writeAuthState = (isAuthenticated: boolean): void => {
  if (typeof window === "undefined") return;
  if (isAuthenticated) {
    window.sessionStorage.setItem(AUTH_STORAGE_KEY, "true");
    return;
  }
  window.sessionStorage.removeItem(AUTH_STORAGE_KEY);
  window.sessionStorage.removeItem(AUTH_USERNAME_STORAGE_KEY);
};

export const writeAuthUsername = (username: string): void => {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(AUTH_USERNAME_STORAGE_KEY, username);
};

export const readAuthUsername = (): string => {
  if (typeof window === "undefined") return "";
  return window.sessionStorage.getItem(AUTH_USERNAME_STORAGE_KEY) ?? "";
};
