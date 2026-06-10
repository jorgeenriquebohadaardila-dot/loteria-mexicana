#!/usr/bin/env bash
# Instala gstack y bun en la máquina del desarrollador.
# Uso: bash setup-gstack.sh

set -e

echo "==> Verificando bun..."
if ! command -v bun &>/dev/null; then
  echo "    Instalando bun..."
  curl -fsSL https://bun.sh/install | bash
  export PATH="$HOME/.bun/bin:$PATH"
  echo "    bun instalado."
else
  echo "    bun ya está instalado: $(bun --version)"
fi

echo "==> Instalando gstack..."
if [ -d "$HOME/.claude/skills/gstack" ]; then
  echo "    gstack ya existe, actualizando..."
  git -C "$HOME/.claude/skills/gstack" pull --ff-only
else
  git clone --single-branch --depth 1 \
    https://github.com/garrytan/gstack.git \
    "$HOME/.claude/skills/gstack"
fi

cd "$HOME/.claude/skills/gstack"
export PATH="$HOME/.bun/bin:$PATH"
./setup

echo ""
echo "✅  gstack instalado correctamente."
echo "    Reinicia Claude Code para que las skills queden disponibles."
