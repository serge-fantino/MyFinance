#!/usr/bin/env bash
# Install Ollama natively on macOS (for GPU Metal on M-series)
set -euo pipefail

echo ""
echo "  ╔═══════════════════════════════════════╗"
echo "  ║   MyFinance — Install Ollama (Mac)   ║"
echo "  ╚═══════════════════════════════════════╝"
echo ""

OS="$(uname -s)"
ARCH="$(uname -m)"

if [ "$OS" != "Darwin" ]; then
  echo "[ERROR] This script is intended for macOS only."
  exit 1
fi

if [ "$ARCH" != "arm64" ]; then
  echo "[WARN] Detected architecture: $ARCH (expected arm64 for Apple Silicon)."
  echo "       Ollama will run, but GPU Metal acceleration is only available on M-series."
fi

if ! command -v brew >/dev/null 2>&1; then
  echo "[ERROR] Homebrew is not installed."
  echo "        Install it first: https://brew.sh/"
  exit 1
fi

echo "[INFO] Installing Ollama via Homebrew (GUI app)..."
if brew list --cask ollama >/dev/null 2>&1; then
  echo "[OK] Ollama cask already installed."
else
  brew install --cask ollama
fi

echo ""
echo "[INFO] Starting Ollama service (if not already running)..."
brew services start ollama || true

echo ""
echo "[INFO] Pulling default model 'mistral' (can be changed via LLM_MODEL)..."
ollama pull mistral || true

echo ""
echo "[OK] Ollama is installed and configured."
echo "    - Service:    http://localhost:11434"
echo "    - Models:     'ollama list'"
echo "    - Default model pulled: mistral"
echo ""
echo "On Apple Silicon (M1/M2/M3/M4), Metal (GPU) is used by default."
echo "To verify Metal is active:  make ollama-verify-metal"
echo ""
echo "If responses are slow (Metal not used), quit the Ollama app and run:"
echo "  OLLAMA_LLM_LIBRARY=metal ollama serve"
echo ""
echo "Next steps:"
echo "  1. Ensure the backend uses LLM_BASE_URL=http://localhost:11434"
echo "  2. Set LLM_UI_ENABLED=true in backend/.env to show the LLM button in Suggestions."
echo "  3. In MyFinance, use the 'Interpréter (LLM)' button in Suggestions."
echo ""

