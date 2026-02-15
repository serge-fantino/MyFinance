/**
 * Amazon Cognito adapter — Hosted UI (OAuth2 Authorization Code + PKCE).
 *
 * Uses Cognito's built-in OAuth2 endpoints for login/register/logout.
 * Tokens are exchanged via the Authorization Code flow with PKCE.
 */

const COGNITO_REGION = import.meta.env.VITE_COGNITO_REGION || "eu-west-3";
const COGNITO_USER_POOL_ID = import.meta.env.VITE_COGNITO_USER_POOL_ID || "";
const COGNITO_CLIENT_ID = import.meta.env.VITE_COGNITO_CLIENT_ID || "";
const COGNITO_DOMAIN = import.meta.env.VITE_COGNITO_DOMAIN || "";

const REDIRECT_URI = `${window.location.origin}/auth/callback`;
const LOGOUT_URI = `${window.location.origin}/login`;

// ── PKCE Helpers ──────────────────────────────────
function generateRandomString(length: number): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(36).padStart(2, "0"))
    .join("")
    .slice(0, length);
}

async function sha256(plain: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  return crypto.subtle.digest("SHA-256", encoder.encode(plain));
}

function base64URLEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// ── Token Types ───────────────────────────────────
export interface CognitoTokens {
  access_token: string;
  id_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

// ── Storage Keys ──────────────────────────────────
const STORAGE_KEYS = {
  ACCESS_TOKEN: "cognito_access_token",
  ID_TOKEN: "cognito_id_token",
  REFRESH_TOKEN: "cognito_refresh_token",
  CODE_VERIFIER: "cognito_code_verifier",
} as const;

// ── Public API ────────────────────────────────────
export const cognito = {
  get tokenEndpoint() {
    return `https://${COGNITO_DOMAIN}.auth.${COGNITO_REGION}.amazoncognito.com/oauth2/token`;
  },

  get authorizeEndpoint() {
    return `https://${COGNITO_DOMAIN}.auth.${COGNITO_REGION}.amazoncognito.com/oauth2/authorize`;
  },

  get logoutEndpoint() {
    return `https://${COGNITO_DOMAIN}.auth.${COGNITO_REGION}.amazoncognito.com/logout`;
  },

  get issuerUrl() {
    return `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/${COGNITO_USER_POOL_ID}`;
  },

  /** Redirect to Cognito Hosted UI for login. */
  async login(): Promise<void> {
    const codeVerifier = generateRandomString(64);
    sessionStorage.setItem(STORAGE_KEYS.CODE_VERIFIER, codeVerifier);

    const codeChallenge = base64URLEncode(await sha256(codeVerifier));

    const params = new URLSearchParams({
      response_type: "code",
      client_id: COGNITO_CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      scope: "openid email profile",
      code_challenge_method: "S256",
      code_challenge: codeChallenge,
    });

    window.location.href = `${this.authorizeEndpoint}?${params}`;
  },

  /** Redirect to Cognito Hosted UI for registration. */
  async register(): Promise<void> {
    const codeVerifier = generateRandomString(64);
    sessionStorage.setItem(STORAGE_KEYS.CODE_VERIFIER, codeVerifier);

    const codeChallenge = base64URLEncode(await sha256(codeVerifier));

    const params = new URLSearchParams({
      response_type: "code",
      client_id: COGNITO_CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      scope: "openid email profile",
      code_challenge_method: "S256",
      code_challenge: codeChallenge,
    });

    // Cognito doesn't have a separate /register endpoint in Hosted UI,
    // but the signup link is available on the login page.
    window.location.href = `${this.authorizeEndpoint}?${params}`;
  },

  /** Exchange authorization code for tokens (PKCE). */
  async handleCallback(code: string): Promise<CognitoTokens> {
    const codeVerifier = sessionStorage.getItem(STORAGE_KEYS.CODE_VERIFIER);
    if (!codeVerifier) {
      throw new Error("Missing PKCE code verifier");
    }
    sessionStorage.removeItem(STORAGE_KEYS.CODE_VERIFIER);

    const response = await fetch(this.tokenEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: COGNITO_CLIENT_ID,
        code,
        redirect_uri: REDIRECT_URI,
        code_verifier: codeVerifier,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token exchange failed: ${error}`);
    }

    const tokens: CognitoTokens = await response.json();
    this.storeTokens(tokens);
    return tokens;
  },

  /** Refresh the access token using the refresh token. */
  async refreshTokens(): Promise<CognitoTokens | null> {
    const refreshToken = localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
    if (!refreshToken) return null;

    try {
      const response = await fetch(this.tokenEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: COGNITO_CLIENT_ID,
          refresh_token: refreshToken,
        }),
      });

      if (!response.ok) return null;

      const tokens: CognitoTokens = await response.json();
      // Cognito doesn't return a new refresh_token on refresh
      tokens.refresh_token = refreshToken;
      this.storeTokens(tokens);
      return tokens;
    } catch {
      return null;
    }
  },

  /** Redirect to Cognito logout. */
  logout(): void {
    this.clearTokens();

    const params = new URLSearchParams({
      client_id: COGNITO_CLIENT_ID,
      logout_uri: LOGOUT_URI,
    });

    window.location.href = `${this.logoutEndpoint}?${params}`;
  },

  /** Store tokens in localStorage. */
  storeTokens(tokens: CognitoTokens): void {
    localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, tokens.access_token);
    localStorage.setItem(STORAGE_KEYS.ID_TOKEN, tokens.id_token);
    if (tokens.refresh_token) {
      localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, tokens.refresh_token);
    }
  },

  /** Clear all stored tokens. */
  clearTokens(): void {
    localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.ID_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
  },

  /** Get the current access token. */
  get accessToken(): string | null {
    return localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
  },

  /** Get the current ID token. */
  get idToken(): string | null {
    return localStorage.getItem(STORAGE_KEYS.ID_TOKEN);
  },

  /** Check if the user has tokens stored. */
  get isAuthenticated(): boolean {
    return !!this.accessToken;
  },
};
