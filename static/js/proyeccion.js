/* Tiempos proyectados de desposte - calculadora en vivo */
(function () {
  const Live = window.OrionLive;
  const $ = (id) => document.getElementById(id);

  // velocidades[cliente] = { canal_h, canal_hh, kilos_h, operarios_prom }
  let velocidades = {};

  // ---------- Helpers de tiempo ----------
  function hhmmToMin(s) {
    if (!s) return 0;
    const p = String(s).split(":").map(n => parseInt(n, 10));
    if (p.some(Number.isNaN)) return 0;
    return (p[0] || 0) * 60 + (p[1] || 0);
  }
  function minToHM(min) {
    if (min == null || !isFinite(min) || min < 0) return "0:00";
    const total = Math.round(min);
    const h = Math.floor(total / 60);
    const m = total % 60;
    return `${h}:${String(m).padStart(2, "0")}`;
  }
  function minToHHMM(min) {
    const total = ((Math.round(min) % 1440) + 1440) % 1440;
    const h = Math.floor(total / 60);
    const m = total % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }
  function fmtNum(v) {
    if (v == null || !isFinite(v) || v === 0) return "0,00";
    return Number(v).toFixed(2).replace(".", ",");
  }
  const num = (el) => {
    const v = parseFloat(el.value);
    return isFinite(v) ? v : 0;
  };

  // ---------- Filas DESPOSTE ----------
  function buscarVel(cliente) {
    if (!cliente) return null;
    const key = cliente.trim().toUpperCase();
    return velocidades[key] || null;
  }

  function nuevaFilaDesposte() {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input type="text" list="clientesList" class="cell-inp f-cli" placeholder="Cliente" /></td>
      <td><input type="number" min="0" step="1" class="cell-inp text-center f-tipo" placeholder="0" /></td>
      <td><input type="number" min="0" step="1" class="cell-inp text-right f-canales" placeholder="0" /></td>
      <td><input type="number" min="0" step="1" class="cell-inp text-right f-operarios" placeholder="0" /></td>
      <td><input type="number" min="0" step="0.01" class="cell-inp text-right f-velh" placeholder="0,00" /></td>
      <td class="text-right f-velhh">0,00</td>
      <td class="text-right f-tiempo">0:00</td>
      <td class="text-center"><button type="button" class="row-del" title="Quitar">&times;</button></td>
    `;
    const cli = tr.querySelector(".f-cli");
    const velh = tr.querySelector(".f-velh");
    cli.addEventListener("change", () => {
      const ref = buscarVel(cli.value);
      if (ref && ref.canal_h && (!velh.value || velh.dataset.auto === "1")) {
        velh.value = Number(ref.canal_h).toFixed(2);
        velh.dataset.auto = "1";
        velh.title = `Promedio historico (${ref.registros || 0} registros)`;
      }
      recalc();
    });
    velh.addEventListener("input", () => { velh.dataset.auto = "0"; });
    tr.querySelectorAll("input").forEach(inp => inp.addEventListener("input", recalc));
    tr.querySelector(".row-del").addEventListener("click", () => { tr.remove(); recalc(); });
    return tr;
  }

  function nuevaFilaPorcionado() {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input type="text" list="clientesList" class="cell-inp f-cli" placeholder="Cliente" /></td>
      <td><input type="number" min="0" step="0.01" class="cell-inp text-right f-kg" placeholder="0" /></td>
      <td><input type="number" min="0" step="1" class="cell-inp text-right f-operarios" placeholder="0" /></td>
      <td><input type="number" min="0" step="0.01" class="cell-inp text-right f-velhh" placeholder="0,00" /></td>
      <td class="text-right f-tiempo">0:00</td>
      <td class="text-center"><button type="button" class="row-del" title="Quitar">&times;</button></td>
    `;
    tr.querySelectorAll("input").forEach(inp => inp.addEventListener("input", recalc));
    tr.querySelector(".row-del").addEventListener("click", () => { tr.remove(); recalc(); });
    return tr;
  }

  // ---------- Calculo ----------
  function recalc() {
    // ----- Desposte -----
    let sumCanales = 0, maxOperarios = 0, sumMin = 0, sumVelH = 0, sumVelHH = 0, nVel = 0;
    $("tbodyDesposte").querySelectorAll("tr").forEach(tr => {
      const canales = num(tr.querySelector(".f-canales"));
      const operarios = num(tr.querySelector(".f-operarios"));
      const velh = num(tr.querySelector(".f-velh"));
      const velhh = (velh && operarios) ? velh / operarios : 0;
      const horas = (velh > 0 && canales > 0) ? canales / velh : 0;
      tr.querySelector(".f-velhh").textContent = fmtNum(velhh);
      tr.querySelector(".f-tiempo").textContent = minToHM(horas * 60);
      sumCanales += canales;
      if (operarios > maxOperarios) maxOperarios = operarios;
      sumMin += horas * 60;
      if (velh > 0) { sumVelH += velh; sumVelHH += velhh; nVel++; }
    });
    $("totDespCanales").textContent = Math.round(sumCanales);
    $("totDespOperarios").textContent = maxOperarios;
    $("totDespVelH").textContent = fmtNum(nVel ? sumVelH / nVel : 0);
    $("totDespVelHH").textContent = fmtNum(nVel ? sumVelHH / nVel : 0);
    $("totDespTiempo").textContent = minToHM(sumMin);

    // ----- Porcionado -----
    let pKg = 0, pMaxOp = 0, pMin = 0, pSumVel = 0, pN = 0;
    $("tbodyPorcionado").querySelectorAll("tr").forEach(tr => {
      const kg = num(tr.querySelector(".f-kg"));
      const operarios = num(tr.querySelector(".f-operarios"));
      const velhh = num(tr.querySelector(".f-velhh"));
      const velHr = velhh * operarios;
      const horas = (velHr > 0 && kg > 0) ? kg / velHr : 0;
      tr.querySelector(".f-tiempo").textContent = minToHM(horas * 60);
      pKg += kg;
      if (operarios > pMaxOp) pMaxOp = operarios;
      pMin += horas * 60;
      if (velhh > 0) { pSumVel += velhh; pN++; }
    });
    $("totPorKg").textContent = Math.round(pKg);
    $("totPorOperarios").textContent = pMaxOp;
    $("totPorVel").textContent = fmtNum(pN ? pSumVel / pN : 0);
    $("totPorTiempo").textContent = minToHM(pMin);

    // ----- Informacion general -----
    const duracionMin = sumMin + pMin;
    const descanso = hhmmToMin($("igDescanso").value);
    const parada = hhmmToMin($("igParada").value);
    const inicio = hhmmToMin($("igHoraInicio").value);
    const plantaMin = duracionMin + descanso + parada;
    const salidaMin = inicio + plantaMin;

    $("igDuracion").textContent = minToHM(duracionMin);
    $("igPlanta").textContent = minToHM(plantaMin);
    $("igSalida").textContent = duracionMin > 0 ? minToHHMM(salidaMin) : "--:--";

    const comidas = (plantaMin >= 600 || salidaMin >= 20 * 60) ? "SI" : "NO";
    const elCom = $("igComidas");
    elCom.textContent = comidas;
    elCom.classList.toggle("badge-comida-si", comidas === "SI");
  }

  // ---------- Carga inicial ----------
  function cargarOpciones() {
    return Live.fetchJSON("/api/proyeccion/options").then(data => {
      velocidades = {};
      (data.velocidades || []).forEach(v => {
        if (v.cliente) velocidades[v.cliente.trim().toUpperCase()] = v;
      });
      const dl = $("clientesList");
      dl.innerHTML = (data.clientes || []).map(c => `<option value="${c}"></option>`).join("");
    }).catch(() => Live.toast("No se pudieron cargar las velocidades historicas", "error"));
  }

  document.addEventListener("DOMContentLoaded", () => {
    $("proyFecha").value = new Date().toISOString().slice(0, 10);
    cargarOpciones().then(() => {
      $("tbodyDesposte").appendChild(nuevaFilaDesposte());
      $("tbodyDesposte").appendChild(nuevaFilaDesposte());
      $("tbodyPorcionado").appendChild(nuevaFilaPorcionado());
      recalc();
    });

    $("btnAddDesposte").addEventListener("click", () => {
      $("tbodyDesposte").appendChild(nuevaFilaDesposte());
    });
    $("btnAddPorcionado").addEventListener("click", () => {
      $("tbodyPorcionado").appendChild(nuevaFilaPorcionado());
    });
    ["igHoraInicio", "igDescanso", "igParada"].forEach(id => {
      $(id).addEventListener("input", recalc);
    });
  });
})();
