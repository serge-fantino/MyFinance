export interface User {
  id: number;
  email: string;
  full_name: string;
  is_active: boolean;
  preferences: Record<string, unknown> | null;
  created_at: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  full_name: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}
