#!/bin/bash
# CIEE - Script de instalacion de dependencias
# Ejecutar desde la raiz del proyecto: bash setup.sh
# Compatible con Ubuntu 22.04 LTS / Railway

set -e

echo "======================================================"
echo " CIEE - Instalacion de componentes"
echo "======================================================"

# ── 1. Verificar Node.js ───────────────────────────────────
echo ""
echo "[1/5] Verificando Node.js..."
NODE_VERSION=$(node -v 2>/dev/null || echo "no encontrado")
echo "  Node.js: $NODE_VERSION"
if [[ "$NODE_VERSION" != v20* ]]; then
  echo "  ADVERTENCIA: Se recomienda Node.js v20.x LTS"
  echo "  Instalar desde: https://nodejs.org/en/download/package-manager"
fi

# ── 2. Frontend - dependencias React/Vite ─────────────────
echo ""
echo "[2/5] Instalando dependencias del Frontend (React + Vite)..."
npm install
echo "  OK - dependencias del frontend instaladas"

# ── 3. Backend - dependencias Express/Node ────────────────
echo ""
echo "[3/5] Instalando dependencias del Backend (Express)..."
cd server
npm install
cd ..
echo "  OK - dependencias del backend instaladas"

# ── 4. Chromium/ChromeDriver para Selenium (Benchmarking) ─
echo ""
echo "[4/5] Verificando Chromium para Selenium (modulo Benchmarking)..."
if command -v chromium-browser &> /dev/null || command -v google-chrome &> /dev/null; then
  echo "  OK - Chrome/Chromium ya instalado"
else
  echo "  Instalando Chromium..."
  if command -v apt-get &> /dev/null; then
    sudo apt-get update -q
    sudo apt-get install -y chromium-browser chromium-chromedriver
    echo "  OK - Chromium instalado"
  else
    echo "  AVISO: apt-get no disponible. Instalar Chrome manualmente desde:"
    echo "         https://chromedriver.chromium.org/downloads"
  fi
fi

# ── 5. Archivo .env ────────────────────────────────────────
echo ""
echo "[5/5] Verificando archivo .env del servidor..."
if [ ! -f server/.env ]; then
  if [ -f server/.env.example ]; then
    cp server/.env.example server/.env
    echo "  AVISO: Se creo server/.env desde .env.example"
    echo "  Completar las credenciales requeridas en server/.env antes de iniciar"
  else
    echo "  AVISO: No existe server/.env - crear manualmente con las variables requeridas"
  fi
else
  echo "  OK - server/.env ya existe"
fi

echo ""
echo "======================================================"
echo " Instalacion completada."
echo ""
echo " Para iniciar en desarrollo:"
echo "   Frontend:  npm run dev"
echo "   Backend:   cd server && npm run dev"
echo ""
echo " Para iniciar en produccion:"
echo "   Frontend:  npm run build  (subir /dist a Vercel)"
echo "   Backend:   cd server && npm start"
echo "======================================================"
