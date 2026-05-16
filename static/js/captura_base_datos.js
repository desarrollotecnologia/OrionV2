/* Captura BASE DATOS - formulario en vivo */
(function () {
  const Live = window.OrionLive;

  const $ = (id) => document.getElementById(id);
  const fecha = $("f_fecha");
  const especie = $("f_especie");
  const limpieza = $("f_limpieza");
  const cliente = $("f_cliente");
  const proceso = $("f_proceso");
  const operarios = $("f_operarios");
  const canales = $("f_canales");
  const kilos = $("f_kilos");
  const reposo = $("f_reposo");
  const hi = $("f_hi");
  const hf = $("f_hf");
  const tt = $("f_tt");
  const mesAnioHint = $("f_mesanio");

  // ----- Defaults -----
  function hoyISO() { return new Date().toISOString().slice(0, 10); }
  fecha.value = hoyISO();
  reposo.value = "00:00:00";

  function actualizarMesAnioHint() {
    if (!fecha.value) { mesAnioHint.textContent = ""; return; }
    const d = new Date(fecha.value);
    if (Number.isNaN(d.getTime())) return;
    mesAnioHint.textContent = `Mes ${d.getMonth() + 1} · Ano ${d.getFullYear()} (${Live.MES_NOMBRE[d.getMonth() + 1]})`;
  }
  fecha.addEventListener("change", actualizarMesAnioHint);
  actualizarMesAnioHint();

  // ----- Cargar opciones desde el backend -----
  function fillSelect(sel, items, placeholder) {
    sel.innerHTML = "";
    if (placeholder) {
      const opt = document.createElement("option");
      opt.value = ""; opt.textContent = placeholder; opt.disabled = true; opt.selected = true;
      sel.appendChild(opt);
    }
    items.forEach(v => {
      const o = document.createElement("option");
      o.value = v; o.textContent = v;
      sel.appendChild(o);
    });
  }

  function fillDatalist(dl, items) {
    dl.innerHTML = "";
    items.forEach(v => {
      const o = document.createElement("option");
      o.value = v;
      dl.appendChild(o);
    });
  }

  function renderAtajos(elId, items, onClick, max = 6) {
    const cont = $(elId);
    cont.innerHTML = "";
    items.slice(0, max).forEach(v => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip";
      b.textContent = v;
      b.addEventListener("click", () => onClick(v));
      cont.appendChild(b);
    });
  }

  function renderClientesAside(items) {
    const cont = $("atajosClientes");
    cont.innerHTML = "";
    items.slice(0, 25).forEach(v => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip cliente";
      b.textContent = v;
      b.addEventListener("click", () => { cliente.value = v; cliente.focus(); });
      cont.appendChild(b);
    });
  }

  let opciones = null;
  function cargarOpciones() {
    return Live.fetchJSON("/api/captura/options").then(data => {
      opciones = data;
      fillSelect(especie, data.especies, "Selecciona especie");
      fillSelect(limpieza, data.limpiezas, "Selecciona limpieza");
      fillSelect(proceso, data.procesos, "Selecciona proceso");
      fillDatalist($("dl_clientes"), data.clientes);
      renderAtajos("atajosProcesos", data.procesos, v => proceso.value = v, 8);
      renderClientesAside(data.clientes_base_datos || data.clientes);
    });
  }

  // ----- Calculo de tiempo total y velocidades -----
  function hhmmssToSec(s) {
    if (!s) return null;
    const p = s.split(":").map(n => parseInt(n, 10));
    if (p.some(Number.isNaN)) return null;
    if (p.length === 2) return p[0] * 3600 + p[1] * 60;
    if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2];
    return null;
  }
  function secToHHMMSS(t) {
    if (t == null || t < 0) return "00:00:00";
    const h = Math.floor(t / 3600);
    const m = Math.floor((t % 3600) / 60);
    const s = Math.floor(t % 60);
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }

  function recalcular() {
    const ini = hhmmssToSec(hi.value);
    const fin = hhmmssToSec(hf.value);
    const rep = hhmmssToSec(reposo.value) || 0;
    let totalSeg = null;
    if (ini != null && fin != null) {
      let d = fin - ini;
      if (d < 0) d += 24 * 3600;
      totalSeg = Math.max(d - rep, 0);
      tt.value = secToHHMMSS(totalSeg);
    } else {
      tt.value = "";
    }

    const horas = totalSeg ? totalSeg / 3600 : null;
    const c = parseFloat(canales.value) || 0;
    const k = parseFloat(kilos.value) || 0;
    const op = parseInt(operarios.value, 10) || 0;
    if (horas) {
      $("prev_canal_h").textContent = c ? (c / horas).toFixed(2) : "--";
      $("prev_kilos_h").textContent = k ? (k / horas).toFixed(2) : "--";
      $("prev_canal_hh").textContent = (c && op) ? (c / horas / op).toFixed(2) : "--";
    } else {
      $("prev_canal_h").textContent = "--";
      $("prev_kilos_h").textContent = "--";
      $("prev_canal_hh").textContent = "--";
    }
  }
  ["change", "input"].forEach(ev => {
    [hi, hf, reposo, canales, kilos, operarios].forEach(el => el.addEventListener(ev, recalcular));
  });

  // ----- Submit -----
  $("formBaseDatos").addEventListener("submit", (e) => {
    e.preventDefault();
    if (!cliente.value.trim()) { Live.toast("El cliente es obligatorio", "warn"); cliente.focus(); return; }
    if (!proceso.value) { Live.toast("Selecciona un proceso", "warn"); return; }

    const payload = {
      fecha: fecha.value,
      cliente: cliente.value.trim().toUpperCase(),
      especie: especie.value || null,
      limpieza: limpieza.value || null,
      proceso: proceso.value || null,
      operarios: operarios.value || null,
      lote: $("f_lote").value || null,
      canales: canales.value || null,
      kilos: kilos.value || null,
      hora_inicio: hi.value || null,
      hora_fin: hf.value || null,
      tiempo_reposo: reposo.value || "00:00:00",
    };

    const btn = $("btnGuardar");
    btn.disabled = true;
    const prev = btn.textContent;
    btn.textContent = "Guardando...";

    fetch("/api/captura/base-datos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(payload),
    })
      .then(r => r.json())
      .then(data => {
        if (data.ok) {
          Live.toast("Registro guardado", "ok");
          // Limpiar campos clave dejando defaults utiles
          ["f_lote","f_canales","f_kilos","f_hi","f_hf"].forEach(id => $(id).value = "");
          $("f_canales").focus();
          tt.value = "";
          recalcular();
          cargarManuales();
        } else {
          Live.toast(data.error || "No se pudo guardar", "error");
        }
      })
      .catch(() => Live.toast("Fallo la peticion", "error"))
      .finally(() => { btn.disabled = false; btn.textContent = prev; });
  });

  // ----- Tabla de manuales -----
  function cargarManuales() {
    Live.fetchJSON("/api/captura/base-datos").then(data => {
      const rows = data.manuales || [];
      $("manualCount").textContent = rows.length;
      const tb = $("tablaManuales");
      if (!rows.length) {
        tb.innerHTML = '<tr><td colspan="9" class="text-center text-slate-500 py-4">Aun no hay registros manuales</td></tr>';
        return;
      }
      tb.innerHTML = rows.map(r => `
        <tr>
          <td>${Live.fmt.date(r.fecha)}</td>
          <td class="truncate max-w-[180px]" title="${r.cliente || ''}">${r.cliente || '--'}</td>
          <td>${r.especie || '--'}</td>
          <td>${r.proceso || '--'}</td>
          <td class="text-right">${Live.fmt.num(r.canales)}</td>
          <td class="text-right">${Live.fmt.num(r.kilos, 1)}</td>
          <td class="text-right">${Live.fmt.num(r.velocidad_canal_h, 2)}</td>
          <td class="text-right">${Live.fmt.num(r.velocidad_kilos_h, 1)}</td>
          <td><button class="btn-danger" data-id="${r.id}">Eliminar</button></td>
        </tr>
      `).join("");
      tb.querySelectorAll("button[data-id]").forEach(btn => {
        btn.addEventListener("click", () => eliminar(parseInt(btn.dataset.id, 10)));
      });
    });
  }

  function eliminar(id) {
    if (!confirm("¿Eliminar este registro manual?")) return;
    fetch(`/api/captura/base-datos/${id}`, { method: "DELETE", credentials: "same-origin" })
      .then(r => r.json())
      .then(d => {
        if (d.ok) { Live.toast("Registro eliminado", "ok"); cargarManuales(); }
        else Live.toast("No se pudo eliminar", "error");
      });
  }

  // ----- Init -----
  document.addEventListener("DOMContentLoaded", () => {
    cargarOpciones().then(cargarManuales);
  });
  Live.on(() => cargarManuales());
})();
