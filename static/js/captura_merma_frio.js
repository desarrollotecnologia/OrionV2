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

  function hoyISO() { return new Date().toISOString().slice(0, 10); }
  fp.value = hoyISO();
  fb.value = hoyISO();

  function actualizarDias() {
    if (!fb.value || !fp.value) { diasHint.textContent = "Dias en cava se calcula solo"; return; }
    const a = new Date(fb.value);
    const b = new Date(fp.value);
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

  function fillDatalist(dl, items) {
    dl.innerHTML = "";
    items.forEach(v => {
      const o = document.createElement("option");
      o.value = v;
      dl.appendChild(o);
    });
  }

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
      b.addEventListener("click", () => { cliente.value = v; cliente.focus(); });
      cont.appendChild(b);
    });
  }

  function cargarOpciones() {
    return Live.fetchJSON("/api/captura/options").then(data => {
      // Para merma solo bovinos / bufalinos por convencion
      const especiesMerma = (data.especies || []).filter(e => e !== "PORCINOS");
      fillSelect(especie, especiesMerma.length ? especiesMerma : ["BOVINOS", "BUFALINOS"], "Selecciona especie");
      fillDatalist($("dl_clientes"), data.clientes || []);
      fillDatalist($("dl_cavas"), data.cavas || []);
      renderAtajos("atajosCavas", data.cavas || [], v => cava.value = v, 12);
      renderClientesAside(data.clientes_merma || data.clientes || []);
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
