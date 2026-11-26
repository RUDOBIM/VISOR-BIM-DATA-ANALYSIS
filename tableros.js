/* =====================================================================================
   BIM Loading · Presentación a clientes — TABLEROS BIM (complemento del visor web)
   Panel lateral con indicadores y gráficas personalizables a partir de los datos BIM
   que el exportador "Exportar GLB" guarda en el modelo (extras de cada elemento y de la escena).
   - Gráficas: barras, barras horizontales, líneas, áreas, pastel, dona, dispersión, histograma,
     caja (boxplot), burbujas, radar, mapa de calor, Gantt, flujo (Sankey) y tabla.
   - Clic en una barra / rebanada / celda: filtra todas las gráficas y resalta esos elementos
     en el modelo 3D (atenuar o aislar el resto). Colorear el modelo por cualquier campo.
   - El tablero se guarda en este navegador y se puede compartir en el enlace (&tb=...).
   Se apoya en la interfaz pública del visor: window.__visor
   ===================================================================================== */
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const PALETA = ["#0a84ff", "#ff9f0a", "#30b0c7", "#ff375f", "#34c759", "#af52de", "#ffcc00", "#5e5ce6", "#a2845e", "#64d2ff", "#ff6961", "#8e8e93"];
  const OTROS = "#b8c0cc";
  const fmt = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 2 });
  const fmt0 = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 0 });
  const fmt1 = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 1 });
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // Categorías de Revit en español (los modelos vienen con nombres en inglés).
  const CAT_ES = {
    "Walls": "Muros", "Floors": "Pisos", "Doors": "Puertas", "Windows": "Ventanas", "Roofs": "Cubiertas", "Ceilings": "Plafones",
    "Stairs": "Escaleras", "Railings": "Barandales", "Top Rails": "Pasamanos superiores", "Handrails": "Pasamanos", "Columns": "Columnas",
    "Structural Columns": "Columnas estructurales", "Structural Framing": "Armazón estructural", "Structural Foundations": "Cimentación",
    "Furniture": "Mobiliario", "Furniture Systems": "Sistemas de mobiliario", "Casework": "Carpintería", "Plumbing Fixtures": "Aparatos sanitarios",
    "Lighting Fixtures": "Luminarias", "Lighting Devices": "Dispositivos de iluminación", "Electrical Equipment": "Equipo eléctrico",
    "Electrical Fixtures": "Aparatos eléctricos", "Mechanical Equipment": "Equipo mecánico", "Specialty Equipment": "Equipo especializado",
    "Generic Models": "Modelos genéricos", "Planting": "Vegetación", "Entourage": "Entorno", "Topography": "Topografía", "Toposolid": "Topografía",
    "Site": "Emplazamiento", "Parking": "Estacionamiento", "Curtain Panels": "Paneles de muro cortina", "Curtain Wall Mullions": "Montantes de muro cortina",
    "Wall Sweeps": "Barridos de muro", "Slab Edges": "Bordes de losa", "Ramps": "Rampas", "Communication Devices": "Dispositivos de comunicación",
    "Data Devices": "Dispositivos de datos", "Fire Alarm Devices": "Dispositivos de alarma contra incendio", "Security Devices": "Dispositivos de seguridad",
    "Nurse Call Devices": "Dispositivos de llamada", "Telephone Devices": "Dispositivos telefónicos", "Sprinklers": "Rociadores",
    "Ducts": "Ductos", "Duct Fittings": "Uniones de ducto", "Duct Accessories": "Accesorios de ducto", "Air Terminals": "Difusores",
    "Pipes": "Tuberías", "Pipe Fittings": "Uniones de tubería", "Pipe Accessories": "Accesorios de tubería", "Flex Pipes": "Tubería flexible",
    "Flex Ducts": "Ducto flexible", "Cable Trays": "Charolas", "Cable Tray Fittings": "Uniones de charola", "Conduits": "Tubo conduit",
    "Conduit Fittings": "Uniones de conduit", "Mass": "Masas", "Rooms": "Cuartos", "Areas": "Áreas", "Signage": "Señalización",
    "Food Service Equipment": "Equipo de cocina", "Medical Equipment": "Equipo médico", "Plumbing Equipment": "Equipo hidráulico",
    "Structural Stiffeners": "Rigidizadores", "Structural Connections": "Conexiones estructurales", "Roads": "Vialidades", "Hardscape": "Pavimentos",
    "Fascias": "Fascias", "Gutters": "Canalones", "Soffits": "Plafones exteriores", "Vertical Circulation": "Circulación vertical", "Otros": "Otros"
  };
  const catEs = (c) => CAT_ES[c] || c || "Sin categoría";

  // ------------------------------------------------------------------ Campos
  const BASE = [
    { k: "cat", n: "Categoría" }, { k: "nivel", n: "Nivel" }, { k: "familia", n: "Familia" }, { k: "tipo", n: "Tipo" },
    { k: "vinculo", n: "Modelo / vínculo" }, { k: "clase", n: "Clase de familia" }
  ];
  const CUARTOS = [{ k: "cu:nombre", n: "Cuarto" }, { k: "nivel", n: "Nivel" }, { k: "cu:area", n: "Área aprox. (m²)", num: true, u: "m²" }, { k: "cu:altura", n: "Altura (m)", num: true, u: "m" }];
  const IGNORAR = /(IfcGUID|UniqueId|GUID|Type Id|Element ?Id|Host Id|^Image$|Type Image|URL|Email|Design Option|Export (Type )?to IFC|Phase Demolished|Coarse Scale Fill|Count$)/i;

  // Versión PÚBLICA del visor (sin ?v=presentacion): el tablero se ve y se filtra, pero no se edita.
  const soloLectura = document.documentElement.dataset.version !== "presentacion" &&
    !/^presentaci[oó]n$/i.test(new URLSearchParams(location.search).get("v") || "");
  const estado = {
    listo: false, abierto: false, filas: [], cuartos: [], fichas: [], seleccionando: false, porNodo: new Map(), campos: new Map(), camposCu: new Map(), modoDatos: "elementos",
    filtros: new Map(), tarjetas: [], efecto: "atenuar", colorear: "", ancho: 46, niveles: [], proyecto: "", maestro: null
  };

  const numDe = (v) => {
    if (typeof v === "number") return isFinite(v) ? v : null;
    if (typeof v !== "string") return null;
    const m = v.trim().match(/^(-?\d[\d,]*\.?\d*|-?\.\d+)\s*([^\d\s].{0,14})?$/);
    if (!m) return null;
    const n = Number(m[1].replace(/,/g, ""));
    return isFinite(n) ? n : null;
  };
  const unidadDe = (v) => { if (typeof v !== "string") return ""; const m = v.trim().match(/^-?[\d.,]*\d\s*([^\d\s.,].{0,14})$/); return m ? m[1].trim() : ""; };
  const fechaDe = (v) => {
    if (typeof v !== "string") return null;
    let m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3]);
    m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) return Date.UTC(+m[3], +m[2] - 1, +m[1]);
    return null;
  };

  function valor(f, k) {
    if (k === "cat") return f.cat;
    if (k === "nivel") return f.nivel;
    if (k === "familia") return f.familia;
    if (k === "tipo") return f.tipo;
    if (k === "vinculo") return f.vinculo;
    if (k === "clase") return f.clase;
    if (k === "__id") return f.id;
    if (k.startsWith("cu:")) return f[k.slice(3)];
    if (k.startsWith("I:")) return f.P ? f.P[k.slice(2)] : undefined;
    if (k.startsWith("T:")) return f.T ? f.T[k.slice(2)] : undefined;
    return undefined;
  }
  const texto = (v) => (v === undefined || v === null || v === "") ? "(vacío)" : String(v);

  // ------------------------------------------------------------------ Lectura del modelo
  function leerModelo() {
    const v = window.__visor;
    const modelo = v.modelo;
    let escena = {};
    for (let p = modelo; p; p = p.parent) if (p.userData && p.userData.tipos) { escena = p.userData; break; }
    if (!escena.tipos && modelo.userData) escena = modelo.userData;
    const tipos = escena.tipos || {};
    estado.proyecto = escena.nombre_proyecto || "";
    estado.niveles = Array.isArray(escena.niveles) ? escena.niveles.filter((n) => n && n.nombre).sort((a, b) => (a.y || 0) - (b.y || 0)) : [];

    const filas = [];
    modelo.traverse((o) => {
      const d = o.userData;
      if (!d || !d.UniqueId) return;
      for (let p = o.parent; p && p !== modelo; p = p.parent) if (p.userData && p.userData.UniqueId) return; // sub-parte de otro elemento
      const t = d.TipoUid ? tipos[d.TipoUid] : null;
      const mallas = [];
      (function juntar(n) {
        if (n.isMesh && !n.userData.arista) mallas.push(n);
        for (const h of n.children) if (!(h.userData && h.userData.UniqueId)) juntar(h);
      })(o);
      filas.push({
        id: d.UniqueId, cat: catEs(d.Categoria), nivel: d.Nivel || "", familia: d.Familia || (t && t.Familia) || "", tipo: d.Tipo || (t && t.Tipo) || "",
        vinculo: d.Vinculo || "Modelo anfitrión", clase: d.Clase || "", P: d.P || {}, T: (t && t.P) || {}, nodo: o, mallas
      });
    });

    if (filas.length) estado.modoDatos = "elementos";
    else {
      // GLB "web" unido por categorías: no trae datos por elemento, solo el catálogo de tipos.
      estado.modoDatos = "tipos";
      for (const uid of Object.keys(tipos)) {
        const t = tipos[uid];
        filas.push({ id: uid, cat: catEs(t.Categoria), nivel: "", familia: t.Familia || "", tipo: t.Tipo || "", vinculo: t.Vinculo || "Modelo anfitrión",
          clase: t.Clase || "", P: {}, T: t.P || {}, nodo: null, mallas: [] });
      }
    }
    estado.filas = filas;
    estado.porNodo = new Map(filas.filter((f) => f.nodo).map((f) => [f.nodo, f]));

    // Cuartos: el exportador guarda nombre y caja de cada cuarto (área aproximada = caja en planta).
    estado.cuartos = (Array.isArray(escena.cuartos) ? escena.cuartos : []).map((c, i) => {
      const dx = Math.abs((c.max || [0])[0] - (c.min || [0])[0]), dz = Math.abs((c.max || [0, 0, 0])[2] - (c.min || [0, 0, 0])[2]);
      const y = (c.min || [0, 0])[1];
      let nivel = "";
      for (const n of estado.niveles) if ((n.y || 0) <= y + 0.05) nivel = n.nombre;
      return { id: "cuarto-" + i, nombre: c.n || "Cuarto", nivel, area: Math.round(dx * dz * 100) / 100, altura: Math.round(Math.abs((c.max || [0, 0])[1] - y) * 100) / 100, mallas: [] };
    });

    // Catálogo de campos presentes, con su tipo (número / texto / fecha) y unidad.
    const campos = new Map();
    for (const b of BASE) campos.set(b.k, { k: b.k, n: b.n, num: false, cuenta: filas.length, base: true });
    const vistos = new Map();
    const muestra = filas.length > 6000 ? filas.filter((_, i) => i % Math.ceil(filas.length / 6000) === 0) : filas;
    for (const f of muestra) {
      for (const [pref, obj] of [["I:", f.P], ["T:", f.T]]) {
        for (const nombre in obj) {
          if (IGNORAR.test(nombre)) continue;
          const k = pref + nombre;
          let c = vistos.get(k);
          if (!c) vistos.set(k, (c = { k, n: pref === "T:" ? nombre + " (tipo)" : nombre, cuenta: 0, nums: 0, fechas: 0, u: "", distintos: new Set() }));
          const val = obj[nombre];
          if (val === "" || val === null || val === undefined) continue;
          c.cuenta++;
          if (numDe(val) !== null) { c.nums++; if (!c.u) c.u = unidadDe(val); } else if (fechaDe(val) !== null) c.fechas++;
          if (c.distintos.size < 400) c.distintos.add(String(val));
        }
      }
    }
    const minimo = Math.max(2, muestra.length * 0.01);
    for (const c of vistos.values()) {
      if (c.cuenta < minimo || c.distintos.size < 1) continue;
      campos.set(c.k, { k: c.k, n: c.n + (c.u && c.nums > c.cuenta * 0.6 ? " (" + c.u + ")" : ""), num: c.nums >= c.cuenta * 0.6 && c.distintos.size > 1,
        fecha: c.fechas >= c.cuenta * 0.6, u: c.u, cuenta: c.cuenta, distintos: c.distintos.size });
    }
    estado.campos = campos;
    estado.camposCu = new Map(CUARTOS.map((c) => [c.k, { ...c, cuenta: estado.cuartos.length }]));
  }

  const campo = (k, fuente) => (fuente === "cu" ? estado.camposCu : estado.campos).get(k) || { k, n: k.replace(/^[IT]:/, ""), num: false };
  const busca = (re, num) => { for (const c of estado.campos.values()) if (re.test(c.k) && (!num || c.num)) return c.k; return ""; };

  // ------------------------------------------------------------------ Tablero por defecto
  function tableroInicial() {
    const area = busca(/^I:(Area|Área)$/, true), vol = busca(/^I:(Volume|Volumen)$/, true), largo = busca(/^I:(Length|Longitud)$/, true);
    const t = [];
    if (estado.modoDatos === "tipos") {
      t.push({ titulo: "Tipos por categoría", tipo: "barrash", x: "cat", top: 15 });
      t.push({ titulo: "Clase de familia", tipo: "dona", x: "clase" });
      t.push({ titulo: "Tipos del modelo", tipo: "tabla", x: "tipo", top: 30 });
    } else {
      t.push({ titulo: "Elementos por categoría", tipo: "barrash", x: "cat", top: 12 });
      t.push({ titulo: "Elementos por nivel", tipo: "dona", x: "nivel" });
      if (area) t.push({ titulo: "Área de pisos por nivel", tipo: "barras", x: "nivel", y: area, agg: "suma", filtroCat: catEs("Floors") });
      if (vol) t.push({ titulo: "Volumen por categoría", tipo: "pastel", x: "cat", y: vol, agg: "suma", top: 8 });
      if (area) t.push({ titulo: "Área de muros por tipo", tipo: "barrash", x: "tipo", y: area, agg: "suma", filtroCat: catEs("Walls"), top: 10 });
      t.push({ titulo: "Categorías por nivel", tipo: "calor", x: "cat", x2: "nivel", top: 12 });
      if (largo) t.push({ titulo: "Longitudes (histograma)", tipo: "histograma", y: largo });
      t.push({ titulo: "Tipos más usados", tipo: "tabla", x: "tipo", y: area || "", agg: "suma", top: 15 });
    }
    if (estado.cuartos.length) t.push({ titulo: "Cuartos por área aproximada", tipo: "barrash", fuente: "cu", x: "cu:nombre", y: "cu:area", agg: "suma", top: 15 });
    return t.map((c, i) => ({ id: "t" + i + Date.now().toString(36), agg: "suma", top: 0, ...c }));
  }

  // ------------------------------------------------------------------ Filtros y agregación
  function pasa(f, excluir, fuente) {
    for (const [k, vals] of estado.filtros) {
      if (k === excluir || !vals.size) continue;
      if (fuente === "cu" && k !== "nivel" && !k.startsWith("cu:")) continue;
      if (fuente !== "cu" && k.startsWith("cu:")) continue;
      if (!vals.has(texto(valor(f, k)))) return false;
    }
    return true;
  }
  const filasDe = (card, excluir) => {
    const base = card.fuente === "cu" ? estado.cuartos : estado.filas;
    return base.filter((f) => (!card.filtroCat || card.fuente === "cu" || f.cat === card.filtroCat) && pasa(f, excluir, card.fuente));
  };
  const medida = (filas, y, agg) => {
    if (!y) return filas.length;
    const xs = [];
    for (const f of filas) { const n = numDe(valor(f, y)); if (n !== null) xs.push(n); }
    if (!xs.length) return 0;
    if (agg === "prom") return xs.reduce((a, b) => a + b, 0) / xs.length;
    if (agg === "min") return Math.min(...xs);
    if (agg === "max") return Math.max(...xs);
    return xs.reduce((a, b) => a + b, 0);
  };
  function ordenNiveles(a, b) {
    const ia = estado.niveles.findIndex((n) => n.nombre === a), ib = estado.niveles.findIndex((n) => n.nombre === b);
    if (ia >= 0 || ib >= 0) return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
    return String(a).localeCompare(String(b), "es", { numeric: true });
  }
  function agrupar(card, filas, x) {
    const g = new Map();
    for (const f of filas) { const k = texto(valor(f, x)); let a = g.get(k); if (!a) g.set(k, (a = [])); a.push(f); }
    let res = [...g].map(([k, fs]) => ({ k, filas: fs, v: medida(fs, card.y, card.agg) }));
    const natural = x === "nivel" || card.orden === "nombre" || card.tipo === "lineas" || card.tipo === "areas";
    res.sort(natural ? (a, b) => (x === "nivel" ? ordenNiveles(a.k, b.k) : a.k.localeCompare(b.k, "es", { numeric: true })) : (a, b) => b.v - a.v);
    const top = Number(card.top) || 0;
    if (top > 0 && res.length > top && !natural) {
      const resto = res.slice(top - 1), fs = resto.flatMap((r) => r.filas);
      res = res.slice(0, top - 1).concat([{ k: "Otros (" + resto.length + ")", filas: fs, v: medida(fs, card.y, card.agg), otros: true, claves: resto.map((r) => r.k) }]);
    } else if (top > 0 && res.length > top) res = res.slice(0, top);
    return res;
  }
  const unidadCard = (card) => (card.y ? (campo(card.y, card.fuente).u || "") : "");
  const valorTxt = (card, v) => (card.y ? fmt.format(v) + (unidadCard(card) && card.agg !== "conteo" ? " " + unidadCard(card) : "") : fmt0.format(v));
  const nombreMedida = (card) => (card.y ? ({ suma: "Suma", prom: "Promedio", min: "Mínimo", max: "Máximo" }[card.agg] || "Suma") + " de " + campo(card.y, card.fuente).n : "Conteo");

  function alternarFiltro(k, valores, sumar) {
    let s = estado.filtros.get(k);
    const todos = valores.every((v) => s && s.has(v));
    if (!sumar) { estado.filtros.clear(); s = null; }
    if (!s) estado.filtros.set(k, (s = new Set()));
    for (const v of valores) todos ? s.delete(v) : s.add(v);
    if (!s.size) estado.filtros.delete(k);
    actualizar();
  }
  const seleccionado = (k, v) => { const s = estado.filtros.get(k); return !s || !s.size ? null : s.has(v); };

  // ------------------------------------------------------------------ Efecto en el modelo 3D
  const materiales = { tenue: null, colores: new Map() };
  function material(color) {
    const v = window.__visor;
    const ejemplo = estado.filas.find((f) => f.mallas.length);
    if (!ejemplo) return null;
    const base = Array.isArray(ejemplo.mallas[0].material) ? ejemplo.mallas[0].material[0] : ejemplo.mallas[0].material;
    const Mat = base.constructor;
    if (color === "tenue") {
      if (!materiales.tenue) { materiales.tenue = new Mat({ color: 0xc5ccd6, transparent: true, opacity: 0.12, depthWrite: false }); if ("roughness" in materiales.tenue) materiales.tenue.roughness = 1; }
      return materiales.tenue;
    }
    let m = materiales.colores.get(color);
    if (!m) { m = new Mat({ color }); if ("roughness" in m) m.roughness = 0.75; if ("metalness" in m) m.metalness = 0; materiales.colores.set(color, m); }
    void v;
    return m;
  }
  function ponerMaterial(malla, m) {
    if (!("__tbOriginal" in malla.userData)) malla.userData.__tbOriginal = malla.material;
    malla.material = m || malla.userData.__tbOriginal;
  }
  function aplicarModelo() {
    const v = window.__visor;
    if (!v || estado.modoDatos !== "elementos") return;
    const hayFiltro = [...estado.filtros.keys()].some((k) => !k.startsWith("cu:"));
    const colorDe = new Map();
    if (estado.colorear && estado.abierto) {
      // Mismo orden que las gráficas (niveles de abajo hacia arriba; lo demás, de más a menos elementos).
      agrupar({ y: "", top: 0 }, estado.filas, estado.colorear).forEach((r, i) => colorDe.set(r.k, i < PALETA.length - 1 ? PALETA[i] : OTROS));
      estado.leyenda = [...colorDe].slice(0, PALETA.length);
    } else estado.leyenda = null;
    for (const f of estado.filas) {
      const ok = !hayFiltro || !estado.abierto ? true : pasa(f, null, "el");
      const tenue = !ok && estado.efecto === "atenuar";
      const oculto = !ok && estado.efecto === "aislar";
      if (f.nodo) f.nodo.visible = !oculto;
      const col = colorDe.size ? colorDe.get(texto(valor(f, estado.colorear))) : null;
      for (const m of f.mallas) {
        ponerMaterial(m, tenue ? material("tenue") : col ? material(col) : null);
        m.castShadow = !tenue;
      }
    }
    v.actualizarSombras();
    v.render();
  }

  function encuadrar() {
    const v = window.__visor;
    if (!v || !v.caja) return;
    const caja = new v.caja.constructor();
    let alguno = false;
    for (const f of estado.filas) if (f.nodo && f.nodo.visible !== false && pasa(f, null, "el")) { caja.expandByObject(f.nodo); alguno = true; }
    if (!alguno || caja.isEmpty()) caja.setFromObject(v.modelo);
    if (caja.isEmpty()) return v.ajustarVista();
    const cam = v.camara, ctl = v.controles;
    const centro = caja.getCenter(new v.caja.min.constructor());
    const radio = Math.max(caja.getSize(new v.caja.min.constructor()).length() / 2, 0.5);
    const dir = cam.position.clone().sub(ctl.target).normalize();
    const vfov = ((cam.fov || 50) * Math.PI) / 180, hfov = 2 * Math.atan(Math.tan(vfov / 2) * (cam.aspect || 1));
    let dist = (radio / Math.sin(Math.min(vfov, hfov) / 2)) * 1.02;
    ctl.target.copy(centro);
    // Ajuste fino: la esfera envolvente deja mucho aire en modelos planos (terrenos, naves); se acerca la
    // cámara hasta que las 8 esquinas de la caja ocupen ~90 % de la pantalla (importante en celular).
    const V = v.caja.min.constructor, esquinas = [];
    for (const x of [caja.min.x, caja.max.x]) for (const y of [caja.min.y, caja.max.y]) for (const z of [caja.min.z, caja.max.z]) esquinas.push(new V(x, y, z));
    for (let i = 0; i < 4; i++) {
      cam.position.copy(centro).add(dir.clone().multiplyScalar(dist));
      cam.lookAt(centro);
      cam.updateMatrixWorld(true);
      let ext = 0;
      for (const e of esquinas) { const p = e.clone().project(cam); if (p.z > 1) { ext = 2; break; } ext = Math.max(ext, Math.abs(p.x), Math.abs(p.y)); }
      if (!ext) break;
      const nueva = dist * Math.min(Math.max(ext / 0.9, 0.4), 2.5);
      if (Math.abs(nueva - dist) < dist * 0.02) break;
      dist = nueva;
    }
    cam.position.copy(centro).add(dir.clone().multiplyScalar(dist));
    ctl.update();
    v.render();
  }

  // ------------------------------------------------------------------ Gráficas (SVG propio, sin librerías)
  let W = 460;
  const H = 250;
  const corta = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
  const colorK = (i, r) => (r && r.otros ? OTROS : PALETA[i % (PALETA.length - 1)]);
  const marca = (card, r) => `data-k="${esc(card.x)}" data-v="${esc(r.otros ? r.claves.join("\u0001") : r.k)}"`;
  const opac = (card, r) => { const s = seleccionado(card.x, r.k); return s === false ? ' opacity="0.25"' : ""; };
  const tip = (t) => `<title>${esc(t)}</title>`;
  function ejeY(maximo, x0, y0, alto, ancho, minimo) {
    let s = "";
    const m0 = minimo || 0;
    for (let i = 0; i <= 4; i++) {
      const y = y0 + alto - (alto * i) / 4;
      s += `<line x1="${x0}" x2="${x0 + ancho}" y1="${y}" y2="${y}" class="tb-rejilla"/><text x="${x0 - 6}" y="${y + 4}" text-anchor="end" class="tb-eje">${esc(compacto(m0 + ((maximo - m0) * i) / 4))}</text>`;
    }
    return s;
  }
  const compacto = (n) => (Math.abs(n) >= 1e6 ? fmt.format(n / 1e6) + " M" : Math.abs(n) >= 1e4 ? fmt0.format(n / 1e3) + " k" : fmt.format(n));
  const vacio = (m) => `<div class="tb-vacio">${esc(m || "Sin datos para esta combinación.")}</div>`;

  const DIBUJO = {
    barras(card, filas) {
      const g = agrupar(card, filas, card.x);
      if (!g.length) return vacio();
      const max = Math.max(...g.map((r) => r.v), 1e-9), x0 = 46, y0 = 10, alto = H - 70, ancho = W - x0 - 8, bw = ancho / g.length;
      let s = ejeY(max, x0, y0, alto, ancho);
      g.forEach((r, i) => {
        const h = (alto * r.v) / max, x = x0 + i * bw + bw * 0.12;
        s += `<rect class="tb-marca" ${marca(card, r)} x="${x}" y="${y0 + alto - h}" width="${bw * 0.76}" height="${Math.max(h, 0.5)}" rx="3" fill="${colorK(0, r)}"${opac(card, r)}>${tip(r.k + ": " + valorTxt(card, r.v))}</rect>`;
        s += `<text x="${x + bw * 0.38}" y="${y0 + alto + 12}" class="tb-eje" text-anchor="end" transform="rotate(-35 ${x + bw * 0.38} ${y0 + alto + 12})">${esc(corta(r.k, 16))}</text>`;
      });
      return svg(s);
    },
    barrash(card, filas) {
      const g = agrupar(card, filas, card.x);
      if (!g.length) return vacio();
      const max = Math.max(...g.map((r) => r.v), 1e-9), fila = 22, alto = g.length * fila + 6, x0 = Math.round(Math.min(170, W * 0.38)), ancho = W - x0 - 64, nc = Math.max(10, Math.round(x0 / 6.2));
      let s = "";
      g.forEach((r, i) => {
        const y = 4 + i * fila, w = (ancho * r.v) / max;
        s += `<text x="${x0 - 8}" y="${y + 14}" text-anchor="end" class="tb-etq">${esc(corta(r.k, nc))}</text>`;
        s += `<rect class="tb-marca" ${marca(card, r)} x="${x0}" y="${y + 3}" width="${Math.max(w, 1)}" height="${fila - 8}" rx="3" fill="${colorK(i, r)}"${opac(card, r)}>${tip(r.k + ": " + valorTxt(card, r.v))}</rect>`;
        s += `<text x="${x0 + w + 6}" y="${y + 14}" class="tb-valor">${esc(compacto(r.v))}</text>`;
      });
      return svg(s, alto);
    },
    lineas(card, filas, area) {
      const g = agrupar(card, filas, card.x);
      if (!g.length) return vacio();
      const max = Math.max(...g.map((r) => r.v), 1e-9), x0 = 46, y0 = 10, alto = H - 70, ancho = W - x0 - 14;
      const px = (i) => x0 + (g.length === 1 ? ancho / 2 : (ancho * i) / (g.length - 1)), py = (v) => y0 + alto - (alto * v) / max;
      let s = ejeY(max, x0, y0, alto, ancho);
      const pts = g.map((r, i) => px(i) + "," + py(r.v)).join(" ");
      if (area) s += `<polygon points="${px(0)},${y0 + alto} ${pts} ${px(g.length - 1)},${y0 + alto}" fill="${PALETA[0]}" opacity="0.18"/>`;
      s += `<polyline points="${pts}" fill="none" stroke="${PALETA[0]}" stroke-width="2.4" stroke-linejoin="round"/>`;
      g.forEach((r, i) => {
        s += `<circle class="tb-marca" ${marca(card, r)} cx="${px(i)}" cy="${py(r.v)}" r="5" fill="#fff" stroke="${PALETA[0]}" stroke-width="2.2"${opac(card, r)}>${tip(r.k + ": " + valorTxt(card, r.v))}</circle>`;
        if (g.length <= 24) s += `<text x="${px(i)}" y="${y0 + alto + 12}" class="tb-eje" text-anchor="end" transform="rotate(-35 ${px(i)} ${y0 + alto + 12})">${esc(corta(r.k, 16))}</text>`;
      });
      return svg(s);
    },
    areas(card, filas) { return DIBUJO.lineas(card, filas, true); },
    pastel(card, filas, dona) {
      const g = agrupar(card, filas, card.x).filter((r) => r.v > 0);
      if (!g.length) return vacio();
      const R = Math.round(Math.min(100, W * 0.24)), cx = R + 8, cy = Math.max(R + 8, 118), total = g.reduce((a, r) => a + r.v, 0), ri = dona ? Math.round(R * 0.58) : 0, lx = cx + R + 22, nc = Math.max(8, Math.round((W - lx - 60) / 6.2));
      let s = "", a0 = -Math.PI / 2;
      g.forEach((r, i) => {
        const a1 = a0 + (2 * Math.PI * r.v) / total, grande = a1 - a0 > Math.PI ? 1 : 0;
        const p = (a, rr) => (cx + rr * Math.cos(a)).toFixed(2) + " " + (cy + rr * Math.sin(a)).toFixed(2);
        const d = g.length === 1 ? `M ${cx - R} ${cy} a ${R} ${R} 0 1 0 ${2 * R} 0 a ${R} ${R} 0 1 0 ${-2 * R} 0` + (ri ? ` M ${cx - ri} ${cy} a ${ri} ${ri} 0 1 1 ${2 * ri} 0 a ${ri} ${ri} 0 1 1 ${-2 * ri} 0` : "")
          : `M ${p(a0, R)} A ${R} ${R} 0 ${grande} 1 ${p(a1, R)} ` + (ri ? `L ${p(a1, ri)} A ${ri} ${ri} 0 ${grande} 0 ${p(a0, ri)} Z` : `L ${cx} ${cy} Z`);
        s += `<path class="tb-marca" ${marca(card, r)} d="${d}" fill="${colorK(i, r)}" stroke="#fff" stroke-width="1.5" fill-rule="evenodd"${opac(card, r)}>${tip(r.k + ": " + valorTxt(card, r.v) + " (" + fmt.format((100 * r.v) / total) + " %)")}</path>`;
        a0 = a1;
      });
      if (dona) s += `<text x="${cx}" y="${cy - 2}" text-anchor="middle" class="tb-centro">${esc(compacto(total))}</text><text x="${cx}" y="${cy + 16}" text-anchor="middle" class="tb-eje">${esc(card.y ? unidadCard(card) || "total" : "elementos")}</text>`;
      g.slice(0, 11).forEach((r, i) => {
        const y = 16 + i * 20;
        s += `<g class="tb-marca" ${marca(card, r)}${opac(card, r)}><rect x="${lx}" y="${y - 10}" width="12" height="12" rx="3" fill="${colorK(i, r)}"/><text x="${lx + 18}" y="${y}" class="tb-etq">${esc(corta(r.k, nc))}</text><text x="${W - 4}" y="${y}" text-anchor="end" class="tb-valor">${fmt1.format((100 * r.v) / total)} %</text></g>`;
      });
      return svg(s);
    },
    dona(card, filas) { return DIBUJO.pastel(card, filas, true); },
    dispersion(card, filas) {
      if (!card.y || !card.y2) return vacio("Elige un campo numérico para X (Medida) y otro para Y (Medida 2).");
      const pts = [];
      for (const f of filas) { const a = numDe(valor(f, card.y)), b = numDe(valor(f, card.y2)); if (a !== null && b !== null) pts.push([a, b, f]); }
      if (!pts.length) return vacio();
      const lista = pts.length > 3000 ? pts.filter((_, i) => i % Math.ceil(pts.length / 3000) === 0) : pts;
      const [xmin, xmax] = rango(lista.map((p) => p[0])), [ymin, ymax] = rango(lista.map((p) => p[1]));
      const x0 = 46, y0 = 10, alto = H - 50, ancho = W - x0 - 10;
      const colores = new Map();
      if (card.x) agrupar({ ...card, y: "", top: 0 }, filas, card.x).forEach((r, i) => colores.set(r.k, i < PALETA.length - 1 ? PALETA[i] : OTROS));
      let s = ejeY(ymax, x0, y0, alto, ancho, ymin);
      for (const [a, b, f] of lista) {
        const cx = x0 + ((a - xmin) / (xmax - xmin || 1)) * ancho, cy = y0 + alto - ((b - ymin) / (ymax - ymin || 1)) * alto;
        const g = card.x ? texto(valor(f, card.x)) : "";
        s += `<circle class="tb-marca" data-k="__id" data-v="${esc(f.id)}" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="3.6" fill="${card.x ? colores.get(g) || OTROS : PALETA[0]}" opacity="0.75">${tip((f.tipo || f.nombre || "") + (g ? " · " + g : "") + "\n" + campo(card.y).n + ": " + fmt.format(a) + "\n" + campo(card.y2).n + ": " + fmt.format(b))}</circle>`;
      }
      s += `<text x="${x0 + ancho}" y="${H - 8}" text-anchor="end" class="tb-eje">${esc(campo(card.y, card.fuente).n)} → (${esc(compacto(xmin))} a ${esc(compacto(xmax))})</text>`;
      return svg(s);
    },
    histograma(card, filas) {
      if (!card.y) return vacio("Elige un campo numérico en Medida.");
      const xs = filas.map((f) => numDe(valor(f, card.y))).filter((n) => n !== null);
      if (!xs.length) return vacio();
      const [a, b] = rango(xs), n = Math.min(14, Math.max(4, Math.round(Math.sqrt(xs.length)))), paso = (b - a) / n || 1;
      const cubetas = Array.from({ length: n }, (_, i) => ({ desde: a + i * paso, hasta: a + (i + 1) * paso, c: 0 }));
      for (const x of xs) cubetas[Math.min(n - 1, Math.floor((x - a) / paso))].c++;
      const max = Math.max(...cubetas.map((c) => c.c)), x0 = 46, y0 = 10, alto = H - 62, ancho = W - x0 - 8, bw = ancho / n;
      let s = ejeY(max, x0, y0, alto, ancho);
      cubetas.forEach((c, i) => {
        const h = (alto * c.c) / max;
        s += `<rect x="${x0 + i * bw + 1}" y="${y0 + alto - h}" width="${bw - 2}" height="${Math.max(h, 0.5)}" fill="${PALETA[2]}" rx="2">${tip(fmt.format(c.desde) + " – " + fmt.format(c.hasta) + ": " + c.c + " elementos")}</rect>`;
        if (i % Math.ceil(n / 7) === 0) s += `<text x="${x0 + i * bw}" y="${y0 + alto + 14}" class="tb-eje">${esc(compacto(c.desde))}</text>`;
      });
      s += `<text x="${x0 + ancho}" y="${H - 6}" text-anchor="end" class="tb-eje">${esc(campo(card.y, card.fuente).n)}</text>`;
      return svg(s);
    },
    caja(card, filas) {
      if (!card.y) return vacio("Elige un campo numérico en Medida y un campo para agrupar.");
      const g = agrupar({ ...card, y: "" }, filas, card.x || "cat").slice(0, 10);
      const datos = g.map((r) => ({ r, xs: r.filas.map((f) => numDe(valor(f, card.y))).filter((n) => n !== null).sort((a, b) => a - b) })).filter((d) => d.xs.length);
      if (!datos.length) return vacio();
      const q = (xs, p) => { const i = (xs.length - 1) * p, lo = Math.floor(i); return xs[lo] + (xs[Math.ceil(i)] - xs[lo]) * (i - lo); };
      const max = Math.max(...datos.map((d) => d.xs[d.xs.length - 1])), min = Math.min(0, ...datos.map((d) => d.xs[0]));
      const x0 = 46, y0 = 10, alto = H - 70, ancho = W - x0 - 8, bw = ancho / datos.length, py = (v) => y0 + alto - ((v - min) / (max - min || 1)) * alto;
      let s = ejeY(max, x0, y0, alto, ancho, min);
      datos.forEach((d, i) => {
        const cx = x0 + i * bw + bw / 2, w = Math.min(bw * 0.5, 40), [mn, q1, me, q3, mx] = [d.xs[0], q(d.xs, 0.25), q(d.xs, 0.5), q(d.xs, 0.75), d.xs[d.xs.length - 1]];
        s += `<g class="tb-marca" ${marca(card.x ? card : { ...card, x: "cat" }, d.r)}${opac(card, d.r)}>${tip(d.r.k + "\nMín " + fmt.format(mn) + " · Q1 " + fmt.format(q1) + " · Mediana " + fmt.format(me) + " · Q3 " + fmt.format(q3) + " · Máx " + fmt.format(mx))}
          <line x1="${cx}" x2="${cx}" y1="${py(mx)}" y2="${py(mn)}" stroke="#5d6b7c"/><rect x="${cx - w / 2}" y="${py(q3)}" width="${w}" height="${Math.max(py(q1) - py(q3), 1)}" fill="${PALETA[i % 11]}" opacity="0.8" rx="2"/>
          <line x1="${cx - w / 2}" x2="${cx + w / 2}" y1="${py(me)}" y2="${py(me)}" stroke="#0b1220" stroke-width="2"/></g>`;
        s += `<text x="${cx}" y="${y0 + alto + 12}" class="tb-eje" text-anchor="end" transform="rotate(-35 ${cx} ${y0 + alto + 12})">${esc(corta(d.r.k, 16))}</text>`;
      });
      return svg(s);
    },
    burbujas(card, filas) {
      if (!card.y || !card.y2) return vacio("Elige Medida (eje X) y Medida 2 (eje Y); el tamaño es el número de elementos.");
      const g = agrupar({ ...card, y: "" }, filas, card.x || "cat").slice(0, 14).map((r) => ({ r, a: medida(r.filas, card.y, card.agg), b: medida(r.filas, card.y2, card.agg2 || card.agg), n: r.filas.length }));
      if (!g.length) return vacio();
      const [xmin, xmax] = rango(g.map((d) => d.a)), [ymin, ymax] = rango(g.map((d) => d.b)), nmax = Math.max(...g.map((d) => d.n));
      const x0 = 56, y0 = 20, alto = H - 60, ancho = W - x0 - 30;
      let s = ejeY(ymax, x0, y0, alto, ancho, ymin);
      g.forEach((d, i) => {
        const cx = x0 + ((d.a - xmin) / (xmax - xmin || 1)) * ancho, cy = y0 + alto - ((d.b - ymin) / (ymax - ymin || 1)) * alto, r = 6 + 22 * Math.sqrt(d.n / nmax);
        s += `<circle class="tb-marca" ${marca(card.x ? card : { ...card, x: "cat" }, d.r)} cx="${cx}" cy="${cy}" r="${r}" fill="${PALETA[i % 11]}" opacity="0.6" stroke="#fff"${opac(card, d.r)}>${tip(d.r.k + "\n" + nombreMedida(card) + ": " + fmt.format(d.a) + "\n" + campo(card.y2, card.fuente).n + ": " + fmt.format(d.b) + "\n" + d.n + " elementos")}</circle>`;
        if (r >= 15) s += `<text x="${cx}" y="${cy + 4}" text-anchor="middle" class="tb-eje">${esc(corta(d.r.k, Math.round(r / 3.2)))}</text>`;
      });
      return svg(s);
    },
    radar(card, filas) {
      const g = agrupar({ ...card, top: Math.min(Number(card.top) || 8, 10) }, filas, card.x).slice(0, 10);
      if (g.length < 3) return vacio("El radar necesita al menos 3 valores.");
      const max = Math.max(...g.map((r) => r.v), 1e-9), cx = W / 2, cy = 125, R = 92, n = g.length;
      const p = (i, f) => [cx + R * f * Math.sin((2 * Math.PI * i) / n), cy - R * f * Math.cos((2 * Math.PI * i) / n)];
      let s = "";
      for (const f of [0.25, 0.5, 0.75, 1]) s += `<polygon points="${g.map((_, i) => p(i, f).join(",")).join(" ")}" class="tb-rejilla" fill="none"/>`;
      g.forEach((r, i) => { const [x, y] = p(i, 1.16); s += `<line x1="${cx}" y1="${cy}" x2="${p(i, 1)[0]}" y2="${p(i, 1)[1]}" class="tb-rejilla"/><text x="${x}" y="${y + 4}" text-anchor="middle" class="tb-eje">${esc(corta(r.k, 16))}</text>`; });
      s += `<polygon points="${g.map((r, i) => p(i, r.v / max).join(",")).join(" ")}" fill="${PALETA[0]}" fill-opacity="0.25" stroke="${PALETA[0]}" stroke-width="2"/>`;
      g.forEach((r, i) => { const [x, y] = p(i, r.v / max); s += `<circle class="tb-marca" ${marca(card, r)} cx="${x}" cy="${y}" r="4.5" fill="${PALETA[0]}"${opac(card, r)}>${tip(r.k + ": " + valorTxt(card, r.v))}</circle>`; });
      return svg(s);
    },
    calor(card, filas) {
      if (!card.x || !card.x2) return vacio("Elige el campo de columnas (Agrupar por) y el de filas (Agrupar 2).");
      const cols = agrupar({ ...card, y: "" }, filas, card.x).slice(0, Number(card.top) || 12).map((r) => r.k);
      const filasK = agrupar({ ...card, y: "", top: 0 }, filas, card.x2).slice(0, 12).map((r) => r.k);
      if (!cols.length || !filasK.length) return vacio();
      const celdas = new Map();
      for (const f of filas) { const a = texto(valor(f, card.x)), b = texto(valor(f, card.x2)); if (!cols.includes(a) || !filasK.includes(b)) continue; const k = a + "\u0001" + b; let c = celdas.get(k); if (!c) celdas.set(k, (c = [])); c.push(f); }
      const vals = new Map([...celdas].map(([k, fs]) => [k, medida(fs, card.y, card.agg)])), max = Math.max(...vals.values(), 1e-9);
      const x0 = Math.round(Math.min(120, W * 0.28)), y0 = 74, cw = (W - x0 - 4) / cols.length, ch = 22, alto = y0 + filasK.length * ch + 4;
      let s = "";
      cols.forEach((c, i) => { const x = x0 + i * cw + cw / 2; s += `<text x="${x}" y="${y0 - 6}" class="tb-eje" transform="rotate(-45 ${x} ${y0 - 6})">${esc(corta(c, 14))}</text>`; });
      filasK.forEach((b, j) => {
        s += `<text x="${x0 - 6}" y="${y0 + j * ch + 15}" text-anchor="end" class="tb-etq">${esc(corta(b, 16))}</text>`;
        cols.forEach((a, i) => {
          const v = vals.get(a + "\u0001" + b) || 0, t = v / max;
          s += `<rect class="tb-marca" data-k="${esc(card.x2)}" data-v="${esc(b)}" data-k2="${esc(card.x)}" data-v2="${esc(a)}" x="${x0 + i * cw + 1}" y="${y0 + j * ch + 1}" width="${cw - 2}" height="${ch - 2}" rx="3" fill="${v ? `rgba(10,132,255,${(0.1 + 0.9 * t).toFixed(3)})` : "#f1f4f8"}">${tip(b + " · " + a + ": " + valorTxt(card, v))}</rect>`;
          if (v && cw > 26) s += `<text x="${x0 + i * cw + cw / 2}" y="${y0 + j * ch + 15}" text-anchor="middle" class="tb-celda" fill="${t > 0.55 ? "#fff" : "#1c2733"}">${esc(compacto(v))}</text>`;
        });
      });
      return svg(s, alto);
    },
    gantt(card, filas) {
      if (!card.y || !card.y2) return vacio("Elige el campo de fecha de inicio (Medida) y el de fin (Medida 2). Formatos: AAAA-MM-DD o DD/MM/AAAA.");
      const g = agrupar({ ...card, y: "", orden: "nombre" }, filas, card.x || "tipo").map((r) => {
        let a = Infinity, b = -Infinity;
        for (const f of r.filas) { const i = fechaDe(valor(f, card.y)), e = fechaDe(valor(f, card.y2)); if (i !== null) a = Math.min(a, i); if (e !== null) b = Math.max(b, e); }
        return { r, a, b };
      }).filter((d) => isFinite(d.a) && isFinite(d.b)).sort((p, q) => p.a - q.a).slice(0, 18);
      if (!g.length) return vacio("No encontré fechas válidas en esos campos.");
      const a = Math.min(...g.map((d) => d.a)), b = Math.max(...g.map((d) => d.b)), x0 = Math.round(Math.min(150, W * 0.34)), ancho = W - x0 - 8, fila = 20, alto = g.length * fila + 26;
      const px = (t) => x0 + ((t - a) / (b - a || 1)) * ancho, dia = (t) => new Date(t).toLocaleDateString("es-MX", { day: "2-digit", month: "short", timeZone: "UTC" });
      let s = "";
      for (let i = 0; i <= 4; i++) { const t = a + ((b - a) * i) / 4; s += `<line x1="${px(t)}" x2="${px(t)}" y1="0" y2="${alto - 20}" class="tb-rejilla"/><text x="${px(t)}" y="${alto - 6}" text-anchor="middle" class="tb-eje">${esc(dia(t))}</text>`; }
      g.forEach((d, i) => {
        const y = 4 + i * fila;
        s += `<text x="${x0 - 6}" y="${y + 13}" text-anchor="end" class="tb-etq">${esc(corta(d.r.k, 22))}</text>`;
        s += `<rect class="tb-marca" ${marca({ ...card, x: card.x || "tipo" }, d.r)} x="${px(d.a)}" y="${y + 3}" width="${Math.max(px(d.b) - px(d.a), 3)}" height="${fila - 7}" rx="3" fill="${PALETA[i % 11]}"${opac(card, d.r)}>${tip(d.r.k + ": " + dia(d.a) + " → " + dia(d.b))}</rect>`;
      });
      return svg(s, alto);
    },
    flujo(card, filas) {
      if (!card.x || !card.x2) return vacio("Elige el campo de origen (Agrupar por) y el de destino (Agrupar 2).");
      const izq = agrupar(card, filas, card.x).slice(0, 8), der = agrupar({ ...card }, filas, card.x2).slice(0, 8);
      if (!izq.length || !der.length) return vacio();
      const ki = new Set(izq.map((r) => r.k)), kd = new Set(der.map((r) => r.k));
      const enlaces = new Map();
      for (const f of filas) { const a = texto(valor(f, card.x)), b = texto(valor(f, card.x2)); if (!ki.has(a) || !kd.has(b)) continue; const k = a + "\u0001" + b; let l = enlaces.get(k); if (!l) enlaces.set(k, (l = [])); l.push(f); }
      const total = izq.reduce((s, r) => s + r.v, 0) || 1, alto = 236, hueco = 6, util = (n) => alto - hueco * (n - 1);
      const pos = (lista) => { let y = 4; const n = lista.length; return new Map(lista.map((r) => { const h = (util(n) * r.v) / total; const p = { y, h, usado: 0 }; y += h + hueco; return [r.k, p]; })); };
      const pi = pos(izq), pd = pos(der), xa = Math.round(W * 0.3), xb = Math.round(W * 0.7), nf = Math.max(8, Math.round(xa / 6.5));
      let s = "";
      [...enlaces].sort((p, q) => medida(q[1], card.y, card.agg) - medida(p[1], card.y, card.agg)).forEach(([k, fs]) => {
        const [a, b] = k.split("\u0001"), v = medida(fs, card.y, card.agg), h = (util(izq.length) * v) / total;
        const A = pi.get(a), B = pd.get(b), ya = A.y + A.usado + h / 2, yb = B.y + B.usado + h / 2; A.usado += h; B.usado += h;
        s += `<path class="tb-marca" data-k="${esc(card.x)}" data-v="${esc(a)}" data-k2="${esc(card.x2)}" data-v2="${esc(b)}" d="M ${xa} ${ya} C ${(xa + xb) / 2} ${ya}, ${(xa + xb) / 2} ${yb}, ${xb} ${yb}" fill="none" stroke="${PALETA[izq.findIndex((r) => r.k === a) % 11]}" stroke-opacity="0.35" stroke-width="${Math.max(h, 1)}">${tip(a + " → " + b + ": " + valorTxt(card, v))}</path>`;
      });
      izq.forEach((r, i) => { const p = pi.get(r.k); s += `<rect class="tb-marca" ${marca(card, r)} x="${xa - 10}" y="${p.y}" width="10" height="${Math.max(p.h, 1)}" fill="${PALETA[i % 11]}">${tip(r.k + ": " + valorTxt(card, r.v))}</rect>${p.h >= 9 ? `<text x="${xa - 14}" y="${p.y + p.h / 2 + 4}" text-anchor="end" class="tb-etq">${esc(corta(r.k, nf))}</text>` : ""}`; });
      der.forEach((r) => { const p = pd.get(r.k); s += `<rect class="tb-marca" ${marca({ ...card, x: card.x2 }, r)} x="${xb}" y="${p.y}" width="10" height="${Math.max(p.h, 1)}" fill="#5d6b7c">${tip(r.k + ": " + valorTxt(card, r.v))}</rect>${p.h >= 9 ? `<text x="${xb + 14}" y="${p.y + p.h / 2 + 4}" class="tb-etq">${esc(corta(r.k, nf))}</text>` : ""}`; });
      return svg(s, alto + 6);
    },
    tabla(card, filas) {
      const g = agrupar(card, filas, card.x);
      if (!g.length) return vacio();
      const total = g.reduce((a, r) => a + r.v, 0);
      let h = `<table class="tb-tabla"><thead><tr><th>${esc(campo(card.x, card.fuente).n)}</th><th>Elementos</th>${card.y ? `<th>${esc(nombreMedida(card))}</th>` : ""}<th>%</th></tr></thead><tbody>`;
      for (const r of g) {
        const sel = seleccionado(card.x, r.k);
        h += `<tr class="tb-marca${sel ? " tb-sel" : ""}" ${marca(card, r)}${sel === false ? ' style="opacity:.4"' : ""}><td>${esc(r.k)}</td><td>${fmt0.format(r.filas.length)}</td>${card.y ? `<td>${esc(fmt.format(r.v))}</td>` : ""}<td>${total ? fmt.format((100 * r.v) / total) : 0}</td></tr>`;
      }
      return h + `</tbody></table>`;
    }
  };
  const rango = (xs) => { const a = Math.min(...xs), b = Math.max(...xs); return a === b ? [a - 1, b + 1] : [a, b]; };
  const svg = (contenido, alto) => `<svg viewBox="0 0 ${W} ${alto || H}" width="${W}" class="tb-svg" preserveAspectRatio="xMidYMin meet">${contenido}</svg>`;

  const TIPOS = [
    ["barras", "Barras"], ["barrash", "Barras horizontales"], ["lineas", "Líneas"], ["areas", "Áreas"], ["pastel", "Pastel"], ["dona", "Dona"],
    ["dispersion", "Dispersión"], ["histograma", "Histograma"], ["caja", "Caja (boxplot)"], ["burbujas", "Burbujas"], ["radar", "Radar"],
    ["calor", "Mapa de calor"], ["gantt", "Gantt"], ["flujo", "Flujo (Sankey)"], ["tabla", "Tabla"]
  ];

  // ------------------------------------------------------------------ Interfaz
  const css = document.createElement("style");
  css.textContent = `
  #tb-panel { position: fixed; top: 0; right: 0; bottom: 0; width: var(--tb-ancho, 46vw); background: #f6f8fb; border-left: 1px solid var(--borde);
              box-shadow: -8px 0 28px rgba(16,24,40,.10); display: flex; flex-direction: column; z-index: 5; -webkit-user-select: text; user-select: text; }
  #tb-cab { display: flex; align-items: center; gap: 8px; padding: 10px 12px; background: #fff; border-bottom: 1px solid var(--borde); flex-wrap: wrap; }
  #tb-cab h2 { margin: 0; font-size: 15px; flex: 1 1 auto; min-width: 120px; }
  #tb-cab h2 small { display: block; font-weight: 400; color: var(--tenue); font-size: 11.5px; }
  .tb-btn { font: inherit; padding: 5px 10px; border-radius: 8px; border: 1px solid var(--borde); background: #fff; color: var(--texto); cursor: pointer; white-space: nowrap; }
  .tb-btn:hover { background: #f1f4f8; } .tb-btn.lleno { background: var(--acento); border-color: var(--acento); color: #fff; }
  .tb-btn.icono { padding: 4px 8px; }
  #tb-controles { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; padding: 8px 12px; border-bottom: 1px solid var(--borde); background: #fff; }
  #tb-controles label { display: flex; gap: 5px; align-items: center; color: var(--tenue); }
  #tb-panel select, #tb-panel input[type=text], #tb-panel input[type=number] { font: inherit; padding: 4px 6px; border-radius: 8px; border: 1px solid var(--borde); background: #fff; color: var(--texto); max-width: 100%; }
  #tb-filtros { display: flex; gap: 6px; flex-wrap: wrap; padding: 0 12px; }
  #tb-filtros:not(:empty) { padding: 8px 12px 0; }
  .tb-chip { display: inline-flex; gap: 6px; align-items: center; background: #e8f2ff; color: var(--acento); border: 1px solid #b6d6ff; border-radius: 999px; padding: 3px 4px 3px 10px; font-size: 12px; }
  .tb-chip button { border: 0; background: transparent; color: inherit; cursor: pointer; font-size: 13px; padding: 0 6px; }
  #tb-cuerpo { flex: 1; overflow: auto; padding: 12px; }
  #tb-kpis { display: grid; grid-template-columns: repeat(auto-fill, minmax(118px, 1fr)); gap: 8px; margin-bottom: 12px; }
  .tb-kpi { background: #fff; border: 1px solid var(--borde); border-radius: 12px; padding: 9px 11px; }
  .tb-kpi b { display: block; font-size: 19px; white-space: nowrap; font-weight: 650; color: #0b1220; font-variant-numeric: tabular-nums; }
  .tb-kpi { position: relative; } .tb-kpi.fija { background: #f8fafc; border-style: dashed; }
  .tb-kpi-edit { position: absolute; right: 4px; top: 4px; border: 0; background: transparent; color: var(--tenue); cursor: pointer; opacity: 0; padding: 2px 5px; border-radius: 6px; }
  .tb-kpi:hover .tb-kpi-edit { opacity: 1; } .tb-kpi-edit:hover { background: #f1f4f8; }
  .tb-kpi-nueva { font: inherit; color: var(--acento); border: 1px dashed #b6d6ff !important; background: #f7fbff; cursor: pointer; min-height: 58px; }
  .tb-kpi.editando { grid-column: 1 / -1; padding: 0; border: 0; background: transparent; } .tb-editor-ficha { margin: 0; }
  #tb-seleccion { background: #fff; border: 1px solid #b6d6ff; border-radius: 12px; padding: 10px 12px; margin-bottom: 12px; }
  #tb-seleccion h3 { margin: 0 0 6px; font-size: 13px; display: flex; gap: 8px; align-items: center; } #tb-seleccion h3 span { flex: 1; }
  #tb-seleccion dl { display: grid; grid-template-columns: minmax(110px, auto) 1fr; gap: 3px 12px; margin: 0; font-size: 12px; max-height: 220px; overflow: auto; }
  #tb-seleccion dt { color: var(--tenue); } #tb-seleccion dd { margin: 0; overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
  .tb-btn.activo { border-color: var(--acento); color: var(--acento); background: #f2f8ff; }
  body.tb-seleccionando #lienzo { cursor: pointer !important; }
  .tb-kpi span { color: var(--tenue); font-size: 11.5px; } .tb-kpi b small { font-size: 12px; font-weight: 500; color: var(--tenue); margin-left: 3px; }
  #tb-tarjetas { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 12px; }
  .tb-card { background: #fff; border: 1px solid var(--borde); border-radius: 12px; padding: 10px 12px 8px; min-width: 0; }
  .tb-card.ancha { grid-column: 1 / -1; }
  .tb-card header { display: flex; align-items: center; gap: 4px; margin-bottom: 4px; }
  .tb-card h3 { margin: 0; font-size: 13px; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tb-card header button { border: 0; background: transparent; color: var(--tenue); cursor: pointer; padding: 2px 6px; border-radius: 6px; font-size: 13px; }
  .tb-card header button:hover { background: #f1f4f8; color: var(--texto); }
  .tb-sub { color: var(--tenue); font-size: 11px; margin-bottom: 4px; }
  .tb-svg { width: 100%; height: auto; display: block; overflow: visible; }
  .tb-svg text { font-family: inherit; }
  .tb-eje { font-size: 10px; fill: #6b7887; } .tb-etq { font-size: 11px; fill: #1c2733; } .tb-valor { font-size: 10.5px; fill: #5d6b7c; font-variant-numeric: tabular-nums; }
  .tb-celda { font-size: 9.5px; } .tb-centro { font-size: 20px; font-weight: 650; fill: #0b1220; }
  .tb-rejilla { stroke: #e6eaf0; stroke-width: 1; }
  .tb-marca { cursor: pointer; transition: opacity .15s; } .tb-marca:hover { opacity: .8; }
  .tb-vacio { color: var(--tenue); padding: 26px 8px; text-align: center; font-size: 12px; }
  .tb-tabla { width: 100%; border-collapse: collapse; font-size: 12px; font-variant-numeric: tabular-nums; }
  .tb-tabla th { text-align: left; color: var(--tenue); font-weight: 600; border-bottom: 1px solid var(--borde); padding: 5px 6px; position: sticky; top: 0; background: #fff; }
  .tb-tabla th { white-space: normal; font-size: 11px; } .tb-tabla td:first-child { word-break: break-word; }
  .tb-tabla td { padding: 4px 6px; border-bottom: 1px solid #f0f2f5; } .tb-tabla td:not(:first-child), .tb-tabla th:not(:first-child) { text-align: right; }
  .tb-tabla tr.tb-sel td { background: #e8f2ff; color: var(--acento); font-weight: 600; }
  .tb-card .tb-scroll { max-height: 300px; overflow: auto; }
  .tb-editor select, .tb-editor input { width: 100%; min-width: 0; }
  .tb-editor { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 6px 8px; align-items: center; background: #f6f8fb; border-radius: 10px; padding: 8px; margin-bottom: 6px; font-size: 12px; }
  .tb-editor label { color: var(--tenue); } .tb-editor .tb-acc { grid-column: 1 / -1; display: flex; gap: 6px; justify-content: flex-end; }
  #tb-leyenda { position: fixed; left: 14px; top: 64px; background: rgba(255,255,255,.94); border: 1px solid var(--borde); border-radius: 10px; padding: 8px 10px; font-size: 12px; max-width: 240px; z-index: 4; }
  #tb-leyenda div { display: flex; gap: 6px; align-items: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  #tb-leyenda i { width: 11px; height: 11px; border-radius: 3px; flex: none; }
  #tb-aviso { background: #fff7e6; border: 1px solid #ffd591; color: #874d00; border-radius: 10px; padding: 8px 10px; margin-bottom: 12px; font-size: 12px; }
  body.tb-abierto #lienzo { width: calc(100% - var(--tb-ancho, 46vw)); }
  body.tb-abierto #barra, body.tb-abierto .panel { left: calc((100vw - var(--tb-ancho, 46vw)) / 2); max-width: calc(100vw - var(--tb-ancho, 46vw) - 16px); }
  body.tb-completo #barra, body.tb-completo .panel:not(#tb-panel), body.tb-completo #cabecera, body.tb-completo #tb-leyenda { display: none !important; }
  @media (max-width: 900px) {
    #tb-panel { top: auto; left: 0; width: 100%; height: var(--tb-alto, 44vh); border-left: 0; border-top: 1px solid var(--borde); border-radius: 14px 14px 0 0; }
    body.tb-abierto #lienzo { width: 100%; height: calc(100% - var(--tb-alto, 44vh)); }
    body.tb-abierto #barra { left: 50%; max-width: calc(100vw - 16px); bottom: calc(var(--tb-alto, 44vh) + 8px); }
    body.tb-abierto .panel:not(#tb-panel) { left: 50%; max-width: calc(100vw - 16px); bottom: calc(var(--tb-alto, 44vh) + 60px) !important; }
    #tb-tarjetas { grid-template-columns: 1fr; } #tb-ancho-sel { display: none; }
    #tb-kpis { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; } .tb-kpi { padding: 6px 8px; } .tb-kpi b { font-size: 15px; } .tb-kpi b small { display: none; }
    #tb-controles { gap: 6px; padding: 6px 10px; } #tb-cab { padding: 8px 10px; }
  }
  #tb-expandir { display: none; }
  @media (max-width: 900px) {
    #tb-expandir { display: inline-block; }
    body.tb-expandido { --tb-alto: 86vh; }
    #tb-cab h2 { font-size: 14px; } #tb-cab h2 small { font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    #tb-controles .tb-lbl { display: none; }
    #tb-controles { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
    #tb-controles label, #tb-controles select { width: 100%; min-width: 0; }
    #tb-controles > span[style] { display: none; }
    #tb-controles .tb-btn { padding: 5px 6px; font-size: 12px; text-align: center; }
    #tb-panel select { font-size: 12.5px; padding: 3px 4px; }
    #tb-cuerpo { padding: 8px; }
    .tb-card { padding: 8px 8px 6px; } .tb-card h3 { font-size: 12.5px; }
    #cabecera { padding: 4px 8px; top: 8px; left: 8px; } #cabecera .marca { font-size: 10px; } #titulo { font-size: 12px; }
  }
  @media print { #barra, .panel:not(#tb-panel), #tb-controles, .tb-card header button { display: none !important; } #tb-panel { position: static; width: 100%; } }
  `;
  document.head.append(css);

  const boton = document.createElement("button");
  boton.id = "btn-tableros";
  boton.title = "Tableros BIM: indicadores y gráficas con los datos del modelo";
  boton.innerHTML = '<svg viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg><span>Tableros</span>';
  const barra = $("barra");
  barra.insertBefore(boton, barra.querySelector('button[data-h="config"]') || null);

  const panel = document.createElement("aside");
  panel.id = "tb-panel";
  panel.hidden = true;
  panel.setAttribute("aria-label", "Tableros BIM");
  panel.innerHTML = `
    <div id="tb-cab">
      <h2>Tableros BIM<small id="tb-resumen"></small></h2>
      <select id="tb-ancho-sel" title="Ancho del tablero"><option value="34">Angosto</option><option value="46" selected>Medio</option><option value="62">Ancho</option><option value="100">Pantalla completa</option></select>
      <button class="tb-btn icono" id="tb-expandir" title="Agrandar o achicar el tablero" aria-label="Agrandar o achicar el tablero">▲</button>
      <button class="tb-btn icono" id="tb-cerrar" title="Cerrar tableros" aria-label="Cerrar tableros">✕</button>
    </div>
    <div id="tb-controles">
      <label><span class="tb-lbl">Al filtrar</span> <select id="tb-efecto" title="Qué pasa en el modelo al filtrar"><option value="atenuar">Atenuar el resto</option><option value="aislar">Aislar</option><option value="nada">No cambiar el 3D</option></select></label>
      <label><span class="tb-lbl">Colorear por</span> <select id="tb-colorear" title="Colorear el modelo por un campo"><option value="">(colores originales)</option></select></label>
      <button class="tb-btn" id="tb-seleccionar" title="Clic en el modelo para seleccionar elementos (Ctrl+clic para sumar)">Seleccionar en 3D</button>
      <button class="tb-btn" id="tb-encuadrar" title="Acercar la vista a los elementos filtrados">Encuadrar</button>
      <button class="tb-btn" id="tb-limpiar">Quitar filtros</button>
      <span style="flex:1"></span>
      <button class="tb-btn lleno" id="tb-agregar">+ Gráfica</button>
      <button class="tb-btn" id="tb-mas" title="Compartir, exportar o restablecer">⋯</button>
    </div>
    <div id="tb-filtros"></div>
    <div id="tb-cuerpo"><div id="tb-aviso" hidden></div><div id="tb-seleccion" hidden></div><div id="tb-kpis"></div><div id="tb-tarjetas"></div></div>`;
  document.body.append(panel);
  const leyenda = document.createElement("div");
  leyenda.id = "tb-leyenda";
  leyenda.hidden = true;
  document.body.append(leyenda);

  const menu = document.createElement("div");
  menu.className = "panel columna";
  menu.id = "tb-menu";
  menu.hidden = true;
  menu.style.cssText = "position:fixed;left:auto;right:14px;top:96px;bottom:auto;transform:none;z-index:6;align-items:stretch";
  menu.innerHTML = `<button id="tb-compartir">Copiar enlace con este tablero</button><button id="tb-csv">Descargar datos (CSV)</button>
    <button id="tb-imprimir">Imprimir / guardar PDF</button><button id="tb-restablecer">Restablecer tablero por defecto</button>`;
  document.body.append(menu);
  if (soloLectura) {
    $("tb-agregar").hidden = true;
    $("tb-compartir").hidden = true;
    $("tb-restablecer").hidden = true;
    // Versión pública: sin exportar datos ni imprimir.
    $("tb-mas").hidden = true;
    $("tb-csv").hidden = true;
    $("tb-imprimir").hidden = true;
  }

  // ------------------------------------------------------------------ Render
  const claveLocal = () => "blg-tableros:" + (new URLSearchParams(location.search).get("m") || location.pathname);
  const paquete = () => ({ t: estado.tarjetas.map(({ editando, ...c }) => c), f: estado.fichas.map(({ editando, ...c }) => c) });
  function guardar() { if (soloLectura) return; try { localStorage.setItem(claveLocal(), JSON.stringify(paquete())); } catch (e) { /* navegador sin almacenamiento */ } }

  // ------------------------------------------------------------------ Fichas (indicadores)
  // Cada ficha: { id, titulo, calculo: conteo|distintos|suma|prom|min|max, campo, filtroCat, fuente: el|cu, modo: dinamica|fija }
  // Dinámica: responde a los filtros y a la selección de elementos. Fija: siempre muestra el total del modelo.
  const CALCULOS = [["conteo", "Conteo de elementos"], ["distintos", "Valores distintos de…"], ["suma", "Suma de…"], ["prom", "Promedio de…"], ["min", "Mínimo de…"], ["max", "Máximo de…"]];
  function fichasIniciales() {
    const area = busca(/^I:(Area|Área)$/, true), vol = busca(/^I:(Volume|Volumen)$/, true);
    const f = [];
    if (estado.modoDatos === "elementos") {
      f.push({ titulo: "Elementos", calculo: "conteo" });
      f.push({ titulo: "Categorías", calculo: "distintos", campo: "cat" });
      f.push({ titulo: "Tipos", calculo: "distintos", campo: "tipo" });
      f.push({ titulo: "Niveles", calculo: "distintos", campo: "nivel" });
      if (area) f.push({ titulo: "Área de pisos", calculo: "suma", campo: area, filtroCat: catEs("Floors") });
      if (area) f.push({ titulo: "Área de muros", calculo: "suma", campo: area, filtroCat: catEs("Walls") });
      if (vol) f.push({ titulo: "Volumen total", calculo: "suma", campo: vol });
    } else {
      f.push({ titulo: "Tipos", calculo: "conteo" });
      f.push({ titulo: "Categorías", calculo: "distintos", campo: "cat" });
    }
    if (estado.cuartos.length) f.push({ titulo: "Cuartos", calculo: "conteo", fuente: "cu" });
    return f.map((x, i) => ({ id: "f" + i + Date.now().toString(36), modo: "dinamica", fuente: "el", ...x }));
  }
  function valorFicha(fi) {
    const cu = fi.fuente === "cu";
    let fs = (cu ? estado.cuartos : estado.filas).filter((f) => cu || !fi.filtroCat || f.cat === fi.filtroCat);
    if (fi.modo !== "fija") fs = fs.filter((f) => pasa(f, null, cu ? "cu" : "el"));
    if (fi.calculo === "conteo" || !fi.campo) return { n: fs.length, u: "", entero: true };
    if (fi.calculo === "distintos") return { n: new Set(fs.map((f) => valor(f, fi.campo)).filter((v) => v !== undefined && v !== null && v !== "")).size, u: "", entero: true };
    const c = campo(fi.campo, fi.fuente);
    return { n: medida(fs, fi.campo, fi.calculo), u: c.u || "", entero: false };
  }
  function editorFicha(fi) {
    const cu = fi.fuente === "cu";
    const cats = [...new Set(estado.filas.map((x) => x.cat))].sort((a, b) => a.localeCompare(b, "es"));
    const numerico = fi.calculo !== "conteo" && fi.calculo !== "distintos";
    return `<div class="tb-editor tb-editor-ficha">
      <label>Título</label><input type="text" data-fe="titulo" value="${esc(fi.titulo)}">
      ${estado.cuartos.length ? `<label>Datos</label><select data-fe="fuente"><option value="el"${!cu ? " selected" : ""}>Elementos</option><option value="cu"${cu ? " selected" : ""}>Cuartos</option></select>` : ""}
      <label>Cálculo</label><select data-fe="calculo">${CALCULOS.map(([k, n]) => `<option value="${k}"${k === fi.calculo ? " selected" : ""}>${n}</option>`).join("")}</select>
      ${fi.calculo !== "conteo" ? `<label>Campo</label><select data-fe="campo">${opcionesCampo(fi.campo, cu ? "cu" : "el", numerico, "(elige un campo)")}</select>` : ""}
      ${!cu ? `<label>Solo categoría</label><select data-fe="filtroCat"><option value="">(todas)</option>${cats.map((c) => `<option${c === fi.filtroCat ? " selected" : ""}>${esc(c)}</option>`).join("")}</select>` : ""}
      <label>Comportamiento</label><select data-fe="modo"><option value="dinamica"${fi.modo !== "fija" ? " selected" : ""}>Dinámica (cambia con filtros y selección)</option><option value="fija"${fi.modo === "fija" ? " selected" : ""}>Fija (siempre el total del modelo)</option></select>
      <div class="tb-acc"><button class="tb-btn" data-fc="quitar">Quitar</button><button class="tb-btn lleno" data-fc="listo">Listo</button></div></div>`;
  }
  function kpis() {
    const html = estado.fichas.map((fi) => {
      if (fi.editando && !soloLectura) return `<div class="tb-kpi editando" data-fid="${esc(fi.id)}">${editorFicha(fi)}</div>`;
      const r = valorFicha(fi);
      const n = r.entero ? fmt0.format(r.n) : fmt.format(r.n);
      const fija = fi.modo === "fija";
      return `<div class="tb-kpi${fija ? " fija" : ""}" data-fid="${esc(fi.id)}" title="${fija ? "Ficha fija: total del modelo" : "Ficha dinámica: cambia con los filtros y la selección"}">
        ${soloLectura ? "" : `<button class="tb-kpi-edit" data-fc="editar" aria-label="Editar ficha">✎</button>`}
        <b>${esc(n)}${r.u ? `<small>${esc(r.u)}</small>` : ""}</b><span>${fija ? "📌 " : ""}${esc(fi.titulo || "Ficha")}</span></div>`;
    }).join("") + (soloLectura ? "" : `<button class="tb-kpi tb-kpi-nueva" data-fc="nueva" title="Agregar una ficha">+ Ficha</button>`);
    $("tb-kpis").innerHTML = html;
  }

  // ------------------------------------------------------------------ Selección de elementos en el modelo 3D
  const PROPS_CLAVE = /^(Area|Área|Volume|Volumen|Length|Longitud|Width|Ancho|Height|Altura|Thickness|Espesor|Perimeter|Perímetro|Mark|Marca|Comments|Comentarios|Base Constraint|Top Constraint|Unconnected Height|Material|Phase Created|Fase de creación)$/i;
  function filaDe(obj) {
    for (let o = obj; o; o = o.parent) { const f = estado.porNodo.get(o); if (f) return f; }
    return null;
  }
  function seleccionar(f, sumar) {
    let s = estado.filtros.get("__id");
    if (!sumar) { estado.filtros.delete("__id"); s = null; }
    if (!f) return actualizar();
    if (!s) estado.filtros.set("__id", (s = new Set()));
    s.has(f.id) ? s.delete(f.id) : s.add(f.id);
    if (!s.size) estado.filtros.delete("__id");
    actualizar();
  }
  function fichaSeleccion() {
    const caja = $("tb-seleccion");
    const ids = estado.filtros.get("__id");
    if (!ids || !ids.size) { caja.hidden = true; return; }
    caja.hidden = false;
    const fs = estado.filas.filter((f) => ids.has(f.id));
    if (fs.length !== 1) {
      const cats = [...new Set(fs.map((f) => f.cat))];
      caja.innerHTML = `<h3><span>${fs.length} elementos seleccionados</span><button class="tb-btn" data-sel="limpiar">Quitar selección</button></h3>
        <dl><dt>Categorías</dt><dd>${esc(cats.join(", "))}</dd><dt>Tipos</dt><dd>${esc(corta([...new Set(fs.map((f) => f.tipo))].join(", "), 300))}</dd></dl>`;
      return;
    }
    const f = fs[0];
    const filasDl = [["Categoría", f.cat], ["Familia", f.familia], ["Tipo", f.tipo], ["Nivel", f.nivel], ["Modelo / vínculo", f.vinculo], ["ID de Revit", f.nodo && f.nodo.userData.ElementId]];
    const extra = Object.keys(f.P).filter((k) => PROPS_CLAVE.test(k) && f.P[k] !== "" && f.P[k] != null).map((k) => [k, f.P[k]]);
    const resto = Object.keys(f.P).filter((k) => !PROPS_CLAVE.test(k) && !IGNORAR.test(k) && f.P[k] !== "" && f.P[k] != null).sort((a, b) => a.localeCompare(b, "es")).map((k) => [k, f.P[k]]);
    const tipo = Object.keys(f.T).filter((k) => !IGNORAR.test(k) && f.T[k] !== "" && f.T[k] != null).sort((a, b) => a.localeCompare(b, "es")).map((k) => [k + " (tipo)", f.T[k]]);
    const dl = (lista) => lista.filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("");
    caja.innerHTML = `<h3><span>${esc(f.tipo || f.familia || "Elemento")}</span><button class="tb-btn" data-sel="encuadrar">Encuadrar</button><button class="tb-btn" data-sel="limpiar">Quitar selección</button></h3>
      <dl>${dl(filasDl)}${dl(extra)}</dl>
      <details><summary class="tb-sub" style="cursor:pointer;margin-top:6px">Todos los parámetros (${resto.length + tipo.length})</summary><dl>${dl(resto)}${dl(tipo)}</dl></details>`;
  }
  // Clic en el lienzo (sin arrastrar) mientras "Seleccionar en 3D" está activo.
  let inicioClic = null;
  document.addEventListener("pointerdown", (e) => { if (e.target.id === "lienzo") inicioClic = { x: e.clientX, y: e.clientY, t: Date.now() }; }, true);
  document.addEventListener("pointerup", (e) => {
    const v = window.__visor;
    if (!estado.seleccionando || !estado.abierto || e.target.id !== "lienzo" || !inicioClic || !v || !v.pick) return;
    const movio = Math.hypot(e.clientX - inicioClic.x, e.clientY - inicioClic.y) > 5 || Date.now() - inicioClic.t > 600;
    inicioClic = null;
    if (movio || e.button !== 0) return;
    // Con "Atenuar" activo, la selección del visor ignora lo atenuado: se escoge sobre lo visible.
    const hit = v.pick(e.clientX, e.clientY);
    seleccionar(hit ? filaDe(hit.object) : null, e.ctrlKey || e.metaKey || e.shiftKey);
  }, true);


  function opcionesCampo(sel, fuente, soloNum, vacioTxt) {
    const lista = [...(fuente === "cu" ? estado.camposCu : estado.campos).values()].filter((c) => (soloNum ? c.num || c.fecha : true));
    const grupos = fuente === "cu" ? [["Cuartos", lista]] : [["Generales", lista.filter((c) => c.base)], ["Parámetros de ejemplar", lista.filter((c) => c.k.startsWith("I:"))], ["Parámetros de tipo", lista.filter((c) => c.k.startsWith("T:"))]];
    let h = vacioTxt !== undefined ? `<option value="">${esc(vacioTxt)}</option>` : "";
    for (const [n, cs] of grupos) {
      if (!cs.length) continue;
      h += `<optgroup label="${esc(n)}">` + cs.sort((a, b) => a.n.localeCompare(b.n, "es")).map((c) => `<option value="${esc(c.k)}"${c.k === sel ? " selected" : ""}>${esc(c.n)}${c.num ? " #" : ""}</option>`).join("") + `</optgroup>`;
    }
    return h;
  }

  function editor(card) {
    const f = card.fuente || "el";
    const cats = [...new Set(estado.filas.map((x) => x.cat))].sort((a, b) => a.localeCompare(b, "es"));
    return `<div class="tb-editor">
      <label>Título</label><input type="text" data-e="titulo" value="${esc(card.titulo)}">
      <label>Gráfica</label><select data-e="tipo">${TIPOS.map(([k, n]) => `<option value="${k}"${k === card.tipo ? " selected" : ""}>${n}</option>`).join("")}</select>
      ${estado.cuartos.length ? `<label>Datos</label><select data-e="fuente"><option value="el"${f === "el" ? " selected" : ""}>Elementos del modelo</option><option value="cu"${f === "cu" ? " selected" : ""}>Cuartos</option></select>` : ""}
      <label>Agrupar por</label><select data-e="x">${opcionesCampo(card.x, f, false, "(ninguno)")}</select>
      <label>Agrupar 2</label><select data-e="x2">${opcionesCampo(card.x2, f, false, "(solo mapa de calor y flujo)")}</select>
      <label>Medida</label><select data-e="y">${opcionesCampo(card.y, f, true, "Conteo de elementos")}</select>
      <label>Cálculo</label><select data-e="agg">${[["suma", "Suma"], ["prom", "Promedio"], ["min", "Mínimo"], ["max", "Máximo"]].map(([k, n]) => `<option value="${k}"${k === card.agg ? " selected" : ""}>${n}</option>`).join("")}</select>
      <label>Medida 2</label><select data-e="y2">${opcionesCampo(card.y2, f, true, "(dispersión, burbujas y Gantt)")}</select>
      ${f === "el" ? `<label>Solo categoría</label><select data-e="filtroCat"><option value="">(todas)</option>${cats.map((c) => `<option${c === card.filtroCat ? " selected" : ""}>${esc(c)}</option>`).join("")}</select>` : ""}
      <label>Mostrar</label><select data-e="top">${[[0, "Todos"], [5, "Top 5"], [8, "Top 8"], [10, "Top 10"], [12, "Top 12"], [15, "Top 15"], [20, "Top 20"], [30, "Top 30"]].map(([k, n]) => `<option value="${k}"${Number(card.top) === k ? " selected" : ""}>${n}</option>`).join("")}</select>
      <label>Orden</label><select data-e="orden"><option value="valor"${card.orden !== "nombre" ? " selected" : ""}>Por valor</option><option value="nombre"${card.orden === "nombre" ? " selected" : ""}>Por nombre</option></select>
      <label>Tamaño</label><select data-e="ancha"><option value="">Normal</option><option value="1"${card.ancha ? " selected" : ""}>Ancho completo</option></select>
      <div class="tb-acc"><button class="tb-btn lleno" data-c="listo">Listo</button></div></div>`;
  }

  function tarjetas() {
    const cont = $("tb-tarjetas");
    cont.innerHTML = "";
    for (const card of estado.tarjetas) {
      const el = document.createElement("section");
      el.className = "tb-card" + (card.ancha ? " ancha" : "");
      el.dataset.id = card.id;
      let cuerpo;
      cont.append(el);
      W = Math.max(280, Math.round(el.clientWidth - 26)); // la gráfica se dibuja al ancho real de la tarjeta (texto a tamaño real)
      try {
        const fs = filasDe(card, card.x);
        cuerpo = (DIBUJO[card.tipo] || DIBUJO.barras)(card, fs);
      } catch (e) { console.error(e); cuerpo = vacio("No se pudo dibujar esta gráfica: " + e.message); }
      const sub = [card.x ? campo(card.x, card.fuente).n : "", card.tipo === "histograma" ? "" : nombreMedida(card), card.filtroCat ? "solo " + card.filtroCat : ""].filter(Boolean).join(" · ");
      el.innerHTML = `<header><h3 title="${esc(card.titulo)}">${esc(card.titulo || "Gráfica")}</h3>${soloLectura ? "" : `
        <button data-c="editar" title="Editar gráfica" aria-label="Editar">✎</button><button data-c="ancha" title="Ancho normal / completo" aria-label="Cambiar tamaño">⤢</button>
        <button data-c="subir" title="Mover antes" aria-label="Mover antes">↑</button><button data-c="quitar" title="Quitar gráfica" aria-label="Quitar">✕</button>`}</header>
        ${card.editando && !soloLectura ? editor(card) : ""}<div class="tb-sub">${esc(sub)}</div><div class="${card.tipo === "tabla" ? "tb-scroll" : ""}">${cuerpo}</div>`;
    }
  }

  function filtrosChips() {
    const nombres = (k) => (k === "__id" ? "Elemento" : (k.startsWith("cu:") ? campo(k, "cu") : campo(k)).n);
    const textoChip = (k, vals) => (k === "__id" ? vals.size + (vals.size === 1 ? " elemento seleccionado" : " elementos seleccionados") : nombres(k) + ": " + corta([...vals].join(", "), 60));
    $("tb-filtros").innerHTML = [...estado.filtros].map(([k, vals]) => `<span class="tb-chip">${esc(textoChip(k, vals))}<button data-quitar="${esc(k)}" aria-label="Quitar filtro">✕</button></span>`).join("");
    $("tb-limpiar").disabled = !estado.filtros.size;
  }

  function pintarLeyenda() {
    if (!estado.leyenda || !estado.abierto) { leyenda.hidden = true; return; }
    leyenda.hidden = false;
    leyenda.innerHTML = `<b>${esc(campo(estado.colorear).n)}</b>` + estado.leyenda.map(([k, c]) => `<div><i style="background:${c}"></i>${esc(corta(k, 30))}</div>`).join("");
  }

  function actualizar() {
    if (!estado.listo) return;
    kpis();
    fichaSeleccion();
    filtrosChips();
    tarjetas();
    if (estado.efecto !== "nada" || estado.colorear) aplicarModelo(); else restaurarModelo();
    pintarLeyenda();
    const tot = estado.modoDatos === "elementos" ? fmt0.format(estado.filas.length) + " elementos con datos BIM" : fmt0.format(estado.filas.length) + " tipos (modelo sin datos por elemento)";
    $("tb-resumen").textContent = (estado.proyecto ? estado.proyecto + " · " : "") + tot;
  }
  function restaurarModelo() {
    for (const f of estado.filas) { if (f.nodo) f.nodo.visible = true; for (const m of f.mallas) if ("__tbOriginal" in m.userData) { m.material = m.userData.__tbOriginal; m.castShadow = true; } }
    const v = window.__visor; if (v && v.listo) { v.actualizarSombras(); v.render(); }
  }

  function preparar() {
    const v = window.__visor;
    if (estado.listo || !v || !v.listo) return;
    leerModelo();
    estado.listo = true;
    let t = null;
    const enlace = new URLSearchParams(location.search).get("tb");
    if (enlace) { try { t = JSON.parse(decodeURIComponent(escape(atob(enlace.replace(/-/g, "+").replace(/_/g, "/"))))); } catch (e) { t = null; } }
    // En la versión pública no se usa un tablero guardado en el navegador: se ve el del enlace o el de BIM Loading.
    if (!t && !soloLectura) { try { t = JSON.parse(localStorage.getItem(claveLocal()) || "null"); } catch (e) { t = null; } }
    const tt = Array.isArray(t) ? t : t && t.t, ff = t && !Array.isArray(t) ? t.f : null;
    estado.tarjetas = Array.isArray(tt) && tt.length ? tt.map((c) => ({ ...c, editando: false })) : tableroInicial();
    estado.fichas = Array.isArray(ff) && ff.length ? ff.map((c) => ({ ...c, editando: false })) : fichasIniciales();
    $("tb-colorear").innerHTML = '<option value="">(colores originales)</option>' + opcionesCampo("", "el", false);
    $("tb-colorear").disabled = estado.modoDatos !== "elementos";
    $("tb-efecto").disabled = estado.modoDatos !== "elementos";
    $("tb-encuadrar").disabled = estado.modoDatos !== "elementos";
    $("tb-seleccionar").disabled = estado.modoDatos !== "elementos";
    const aviso = $("tb-aviso");
    if (estado.modoDatos !== "elementos") {
      aviso.hidden = false;
      aviso.textContent = "Este modelo se exportó en la versión web unida por categorías, que no conserva los datos de cada elemento. Las gráficas usan el catálogo de tipos. Para tableros completos (áreas, volúmenes, filtros en 3D), exporta el modelo como “Completo” o “Web” con datos BIM.";
    } else if (!estado.filas.some((f) => f.mallas.length)) {
      aviso.hidden = false;
      aviso.textContent = "Los elementos no tienen geometría asociada: el filtrado en 3D no está disponible.";
    }
  }

  function abrir(si) {
    const v = window.__visor;
    if (!v || !v.listo) return;
    preparar();
    estado.abierto = si;
    panel.hidden = !si;
    menu.hidden = true;
    boton.classList.toggle("activo", si);
    document.body.classList.toggle("tb-abierto", si && estado.ancho < 100);
    document.body.classList.toggle("tb-completo", si && estado.ancho >= 100);
    document.documentElement.style.setProperty("--tb-ancho", estado.ancho + "vw");
    if (si) actualizar(); else { restaurarModelo(); leyenda.hidden = true; estado.seleccionando = false; document.body.classList.remove("tb-seleccionando"); $("tb-seleccionar").classList.remove("activo"); $("tb-seleccionar").textContent = "Seleccionar en 3D"; }
    // El lienzo 3D cambia de tamaño: se vuelve a encuadrar el modelo cuando termina el cambio.
    setTimeout(encuadrar, 250);
    const p = new URLSearchParams(location.search);
    if (si) p.set("tablero", "1"); else p.delete("tablero");
    history.replaceState(null, "", location.pathname + "?" + p.toString() + location.hash);
  }

  // ------------------------------------------------------------------ Eventos
  boton.addEventListener("click", () => abrir(!estado.abierto));
  $("tb-cerrar").addEventListener("click", () => abrir(false));
  $("tb-expandir").addEventListener("click", () => {
    const si = !document.body.classList.contains("tb-expandido");
    document.body.classList.toggle("tb-expandido", si);
    $("tb-expandir").textContent = si ? "▼" : "▲";
    setTimeout(() => { tarjetas(); encuadrar(); }, 250);
  });
  $("tb-ancho-sel").addEventListener("change", (e) => { estado.ancho = Number(e.target.value); abrir(true); });
  $("tb-efecto").addEventListener("change", (e) => { estado.efecto = e.target.value; restaurarModelo(); actualizar(); });
  $("tb-colorear").addEventListener("change", (e) => { estado.colorear = e.target.value; restaurarModelo(); actualizar(); });
  $("tb-encuadrar").addEventListener("click", encuadrar);
  $("tb-limpiar").addEventListener("click", () => { estado.filtros.clear(); actualizar(); });
  $("tb-filtros").addEventListener("click", (e) => { const b = e.target.closest("[data-quitar]"); if (b) { estado.filtros.delete(b.dataset.quitar); actualizar(); } });
  $("tb-agregar").addEventListener("click", () => {
    estado.tarjetas.unshift({ id: "t" + Date.now().toString(36), titulo: "Nueva gráfica", tipo: "barras", x: "cat", agg: "suma", top: 10, editando: true });
    guardar(); actualizar(); $("tb-cuerpo").scrollTop = 0;
  });
  $("tb-mas").addEventListener("click", () => { menu.hidden = !menu.hidden; });
  document.addEventListener("click", (e) => { if (!menu.hidden && !e.target.closest("#tb-menu") && e.target.id !== "tb-mas") menu.hidden = true; });
  $("tb-restablecer").addEventListener("click", () => { estado.tarjetas = tableroInicial(); estado.fichas = fichasIniciales(); estado.filtros.clear(); guardar(); menu.hidden = true; actualizar(); });
  $("tb-imprimir").addEventListener("click", () => { menu.hidden = true; window.print(); });
  $("tb-compartir").addEventListener("click", async () => {
    const datos = paquete();
    const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(datos)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const p = new URLSearchParams(location.search); p.set("tb", b64); p.set("tablero", "1"); p.delete("vinc");
    const url = location.origin + location.pathname + "?" + p.toString();
    try { await navigator.clipboard.writeText(url); $("tb-compartir").textContent = "¡Enlace copiado!"; } catch (e) { prompt("Copia este enlace:", url); }
    setTimeout(() => { $("tb-compartir").textContent = "Copiar enlace con este tablero"; }, 2200);
  });
  $("tb-csv").addEventListener("click", () => {
    menu.hidden = true;
    const fs = estado.filas.filter((f) => pasa(f, null, "el"));
    const extra = [...estado.campos.values()].filter((c) => !c.base).slice(0, 120);
    const cab = ["Categoría", "Nivel", "Familia", "Tipo", "Modelo / vínculo", "Clase", ...extra.map((c) => c.n)];
    const q = (s) => '"' + String(s == null ? "" : s).replace(/"/g, '""') + '"';
    const lineas = [cab.map(q).join(",")].concat(fs.map((f) => [f.cat, f.nivel, f.familia, f.tipo, f.vinculo, f.clase, ...extra.map((c) => valor(f, c.k))].map(q).join(",")));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + lineas.join("\r\n")], { type: "text/csv;charset=utf-8" }));
    a.download = (estado.proyecto || "modelo") + " - datos BIM.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  });

  $("tb-seleccionar").addEventListener("click", () => {
    estado.seleccionando = !estado.seleccionando;
    $("tb-seleccionar").classList.toggle("activo", estado.seleccionando);
    document.body.classList.toggle("tb-seleccionando", estado.seleccionando);
    $("tb-seleccionar").textContent = estado.seleccionando ? "Seleccionando… (clic en el modelo)" : "Seleccionar en 3D";
  });
  $("tb-seleccion").addEventListener("click", (e) => {
    const b = e.target.closest("[data-sel]");
    if (!b) return;
    if (b.dataset.sel === "limpiar") { estado.filtros.delete("__id"); actualizar(); }
    if (b.dataset.sel === "encuadrar") encuadrar();
  });
  $("tb-kpis").addEventListener("click", (e) => {
    const b = e.target.closest("[data-fc]");
    if (!b || soloLectura) return;
    const caja = e.target.closest("[data-fid]");
    const fi = caja && estado.fichas.find((x) => x.id === caja.dataset.fid);
    const c = b.dataset.fc;
    if (c === "nueva") estado.fichas.push({ id: "f" + Date.now().toString(36), titulo: "Nueva ficha", calculo: "conteo", fuente: "el", modo: "dinamica", editando: true });
    if (c === "editar" && fi) fi.editando = true;
    if (c === "listo" && fi) fi.editando = false;
    if (c === "quitar" && fi) estado.fichas.splice(estado.fichas.indexOf(fi), 1);
    guardar(); kpis();
  });
  $("tb-kpis").addEventListener("change", (e) => {
    const k = e.target.dataset.fe;
    if (!k) return;
    const fi = estado.fichas.find((x) => x.id === e.target.closest("[data-fid]").dataset.fid);
    fi[k] = e.target.value;
    if (k === "fuente") { fi.campo = ""; fi.filtroCat = ""; fi.calculo = "conteo"; }
    if (k === "calculo" && (fi.calculo === "conteo")) fi.campo = "";
    if (k === "campo" && (!fi.titulo || fi.titulo === "Nueva ficha")) fi.titulo = (CALCULOS.find(([c]) => c === fi.calculo) || ["", ""])[1].replace("…", "") + " " + campo(fi.campo, fi.fuente).n;
    guardar();
    if (k !== "titulo") kpis();
  });
  $("tb-tarjetas").addEventListener("click", (e) => {
    const sec = e.target.closest(".tb-card");
    if (!sec) return;
    const card = estado.tarjetas.find((c) => c.id === sec.dataset.id);
    const accion = e.target.closest("[data-c]");
    if (accion && soloLectura) return;
    if (accion) {
      const c = accion.dataset.c, i = estado.tarjetas.indexOf(card);
      if (c === "editar") card.editando = !card.editando;
      if (c === "listo") card.editando = false;
      if (c === "ancha") card.ancha = !card.ancha;
      if (c === "quitar") estado.tarjetas.splice(i, 1);
      if (c === "subir" && i > 0) estado.tarjetas.splice(i - 1, 0, estado.tarjetas.splice(i, 1)[0]);
      guardar(); tarjetas(); return;
    }
    const m = e.target.closest(".tb-marca");
    if (!m || !m.dataset.k) return;
    const sumar = e.ctrlKey || e.metaKey || e.shiftKey;
    if (m.dataset.k2) {
      // Celda (mapa de calor / flujo): filtra los dos campos a la vez.
      if (!sumar) estado.filtros.clear();
      estado.filtros.set(m.dataset.k, new Set([m.dataset.v]));
      estado.filtros.set(m.dataset.k2, new Set([m.dataset.v2]));
      return actualizar();
    }
    alternarFiltro(m.dataset.k, m.dataset.v.split("\u0001"), sumar);
  });
  $("tb-tarjetas").addEventListener("change", (e) => {
    const campoE = e.target.dataset.e;
    if (!campoE) return;
    const card = estado.tarjetas.find((c) => c.id === e.target.closest(".tb-card").dataset.id);
    let val = e.target.value;
    if (campoE === "top") val = Number(val);
    if (campoE === "ancha") val = !!val;
    if (campoE === "fuente") { card.x = val === "cu" ? "cu:nombre" : "cat"; card.y = val === "cu" ? "cu:area" : ""; card.x2 = card.y2 = ""; card.filtroCat = ""; }
    card[campoE] = val;
    guardar();
    if (campoE !== "titulo") tarjetas(); else e.target.closest(".tb-card").querySelector("h3").textContent = val;
  });

  let espera = 0;
  window.addEventListener("resize", () => { clearTimeout(espera); espera = setTimeout(() => { if (estado.abierto) tarjetas(); }, 200); });

  // En la PC (Hub local), el visor también mantiene vivo el servidor mientras está abierto.
  if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) setInterval(() => { fetch("api/progreso", { cache: "no-store" }).catch(() => {}); }, 60000);

  // Abrir solo si la dirección lo pide (?tablero=1), cuando el modelo termine de cargar.
  const esperar = setInterval(() => {
    const v = window.__visor;
    if (!v || !v.listo) return;
    clearInterval(esperar);
    if (new URLSearchParams(location.search).get("tablero") === "1") abrir(true);
  }, 300);
})();
