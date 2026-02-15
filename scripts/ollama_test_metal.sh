#!/usr/bin/env bash
# Test Ollama en interactif et vérifier l’optimisation Metal (Mac)
# Usage: ./scripts/ollama_test_metal.sh [MODEL]
set -euo pipefail

MODEL="${1:-mistral}"
LOG_FILE="${HOME}/.ollama/logs/server.log"

echo ""
echo "  ╔═══════════════════════════════════════════════════════╗"
echo "  ║   Test Ollama + vérification Metal (Mac M-series)     ║"
echo "  ╚═══════════════════════════════════════════════════════╝"
echo ""

if ! command -v ollama >/dev/null 2>&1; then
  echo "  ✗ Ollama introuvable. Installer avec: make install-ollama-mac"
  exit 1
fi

echo "  1. Infos modèle et accélération (ollama show $MODEL --verbose)"
echo "  ─────────────────────────────────────────────────────────"
if ollama show "$MODEL" --verbose 2>/dev/null; then
  echo ""
else
  echo "  ⚠ Modèle '$MODEL' absent ou erreur. Faire: ollama pull $MODEL"
  echo ""
fi

echo "  2. Tester en interactif"
echo "  ─────────────────────────────────────────────────────────"
echo "  Lancer un chat avec le modèle :"
echo ""
echo "    ollama run $MODEL"
echo ""
echo "  Tu peux taper une question (ex: « En une phrase, c’est quoi la pluie ? »)"
echo "  et voir la vitesse de réponse. Avec Metal (GPU), la première réponse"
echo "  est en général plus rapide qu’en CPU seul."
echo ""

echo "  3. Vérifier si Metal (GPU) est utilisé"
echo "  ─────────────────────────────────────────────────────────"
if [ -f "$LOG_FILE" ]; then
  if grep -q -i "metal\|gpu\|accelerator" "$LOG_FILE" 2>/dev/null; then
    echo "  Dernières lignes du serveur mentionnant GPU/Metal :"
    grep -i "metal\|gpu\|accelerator\|library" "$LOG_FILE" 2>/dev/null | tail -5 | sed 's/^/    /'
  else
    echo "  Fichier de log : $LOG_FILE"
    echo "  Pour voir si Metal est chargé :"
    echo "    grep -i metal $LOG_FILE"
    echo "  Tu dois voir quelque chose comme OLLAMA_LLM_LIBRARY=metal ou 'library=metal'."
  fi
else
  echo "  Log serveur : $LOG_FILE (pas encore créé tant qu’aucun prompt n’a été envoyé)."
  echo "  Après avoir fait 'ollama run $MODEL' et envoyé un message, relancer :"
  echo "    grep -i metal $LOG_FILE"
fi
echo ""

echo "  4. Option : surveiller l’usage GPU pendant un prompt"
echo "  ─────────────────────────────────────────────────────────"
echo "  Ouvrir le Moniteur d’activité (Activity Monitor) :"
echo "  Fenêtre → Historique GPU (ou GPU History)."
echo "  Lancer 'ollama run $MODEL', envoyer un message : si le GPU bouge, Metal est utilisé."
echo ""

echo "  Pour lancer le chat maintenant : ollama run $MODEL"
echo ""
