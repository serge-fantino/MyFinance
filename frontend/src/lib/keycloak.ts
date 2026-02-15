/**
 * Keycloak adapter — initializes and exports the Keycloak instance.
 *
 * Uses keycloak-js for OIDC authentication with Authorization Code Flow + PKCE.
 */
import Keycloak from "keycloak-js";

const keycloak = new Keycloak({
  url: import.meta.env.VITE_KEYCLOAK_URL || "http://localhost:8180",
  realm: import.meta.env.VITE_KEYCLOAK_REALM || "myfinance",
  clientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID || "myfinance-frontend",
});

export default keycloak;
