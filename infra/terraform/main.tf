# ─────────────────────────────────────────────────────
# MyFinance — Hetzner Cloud Infrastructure
# ─────────────────────────────────────────────────────

terraform {
  required_version = ">= 1.6.0"

  required_providers {
    hcloud = {
      source  = "hetznercloud/hcloud"
      version = "~> 1.45"
    }
  }
}

provider "hcloud" {
  token = var.hcloud_token
}

# ── SSH Key ───────────────────────────────────────────
resource "hcloud_ssh_key" "default" {
  name       = "myfinance-deploy"
  public_key = var.ssh_public_key
}

# ── Firewall ──────────────────────────────────────────
resource "hcloud_firewall" "web" {
  name = "myfinance-web"

  rule {
    direction = "in"
    protocol  = "tcp"
    port      = "22"
    source_ips = var.ssh_allowed_ips
  }

  rule {
    direction = "in"
    protocol  = "tcp"
    port      = "80"
    source_ips = ["0.0.0.0/0", "::/0"]
  }

  rule {
    direction = "in"
    protocol  = "tcp"
    port      = "443"
    source_ips = ["0.0.0.0/0", "::/0"]
  }
}

# ── Volume for Database ───────────────────────────────
resource "hcloud_volume" "data" {
  name     = "myfinance-data"
  size     = var.volume_size
  location = var.location
  format   = "ext4"
}

# ── Application Server ───────────────────────────────
resource "hcloud_server" "app" {
  name        = "myfinance-app"
  image       = "ubuntu-24.04"
  server_type = var.server_type
  location    = var.location
  ssh_keys    = [hcloud_ssh_key.default.id]

  firewall_ids = [hcloud_firewall.web.id]

  user_data = templatefile("${path.module}/user-data.sh", {
    domain    = var.domain
    volume_id = hcloud_volume.data.id
  })

  labels = {
    project     = "myfinance"
    environment = var.environment
  }
}

# ── Attach Volume to Server ──────────────────────────
resource "hcloud_volume_attachment" "data" {
  volume_id = hcloud_volume.data.id
  server_id = hcloud_server.app.id
  automount = true
}

# ── Floating IP (optional, for stable IP) ────────────
resource "hcloud_primary_ip" "app" {
  name          = "myfinance-ip"
  type          = "ipv4"
  assignee_type = "server"
  auto_delete   = false
  datacenter    = "${var.location}-dc14"
}
