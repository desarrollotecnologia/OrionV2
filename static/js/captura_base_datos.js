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
  function hoyISO() { return Live.fmt.isoDate(); }
  fecha.value = hoyISO();
  reposo.value = "0:00";

  function actualizarMesAnioHint() {
    if (!fecha.value) { mesAnioHint.textContent = ""; return; }
    const d = Live.fmt.parseDate(fecha.value);
    if (!(d instanceof Date)) return;
    if (Number.isNaN(d.getTime())) return;
    mesAnioHint.textContent = `Mes ${d.getMonth() + 1} · Año ${d.getFullYear()} (${Live.MES_NOMBRE[d.getMonth() + 1]})`;
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

  // ----- Autocomplete cliente -----
  let clienteAc = null;

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
      b.addEventListener("click", () => {
        cliente.value = v;
        if (clienteAc) clienteAc.hide();
        cliente.focus();
      });
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
      const clientes = data.clientes_base_datos || data.clientes || [];
      if (!clienteAc) {
        clienteAc = Live.autocomplete(cliente, $("clienteAcList"), {
          emptyMsg: (q) => `Sin coincidencias. Puedes usar "${q.toUpperCase()}" como cliente nuevo.`
        });
      }
      clienteAc.setItems(clientes);
      renderAtajos("atajosProcesos", data.procesos, v => proceso.value = v, 8);
      renderClientesAside(clientes);
    });
  }

  // ----- Calculo de tiempo total y velocidades -----
  function duracionToSec(s) {
    if (!s) return 0;
    const txt = String(s).trim().replace(",", ".");
    if (!txt) return 0;
    if (txt.includes(":")) {
      const p = txt.split(":");
      const h = parseInt(p[0], 10) || 0;
      const m = parseInt(p[1], 10) || 0;
      const sec = p.length >= 3 ? (parseInt(p[2], 10) || 0) : 0;
      return h * 3600 + m * 60 + sec;
    }
    const horas = parseFloat(txt);
    return isFinite(horas) ? Math.round(horas * 3600) : 0;
  }
  function duracionToHHMMSS(s) {
    return secToHHMMSS(duracionToSec(s));
  }
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

  function setMetric(id, value, hintId, hintOk, hintMissing) {
    $(id).textContent = value;
    const hint = $(hintId);
    if (hint) {
      hint.textContent = value === "--" ? hintMissing : hintOk;
      hint.classList.toggle("metric-hint-ok", value !== "--");
    }
  }

  function recalcular() {
    const ini = hhmmssToSec(hi.value);
    const fin = hhmmssToSec(hf.value);
    const rep = duracionToSec(reposo.value);
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

    if (horas && c) {
      setMetric("prev_canal_h", (c / horas).toFixed(2), "hint_canal_h", "Calculado", "Completa canales, inicio y fin");
    } else {
      setMetric("prev_canal_h", "--", "hint_canal_h", "", "Completa canales, inicio y fin");
    }
    if (horas && k) {
      setMetric("prev_kilos_h", (k / horas).toFixed(2), "hint_kilos_h", "Calculado", "Completa kilos, inicio y fin");
    } else {
      setMetric("prev_kilos_h", "--", "hint_kilos_h", "", "Completa kilos, inicio y fin");
    }
    if (horas && c && op) {
      setMetric("prev_canal_hh", (c / horas / op).toFixed(2), "hint_canal_hh", "Canal por operario y hora", "Agrega operarios para calcular");
      $("metricCanalHH")?.classList.remove("metric-card-warn");
    } else {
      setMetric("prev_canal_hh", "--", "hint_canal_hh", "", op ? "Completa tiempos y canales" : "Agrega operarios para calcular");
      if (!op) $("metricCanalHH")?.classList.add("metric-card-warn");
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
      tiempo_reposo: duracionToHHMMSS(reposo.value) || "00:00:00",
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
        tb.innerHTML = '<tr><td colspan="11" class="text-center text-slate-500 py-4">Aun no hay registros manuales</td></tr>';
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
          <td class="text-right">${Live.fmt.num(r.velocidad_canal_hh, 2)}</td>
          <td class="text-right">${Live.fmt.num(r.velocidad_kilos_h, 1)}</td>
          <td>${r.tiempo_total || '--'}</td>
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
