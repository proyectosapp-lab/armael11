#!/bin/bash
# Para macOS: doble clic. Si no abre, boton derecho > Abrir.
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo; echo "  No encuentro Node. Instalalo desde https://nodejs.org y volvé a probar."; echo
  read -n 1 -s -r -p "  Enter para cerrar"; exit 1
fi
echo
echo "  Corre lo mismo que corre en la nube: pruebas, fuentes, feeds y sitio."
echo "  Tarda unos minutos, no cierres la ventana."
echo
echo "  Si tenés la API key a mano y querés la tabla y el juego completos,"
echo "  abrí este archivo con un editor y poné tu key abajo."
echo

# export API_FOOTBALL_KEY=pegala_aca

node publicar.mjs > salida.txt 2>&1

cat salida.txt
echo; echo "  ================================================================"
echo "  Listo. Quedó guardado en  salida.txt , al lado de este archivo."
echo "  Mandáselo a Claude tal cual."
echo "  ================================================================"; echo
read -n 1 -s -r -p "  Enter para cerrar"
