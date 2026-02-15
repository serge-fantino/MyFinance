#!/usr/bin/env bash
# Vérifier qu'Ollama utilise bien Metal (GPU) sur Mac M-series.
# Usage: ./scripts/ollama_verify_metal.sh [MODEL]
set -euo pipefail

MODEL="${1:-mistral}"
URL="http://localhost:11434"
LOG_PATHS=(
  "${HOME}/.ollama/logs/server.log"
  "${HOME}/Library/Logs/Ollama/server.log"
)

echo ""
echo "  ╔═══════════════════════════════════════════════════════╗"
echo "  ║   Vérification Ollama + Metal (Mac M-series)          ║"
echo "  ╚═══════════════════════════════════════════════════════╝"
echo ""

# 1. Ollama joignable ?
if ! curl -s --connect-timeout 2 "$URL/api/tags" >/dev/null 2>&1; then
  echo "  ✗ Ollama non joignable sur $URL"
  echo "  → Démarrer : ouvrir l'app Ollama ou 'brew services start ollama'"
  echo "  → Puis : make ollama-pull"
  echo ""
  exit 1
fi
echo "  ✓ Ollama joignable sur $URL"

# 2. Modèle présent ?
MODELS_JSON="$(curl -s "$URL/api/tags")"
if ! echo "$MODELS_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); names=[m.get('name','').split(':')[0] for m in d.get('models',[])]; sys.exit(0 if '$MODEL' in names else 1)" 2>/dev/null; then
  echo "  ⚠ Modèle '$MODEL' absent. Modèles disponibles :"
  echo "$MODELS_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); [print('    -', m.get('name','').split(':')[0]) for m in d.get('models',[])]" 2>/dev/null || true
  echo "  → Faire : ollama pull $MODEL"
  echo ""
  exit 1
fi
echo "  ✓ Modèle '$MODEL' présent"

# 3. Déclencher une inférence courte pour que le serveur charge la lib (et écrit le log si besoin)
echo "  → Envoi d’un prompt minimal pour initialiser le moteur..."
if ! curl -s -X POST "$URL/api/generate" \
  -H "Content-Type: application/json" \
  -d "{\"model\": \"$MODEL\", \"prompt\": \"Réponds par OK\", \"stream\": false}" \
  --max-time 30 >/dev/null 2>&1; then
  echo "  ⚠ La requête generate a échoué ou timeout (Ollama peut quand même utiliser Metal)."
fi

# 4. Chercher Metal dans les logs
LOG_FOUND=""
for LOG in "${LOG_PATHS[@]}"; do
  if [ -f "$LOG" ]; then
    LOG_FOUND="$LOG"
    break
  fi
done

if [ -z "$LOG_FOUND" ]; then
  echo "  ⚠ Aucun fichier de log Ollama trouvé (${LOG_PATHS[*]})."
  echo "  Sur Mac, Metal est en général utilisé par défaut. Pour confirmer :"
  echo "    1. Faire 'ollama run $MODEL' et envoyer un message."
  echo "    2. Relancer ce script ou : grep -i metal ~/.ollama/logs/server.log"
  echo ""
  exit 0
fi

if grep -q -i "metal\|llm_library.*metal" "$LOG_FOUND" 2>/dev/null; then
  echo "  ✓ Metal détecté dans les logs ($LOG_FOUND)"
  echo ""
  echo "  Ollama utilise bien le GPU (Metal). Les réponses devraient être rapides."
  echo ""
  exit 0
fi

# Pas de "metal" dans le log → peut être CPU ou autre backend
if grep -q -i "cpu\|llm_library\|library" "$LOG_FOUND" 2>/dev/null; then
  echo "  ⚠ Metal non détecté dans le log (backend CPU ou autre ?)."
  echo "  Dernières lignes pertinentes :"
  grep -i "library\|gpu\|metal\|cpu\|accelerator" "$LOG_FOUND" 2>/dev/null | tail -5 | sed 's/^/    /' || true
else
  echo "  ⚠ Le log ne contient pas encore d’info sur la lib (première inférence en cours ?)."
fi
echo ""
echo "  Pour forcer Metal : quitter l’app Ollama, puis dans un terminal :"
echo "    OLLAMA_LLM_LIBRARY=metal ollama serve"
echo "  Voir docs/TROUBLESHOOTING.md §8."
echo ""
exit 0
