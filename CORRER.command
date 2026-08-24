#!/bin/bash
# Para macOS: doble clic. Si no abre, boton derecho > Abrir.
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo; echo "  No encuentro Node. Instalalo desde https://nodejs.org y volvé a probar."; echo
  read -n 1 -s -r -p "  Enter para cerrar"; exit 1
fi
echo
echo "  Tres pasos. Tarda unos minutos, no cierres la ventana."
echo "    1. Probar el pipeline (dos segundos, sin internet)"
echo "    2. Resolver los canales de YouTube"
echo "    3. Bajar todas las fuentes y armar los 30 feeds"
echo
{ node probar.mjs; echo
  node probar-clubes.mjs; echo
  node probar-once.mjs; echo
  node probar-stats.mjs; echo
  node resolver-youtube.mjs; echo
  node todos.mjs; } > salida.txt 2>&1
cat salida.txt
echo; echo "  ================================================================"
echo "  Listo. Quedó guardado en  salida.txt , al lado de este archivo."
echo "  Mandáselo a Claude tal cual."
echo "  ================================================================"; echo
read -n 1 -s -r -p "  Enter para cerrar"
