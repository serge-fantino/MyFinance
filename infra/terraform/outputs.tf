# ─────────────────────────────────────────────────────
# Outputs
# ─────────────────────────────────────────────────────

output "server_ip" {
  description = "Public IP of the application server"
  value       = hcloud_server.app.ipv4_address
}

output "server_status" {
  description = "Server status"
  value       = hcloud_server.app.status
}

output "volume_id" {
  description = "Data volume ID"
  value       = hcloud_volume.data.id
}

output "app_url" {
  description = "Application URL"
  value       = "https://${var.domain}"
}

output "keycloak_url" {
  description = "Keycloak admin URL"
  value       = "https://${var.keycloak_domain}"
}
