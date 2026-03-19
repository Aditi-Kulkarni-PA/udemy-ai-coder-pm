import {
  AUTH_PASSWORD,
  AUTH_USERNAME,
  readAuthState,
  readAuthUsername,
  validateCredentials,
  writeAuthState,
  writeAuthUsername,
} from "@/lib/auth";

describe("auth utilities", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("validates demo credentials", () => {
    expect(validateCredentials(AUTH_USERNAME, AUTH_PASSWORD)).toBe(true);
    expect(validateCredentials("user", "wrong")).toBe(false);
    expect(validateCredentials("wrong", "password")).toBe(false);
  });

  it("persists and clears auth state", () => {
    expect(readAuthState()).toBe(false);

    writeAuthState(true);
    expect(readAuthState()).toBe(true);

    writeAuthState(false);
    expect(readAuthState()).toBe(false);
  });

  it("persists username while authenticated", () => {
    expect(readAuthUsername()).toBe("");

    writeAuthUsername("user");
    expect(readAuthUsername()).toBe("user");

    writeAuthState(false);
    expect(readAuthUsername()).toBe("");
  });
});
