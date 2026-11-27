// Genera los íconos de la app (PWA, iPhone, pestaña del navegador) a partir de un dibujo SVG.
// Uso: node scripts/generar-iconos.mjs   (se corre a mano solo si cambia el ícono)
import { writeFileSync } from "node:fs";
import sharp from "sharp";

const AZUL = "#0369a1";
const NARANJA = "#f47230";

// "T" blanca con un punto naranja (el auto en la ruta), en un lienzo de 100 × 100.
// escala < 1 achica el dibujo hacia el centro (los íconos "maskable" de Android recortan los bordes).
function dibujo({ redondeado, escala = 1 }) {
  const fondo = redondeado ? `<rect width="100" height="100" rx="22" fill="${AZUL}"/>` : `<rect width="100" height="100" fill="${AZUL}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${fondo}
  <g transform="translate(50 50) scale(${escala}) translate(-50 -50)">
    <rect x="24" y="22" width="52" height="13" rx="4" fill="#fff"/>
    <rect x="43.5" y="22" width="13" height="56" rx="4" fill="#fff"/>
    <circle cx="70" cy="70" r="7.5" fill="${NARANJA}"/>
  </g></svg>`;
}

const png = (svg, lado, archivo) => sharp(Buffer.from(svg)).resize(lado, lado).png().toFile(archivo);

writeFileSync("app/icon.svg", dibujo({ redondeado: true }));
await png(dibujo({ redondeado: false }), 180, "app/apple-icon.png"); // el iPhone redondea solo
await png(dibujo({ redondeado: true }), 192, "public/iconos/icono-192.png");
await png(dibujo({ redondeado: true }), 512, "public/iconos/icono-512.png");
await png(dibujo({ redondeado: false, escala: 0.72 }), 512, "public/iconos/icono-maskable-512.png");
console.log("Íconos generados");
