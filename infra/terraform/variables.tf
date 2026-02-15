# ─────────────────────────────────────────────────────
# Variables
# ─────────────────────────────────────────────────────

variable "hcloud_token" {
  description = "Hetzner Cloud API token"
  type        = string
  sensitive   = true
}

variable "ssh_public_key" {
  description = "SSH public key for server access"
  type        = string
}

variable "ssh_allowed_ips" {
  description = "IPs allowed to SSH into the server"
  type        = list(string)
  default     = ["0.0.0.0/0", "::/0"]
}

variable "domain" {
  description = "Domain name for the application"
  type        = string
  default     = "myfinance.example.com"
}

variable "keycloak_domain" {
  description = "Subdomain for Keycloak (auth server)"
  type        = string
  default     = "auth.myfinance.example.com"
}

variable "location" {
  description = "Hetzner datacenter location"
  type        = string
  default     = "fsn1" # Falkenstein, Germany
}

variable "server_type" {
  description = "Server type (size). cx32 recommended for Keycloak (4 vCPU, 8 GB RAM)"
  type        = string
  default     = "cx32" # 4 vCPU, 8 GB RAM — ~7.49€/month
}

variable "volume_size" {
  description = "Data volume size in GB"
  type        = number
  default     = 20
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "production"
}
