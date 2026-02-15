#!/bin/bash
# ─────────────────────────────────────────────────────
# Cloud-init script for MyFinance server
# Provisions: Docker, Caddy (reverse proxy + TLS), data volumes
# ─────────────────────────────────────────────────────
set -euo pipefail

# Update system
apt-get update && apt-get upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh

# Install Docker Compose plugin
apt-get install -y docker-compose-plugin

# Create app user
useradd -m -s /bin/bash -G docker myfinance

# Create app directory
mkdir -p /opt/myfinance
chown myfinance:myfinance /opt/myfinance

# Mount data volume
mkdir -p /mnt/data
echo "/dev/disk/by-id/scsi-0HC_Volume_${volume_id} /mnt/data ext4 defaults 0 0" >> /etc/fstab
mount -a

# Create data directories
mkdir -p /mnt/data/postgres
mkdir -p /mnt/data/redis
mkdir -p /mnt/data/keycloak-postgres
mkdir -p /mnt/data/backups
chown -R myfinance:myfinance /mnt/data

# Install Caddy
apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt-get update && apt-get install -y caddy

# Configure Caddy — reverse proxy for all services
# Caddy handles automatic TLS via Let's Encrypt
cat > /etc/caddy/Caddyfile << 'CADDYEOF'
# ── MyFinance Application ──────────────────────────
${domain} {
    # API requests → FastAPI backend
    handle /api/* {
        reverse_proxy localhost:8000
    }

    # Everything else → React frontend (nginx)
    handle {
        reverse_proxy localhost:3000
    }
}

# ── Keycloak (auth subdomain) ─────────────────────
${keycloak_domain} {
    reverse_proxy localhost:8180
}
CADDYEOF

systemctl enable caddy
systemctl restart caddy

# Set up basic swap (helps Keycloak on small instances)
if [ ! -f /swapfile ]; then
    fallocate -l 1G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    echo "/swapfile swap swap defaults 0 0" >> /etc/fstab
fi

echo "✅ MyFinance server provisioning complete"
