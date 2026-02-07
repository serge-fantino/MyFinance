#!/bin/bash
# ─────────────────────────────────────────────────────
# Cloud-init script for MyFinance server
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
mkdir -p /mnt/data/backups
chown -R myfinance:myfinance /mnt/data

# Install Caddy
apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt-get update && apt-get install -y caddy

# Configure Caddy
cat > /etc/caddy/Caddyfile << 'EOF'
${domain} {
    reverse_proxy /api/* localhost:8000
    reverse_proxy localhost:3000
}
EOF

systemctl enable caddy
systemctl restart caddy

echo "✅ MyFinance server provisioning complete"
