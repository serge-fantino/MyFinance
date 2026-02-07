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

variable "location" {
  description = "Hetzner datacenter location"
  type        = string
  default     = "fsn1" # Falkenstein, Germany
}

variable "server_type" {
  description = "Server type (size)"
  type        = string
  default     = "cx22" # 2 vCPU, 4 GB RAM — ~4.35€/month
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
