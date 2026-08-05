// Verificacion de la cadena de formulas de "Tiempos proyectados de desposte".
// Reproduce la logica del Excel (ver proyeccion.js -> recalc):
//   VEL. CANAL/HR    = velocidad historica canal/hr/hm  x  operarios
//   VEL. CANAL/HR/HM = VEL. CANAL/HR / operarios   (== canal/hr/hm historico)
//   TIEMPO (horas)   = canales / VEL. CANAL/HR
// Ejecutar:  node static/js/proyeccion.check.js
const assert = require("assert");

const velCanalHr = (canalHh, operarios) => canalHh * operarios;
const velCanalHrHm = (velH, operarios) => (operarios ? velH / operarios : 0);
const horas = (canales, velH) => (velH > 0 ? canales / velH : 0);

// Ejemplo real del Excel (hoja TIEMPO PRODUCCION, celdas O5/P5/Q5):
// CARNES SANTACRUZ -> 45 canales, 13 operarios, canal_hh historico = 0.6450071667
{
  const canalHh = 0.6450071667;   // promedio historico canal/hr/hm (BASE DATOS col S)
  const velH = velCanalHr(canalHh, 13);
  const t = horas(45, velH) * 60;
  assert.ok(Math.abs(velH - 8.385093168) < 1e-6, `VEL. CANAL/HR esperado 8.385093, obtenido ${velH}`);
  assert.ok(Math.abs(velCanalHrHm(velH, 13) - 0.6450071667) < 1e-6, "VEL/HM debe ser canal_hh");
  assert.ok(Math.abs(t - 322.3) < 0.5, `TIEMPO esperado ~5:22 (322 min), obtenido ${t.toFixed(1)} min`);
}

// Datos reales de la captura del Excel (Colbeef, 06/08/26):
// Fila 1: CARNES SANTACRUZ -> 45 canales, 13 operarios, VEL. CANAL/HR = 8,39
// Fila 2: SUPERTIENDAS      -> 10 canales, 13 operarios, VEL. CANAL/HR = 9,52
const filas = [
  { canales: 45, operarios: 13, canalHr: 8.39 },
  { canales: 10, operarios: 13, canalHr: 9.52 },
];

let sumMin = 0, sumVelH = 0, sumVelHH = 0;
for (const f of filas) {
  const canalHh = velCanalHrHm(f.canalHr, f.operarios);   // historico por operario
  const velH = velCanalHr(canalHh, f.operarios);           // reconstruye canal/hr en vivo
  assert.ok(Math.abs(velH - f.canalHr) < 1e-9, "canal/hr debe reconstruirse de canal_hh x operarios");
  sumMin += horas(f.canales, velH) * 60;
  sumVelH += velH;
  sumVelHH += canalHh;
}

const avgVelH = sumVelH / filas.length;
const avgVelHH = sumVelHH / filas.length;

assert.ok(Math.abs(avgVelH - 8.95) < 0.01, `VEL. CANAL/HR total esperado ~8.95, obtenido ${avgVelH.toFixed(2)}`);
assert.ok(Math.abs(avgVelHH - 0.69) < 0.01, `VEL. CANAL/HR/HM total esperado ~0.69, obtenido ${avgVelHH.toFixed(2)}`);
assert.ok(Math.abs(sumMin - 385) < 1, `TIEMPO total esperado 6:25 (385 min), obtenido ${Math.round(sumMin)} min`);

// Al cambiar operarios, la velocidad cambia en vivo (no es un dato fijo).
const canalHh = 0.6454;
assert.ok(velCanalHr(canalHh, 13) !== velCanalHr(canalHh, 20), "cambiar operarios debe cambiar la velocidad");

console.log("OK proyeccion.check: cadena de formulas coincide con el Excel (8.95 / 0.69 / 6:25).");
