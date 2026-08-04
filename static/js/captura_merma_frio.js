/* Captura MERMA FRIO - formulario en vivo */
(function () {
  const Live = window.OrionLive;
  const $ = (id) => document.getElementById(id);

  const fb = $("f_fb");
  const fp = $("f_fp");
  const especie = $("f_especie");
  const cliente = $("f_cliente");
  const lote = $("f_lote");
  const machos = $("f_machos");
  const hembras = $("f_hembras");
  const totalAuto = $("f_total");
  const pc = $("f_pc");
  const pf = $("f_pf");
  const cava = $("f_cava");
  const obs = $("f_obs");
  const diasHint = $("f_dias");

  function hoyISO() { return Live.fmt.isoDate(); }
  fp.value = hoyISO();
  fb.value = hoyISO();

  function actualizarDias() {
    if (!fb.value || !fp.value) { diasHint.textContent = "Dias en cava se calcula solo"; return; }
    const a = Live.fmt.parseDate(fb.value);
    const b = Live.fmt.parseDate(fp.value);
    if (!(a instanceof Date) || !(b instanceof Date)) return;
    if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return;
    const diff = Math.round((b - a) / (24 * 3600 * 1000));
    diasHint.textContent = diff >= 0 ? `${diff} dias en cava` : "Fechas invertidas";
    if (!obs.value) obs.placeholder = `(se autocompleta: ${diff} dias en cava)`;
  }
  fb.addEventListener("change", actualizarDias);
  fp.addEventListener("change", actualizarDias);
  actualizarDias();

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

  let clienteAc = null;
  let cavaAc = null;

  function renderAtajos(elId, items, onClick, max = 10) {
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
    items.slice(0, 20).forEach(v => {
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

  function cargarOpciones() {
    return Live.fetchJSON("/api/captura/options").then(data => {
      // Para merma solo bovinos / bufalinos por convencion
      const especiesMerma = (data.especies || []).filter(e => e !== "PORCINOS");
      fillSelect(especie, especiesMerma.length ? especiesMerma : ["BOVINOS", "BUFALINOS"], "Selecciona especie");
      const clientes = data.clientes_merma || data.clientes || [];
      const cavas = data.cavas || [];
      if (!clienteAc) {
        clienteAc = Live.autocomplete(cliente, $("clienteAcList"), {
          emptyMsg: (q) => `Sin coincidencias. Puedes usar "${q.toUpperCase()}" como cliente nuevo.`
        });
      }
      if (!cavaAc) {
        cavaAc = Live.autocomplete(cava, $("cavaAcList"), {
          emptyMsg: (q) => `Sin coincidencias. Puedes usar "${q}" como cava nueva.`
        });
      }
      clienteAc.setItems(clientes);
      cavaAc.setItems(cavas);
      renderAtajos("atajosCavas", cavas, v => { cava.value = v; if (cavaAc) cavaAc.hide(); }, 12);
      renderClientesAside(clientes);
    });
  }

  function recalcular() {
    const m = parseFloat(machos.value) || 0;
    const h = parseFloat(hembras.value) || 0;
    totalAuto.value = (m + h) || "";
    $("prev_total").textContent = (m + h).toString();
    const pcv = parseFloat(pc.value);
    const pfv = parseFloat(pf.value);
    if (pcv && pfv >= 0) {
      const merma = (pcv - pfv) / pcv;
      $("prev_merma").textContent = (merma * 100).toFixed(2) + "%";
    } else {
      $("prev_merma").textContent = "--";
    }
  }
  ["input", "change"].forEach(ev => {
    [machos, hembras, pc, pf].forEach(el => el.addEventListener(ev, recalcular));
  });

  // ---- Auto-relleno de pesos desde SIRT (Desposte) ----
  const sirtHint = $("f_lote_sirt");
  let sirtToken = 0;
  let ultimoLoteSirt = "";

  function setHint(msg, cls) {
    if (!sirtHint) return;
    sirtHint.textContent = msg;
    sirtHint.className = "hint" + (cls ? " " + cls : "");
  }

  function fmtNum(v) {
    return (v == null) ? "--" : Number(v).toLocaleString("es-CO", { maximumFractionDigits: 2 });
  }

  function traerDeSirt() {
    const loteVal = (lote.value || "").trim();
    if (loteVal.length < 3) {
      setHint("Escribe el lote y sal del campo para traer peso caliente/frio.");
      return;
    }
    if (loteVal === ultimoLoteSirt) return;   // evita repetir la misma consulta
    ultimoLoteSirt = loteVal;

    const token = ++sirtToken;
    setHint("Buscando en SIRT...", "text-orion-300");
    const url = "/api/captura/merma-frio/sirt?lote=" + encodeURIComponent(loteVal) +
      "&cliente=" + encodeURIComponent((cliente.value || "").trim());

    fetch(url, { credentials: "same-origin" })
      .then(r => r.json().then(j => ({ status: r.status, body: j })))
      .then(({ status, body }) => {
        if (token !== sirtToken) return;       // llego una respuesta vieja
        if (!body.ok || !body.datos) {
          if (status === 404) setHint("Lote no encontrado en SIRT. Puedes digitar los pesos a mano.", "text-amber-300");
          else if (status === 503) setHint("SIRT no disponible ahora. Digita los pesos a mano.", "text-amber-300");
          else setHint(body.error || "No se pudo consultar SIRT.", "text-amber-300");
          return;
        }
        const d = body.datos;
        if (d.peso_caliente != null) pc.value = d.peso_caliente;
        if (d.peso_frio != null) pf.value = d.peso_frio;
        if (d.machos != null) machos.value = d.machos;
        if (d.hembras != null) hembras.value = d.hembras;
        // completar solo campos vacios para no pisar lo que el usuario ya eligio
        if (d.cliente && !cliente.value.trim()) cliente.value = d.cliente;
        if (d.especie && especie.querySelector(`option[value="${d.especie}"]`) &&
            (!especie.value || especie.selectedIndex === 0)) {
          especie.value = d.especie;
        }
        if (d.fecha_beneficio) fb.value = d.fecha_beneficio;
        if (d.fecha_produccion) fp.value = d.fecha_produccion;
        actualizarDias();
        recalcular();
        const partes = [];
        if (d.peso_caliente != null) partes.push("caliente " + fmtNum(d.peso_caliente) + " kg");
        if (d.peso_frio != null) partes.push("frio " + fmtNum(d.peso_frio) + " kg");
        if (d.canales != null) {
          const sexo = (d.machos != null || d.hembras != null)
            ? ` (${d.machos || 0}M/${d.hembras || 0}H)` : "";
          partes.push(`${d.canales} canales${sexo}`);
        }
        const cuartos = d.cuartos != null ? ` · ${d.cuartos} cuartos` : "";
        setHint("SIRT: " + partes.join(" · ") + cuartos + " (lote " + (d.lote || loteVal) + ")", "text-emerald-300");
      })
      .catch(() => {
        if (token !== sirtToken) return;
        setHint("Fallo la consulta a SIRT. Digita los pesos a mano.", "text-amber-300");
      });
  }

  lote.addEventListener("change", traerDeSirt);
  lote.addEventListener("blur", traerDeSirt);
  lote.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); traerDeSirt(); } });

  $("formMerma").addEventListener("submit", (e) => {
    e.preventDefault();
    if (!cliente.value.trim()) { Live.toast("El cliente es obligatorio", "warn"); cliente.focus(); return; }
    if (!fp.value) { Live.toast("Falta fecha de produccion", "warn"); return; }

    const payload = {
      fecha_beneficio: fb.value || null,
      fecha_produccion: fp.value,
      cliente: cliente.value.trim().toUpperCase(),
      especie: especie.value || null,
      lote: lote.value || null,
      cant_machos: machos.value || 0,
      cant_hembras: hembras.value || 0,
      peso_caliente: pc.value || null,
      peso_frio: pf.value || null,
      cava: cava.value || null,
      observaciones: obs.value || null,
    };

    fetch("/api/captura/merma-frio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(payload),
    })
      .then(r => r.json())
      .then(data => {
        if (data.ok) {
          Live.toast("Lote guardado", "ok");
          ["f_lote","f_machos","f_hembras","f_pc","f_pf","f_obs"].forEach(id => $(id).value = "");
          totalAuto.value = "";
          $("prev_total").textContent = "0";
          $("prev_merma").textContent = "--";
          ultimoLoteSirt = "";
          setHint("Escribe el lote y sal del campo para traer peso caliente/frio.");
          cargarManuales();
        } else {
          Live.toast(data.error || "No se pudo guardar", "error");
        }
      })
      .catch(() => Live.toast("Fallo la peticion", "error"));
  });

  function cargarManuales() {
    Live.fetchJSON("/api/captura/merma-frio").then(data => {
      const rows = data.manuales || [];
      $("manualCount").textContent = rows.length;
      const tb = $("tablaManuales");
      if (!rows.length) {
        tb.innerHTML = '<tr><td colspan="11" class="text-center text-slate-500 py-4">Aun no hay registros manuales</td></tr>';
        return;
      }
      tb.innerHTML = rows.map(r => `
        <tr>
          <td>${r.item || '--'}</td>
          <td>${Live.fmt.date(r.fecha_beneficio)}</td>
          <td>${Live.fmt.date(r.fecha_produccion)}</td>
          <td class="truncate max-w-[180px]" title="${r.cliente || ''}">${r.cliente || '--'}</td>
          <td>${r.especie || '--'}</td>
          <td class="text-right">${Live.fmt.num(r.total_canales)}</td>
          <td class="text-right">${Live.fmt.num(r.peso_caliente, 1)}</td>
          <td class="text-right">${Live.fmt.num(r.peso_frio, 1)}</td>
          <td class="text-right">${Live.fmt.pct(r.merma_frio)}</td>
          <td>${r.cava || '--'}</td>
          <td><button class="btn-danger" data-id="${r.id}">Eliminar</button></td>
        </tr>
      `).join("");
      tb.querySelectorAll("button[data-id]").forEach(btn => {
        btn.addEventListener("click", () => eliminar(parseInt(btn.dataset.id, 10)));
      });
    });
  }

  function eliminar(id) {
    if (!confirm("¿Eliminar este lote manual?")) return;
    fetch(`/api/captura/merma-frio/${id}`, { method: "DELETE", credentials: "same-origin" })
      .then(r => r.json())
      .then(d => {
        if (d.ok) { Live.toast("Lote eliminado", "ok"); cargarManuales(); }
        else Live.toast("No se pudo eliminar", "error");
      });
  }

  document.addEventListener("DOMContentLoaded", () => {
    cargarOpciones().then(cargarManuales);
  });
  Live.on(() => cargarManuales());
})();
