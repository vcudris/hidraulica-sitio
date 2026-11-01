// Utilidades compartidas por los simuladores y los ejercicios de autoverificación.
// Se importan desde las celdas OJS:  import {practica, azar, cs, geometria} from "../recursos/hc.js"
//
// Unidades SI en todo el archivo: m, s, m³/s, N. Una sección se describe con
//   {forma: "rectangular" | "trapecial" | "triangular" | "circular", b, z, D}
// donde b es el ancho de fondo, z el talud (z horizontal por 1 vertical) y D el diámetro.

export const g = 9.81; // m/s²
export const RHO = 1000; // kg/m³
export const GAMMA = RHO * g; // N/m³
export const NU = 1.0e-6; // m²/s, agua a unos 20 °C

// ---------- Formato y entrada de números ----------

// Número con n cifras significativas y coma decimal.
export function cs(x, n = 3) {
  if (!Number.isFinite(x)) return "—";
  if (x === 0) return "0";
  return Number(x.toPrecision(n)).toLocaleString("es-CO", {
    maximumSignificantDigits: n,
    useGrouping: false,
  });
}

// Valor aleatorio entre min y max, en múltiplos de paso.
export function azar(min, max, paso = 1) {
  const n = Math.floor((max - min) / paso);
  const v = min + paso * Math.floor(Math.random() * (n + 1));
  return Number(v.toFixed(10));
}

// Elemento al azar de una lista.
export function elegir(lista) {
  return lista[Math.floor(Math.random() * lista.length)];
}

// Acepta "12,5", "12.5", "-3e2" y "1.250,5" (punto de miles y coma decimal).
export function leerNumero(texto) {
  let t = String(texto).trim().replace(/\s/g, "");
  if (t.includes(",") && t.includes(".")) t = t.replace(/\./g, "");
  t = t.replace(",", ".");
  return t === "" ? NaN : Number(t);
}

// Tolerancia relativa del 1 %: cubre el redondeo a 3 cifras significativas.
export function coincide(valor, correcto, tolerancia = 0.01) {
  return Math.abs(valor - correcto) <= tolerancia * Math.abs(correcto) + 1e-12;
}

// ---------- Geometría de la sección ----------

// Elementos geométricos para un tirante y.
//   A área mojada, P perímetro mojado, T ancho superficial, R = A/P radio hidráulico,
//   Dh = A/T profundidad hidráulica, yg profundidad del centroide bajo la superficie.
export function geometria(s, y) {
  if (s.forma === "circular") {
    const D = s.D, r = D / 2;
    const yy = Math.min(Math.max(y, 0), D * 0.99999);
    const th = 2 * Math.acos(1 - 2 * yy / D); // ángulo central del segmento mojado
    const A = (D * D / 8) * (th - Math.sin(th));
    const P = D * th / 2;
    const T = D * Math.sin(th / 2);
    const dc = (4 * r * Math.sin(th / 2) ** 3) / (3 * (th - Math.sin(th))); // centroide bajo el centro
    return { A, P, T, R: A / P, Dh: A / T, yg: yy - r + dc, theta: th };
  }
  const b = s.forma === "triangular" ? 0 : s.b;
  const z = s.forma === "rectangular" ? 0 : s.z;
  const A = (b + z * y) * y;
  const P = b + 2 * y * Math.sqrt(1 + z * z);
  const T = b + 2 * z * y;
  const yg = (y * (3 * b + 2 * z * y)) / (6 * (b + z * y));
  return { A, P, T, R: A / P, Dh: A / T, yg };
}

// Tirante máximo que tiene sentido buscar (a tubo casi lleno en la circular).
function techo(s) {
  return s.forma === "circular" ? s.D * 0.999 : 1e3;
}

// Raíz de f en [lo, hi] por bisección (f debe cambiar de signo).
export function biseccion(f, lo, hi, iter = 100) {
  let flo = f(lo);
  for (let i = 0; i < iter; i++) {
    const m = (lo + hi) / 2, fm = f(m);
    if ((fm > 0) === (flo > 0)) { lo = m; flo = fm; } else hi = m;
  }
  return (lo + hi) / 2;
}

// ---------- Energía, Froude y momentum ----------

export function velocidad(s, Q, y) {
  return Q / geometria(s, y).A;
}

export function froude(s, Q, y) {
  const G = geometria(s, y);
  return Q / G.A / Math.sqrt(g * G.Dh);
}

export function regimen(Fr, tol = 0.02) {
  if (Math.abs(Fr - 1) <= tol) return "crítico";
  return Fr < 1 ? "subcrítico" : "supercrítico";
}

export function reynolds(s, Q, y) {
  const G = geometria(s, y);
  return (Q / G.A) * G.R / NU;
}

// Clasificación de Chow con Re = V R / ν.
export function regimenViscoso(Re) {
  if (Re < 500) return "laminar";
  return Re > 2000 ? "turbulento" : "transición";
}

// E = y + V²/2g (energía específica medida desde el fondo).
export function energia(s, Q, y) {
  const A = geometria(s, y).A;
  return y + (Q * Q) / (2 * g * A * A);
}

// Fuerza específica M = Q²/(gA) + yg·A  [m³].
export function momentum(s, Q, y) {
  const G = geometria(s, y);
  return (Q * Q) / (g * G.A) + G.yg * G.A;
}

// Tirante crítico: Q²T/(gA³) = 1. NaN si no existe (circular a sección llena).
export function tiranteCritico(s, Q) {
  const f = (y) => {
    const G = geometria(s, y);
    return (Q * Q * G.T) / (g * G.A ** 3) - 1;
  };
  let hi = s.forma === "circular" ? s.D * 0.98 : 1;
  if (s.forma === "circular") {
    if (f(hi) > 0) return NaN;
  } else {
    while (f(hi) > 0 && hi < techo(s)) hi *= 2;
  }
  return biseccion(f, 1e-6, hi);
}

// Profundidades alternas para una energía E: {sup: supercrítica, sub: subcrítica}.
export function alternos(s, Q, E) {
  const yc = tiranteCritico(s, Q);
  const Emin = energia(s, Q, yc);
  if (!(E > Emin)) return { sup: NaN, sub: NaN, yc, Emin };
  const f = (y) => energia(s, Q, y) - E;
  let lo = yc * 1e-3;
  while (f(lo) < 0) lo /= 2;
  const sup = biseccion(f, lo, yc);
  const hi = Math.min(E, techo(s));
  const sub = f(hi) > 0 ? biseccion(f, yc, hi) : NaN;
  return { sup, sub, yc, Emin };
}

// Tirante conjugado de y (misma fuerza específica, al otro lado del crítico).
export function conjugado(s, Q, y) {
  const yc = tiranteCritico(s, Q);
  const M = momentum(s, Q, y);
  const f = (t) => momentum(s, Q, t) - M;
  if (y < yc) {
    let hi = yc * 2;
    while (f(hi) < 0 && hi < techo(s)) hi = Math.min(hi * 2, techo(s));
    return f(hi) < 0 ? NaN : biseccion(f, yc, hi);
  }
  let lo = yc / 2;
  while (f(lo) < 0) lo /= 2;
  return biseccion(f, lo, yc);
}

// Ecuación de Bélanger (canal rectangular, fondo horizontal).
export function belanger(y1, Fr1) {
  return (y1 / 2) * (Math.sqrt(1 + 8 * Fr1 * Fr1) - 1);
}

// Clasificación del resalto del USBR según Fr1.
export function tipoResalto(Fr1) {
  if (Fr1 <= 1) return "no hay resalto";
  if (Fr1 < 1.7) return "ondular";
  if (Fr1 < 2.5) return "débil";
  if (Fr1 < 4.5) return "oscilante";
  if (Fr1 < 9) return "estable";
  return "fuerte";
}

// ---------- Flujo uniforme ----------

export function caudalManning(s, n, S, y) {
  const G = geometria(s, y);
  return (G.A * Math.pow(G.R, 2 / 3) * Math.sqrt(S)) / n;
}

export function chezy(R, n) {
  return Math.pow(R, 1 / 6) / n;
}

// Tirante normal. NaN si el caudal no cabe (circular) o la pendiente no es positiva.
export function tiranteNormal(s, Q, n, S) {
  if (!(S > 0)) return NaN;
  let hi = s.forma === "circular" ? 0.938 * s.D : 1; // la circular conduce su máximo a 0,938 D
  if (s.forma === "circular") {
    if (caudalManning(s, n, S, hi) < Q) return NaN;
  } else {
    while (caudalManning(s, n, S, hi) < Q && hi < techo(s)) hi *= 2;
  }
  return biseccion((y) => caudalManning(s, n, S, y) - Q, 1e-6, hi);
}

// Pendiente de fricción con Manning: Sf = (nQ)² / (A² R^(4/3)).
export function pendienteFriccion(s, Q, n, y) {
  const G = geometria(s, y);
  return (n * Q) ** 2 / (G.A ** 2 * Math.pow(G.R, 4 / 3));
}

// Borde libre del USBR, F = √(C y), con C de 0,46 (Q ≤ 0,57 m³/s) a 0,76 (Q ≥ 85 m³/s).
export function bordeLibre(Q, y) {
  const t = Math.min(Math.max((Math.log(Q) - Math.log(0.57)) / (Math.log(85) - Math.log(0.57)), 0), 1);
  const C = 0.46 + t * 0.3;
  return { C, F: Math.sqrt(C * y) };
}

// ---------- Flujo gradualmente variado ----------

// Tipo de perfil (M1, S2, C3, H2, A3…) según yn, yc, y y la pendiente.
export function clasificarPerfil(yn, yc, y, S0) {
  if (S0 <= 0) {
    const letra = S0 === 0 ? "H" : "A";
    return y > yc ? letra + "2" : letra + "3";
  }
  const letra = Math.abs(yn - yc) / yc < 0.02 ? "C" : yn > yc ? "M" : "S";
  const alto = Math.max(yn, yc), bajo = Math.min(yn, yc);
  if (letra === "C") return y > yc ? "C1" : "C3";
  if (y > alto) return letra + "1";
  if (y > bajo) return letra + "2";
  return letra + "3";
}

// dy/dx = (S0 − Sf)/(1 − Fr²), con x positivo aguas abajo.
export function pendientePerfil(s, Q, n, S0, y) {
  const Fr = froude(s, Q, y);
  return (S0 - pendienteFriccion(s, Q, n, y)) / (1 - Fr * Fr);
}

// Método del paso directo entre y0 y yf (N tramos de igual Δy).
// Devuelve puntos {x, y, V, Fr, E, Sf}; x se mide desde y0 y es positivo aguas abajo.
export function pasoDirecto(s, Q, n, S0, y0, yf, N = 60) {
  const puntos = [];
  let x = 0;
  for (let i = 0; i <= N; i++) {
    const y = y0 + ((yf - y0) * i) / N;
    const E = energia(s, Q, y);
    const Sf = pendienteFriccion(s, Q, n, y);
    if (i > 0) {
      const ant = puntos[i - 1];
      x += (E - ant.E) / (S0 - (Sf + ant.Sf) / 2);
    }
    puntos.push({ x, y, V: velocidad(s, Q, y), Fr: froude(s, Q, y), E, Sf });
  }
  return puntos;
}

// Perfil completo desde un control y0 hasta casi alcanzar yn o yc.
// En flujo subcrítico el cálculo avanza aguas arriba; en supercrítico, aguas abajo.
export function perfilFGV(s, Q, n, S0, y0, N = 60) {
  const yn = tiranteNormal(s, Q, n, S0);
  const yc = tiranteCritico(s, Q);
  if (!Number.isFinite(yn) || !Number.isFinite(yc)) return null;
  const tipo = clasificarPerfil(yn, yc, y0, S0);
  if (Math.abs(y0 - yn) / yn < 0.005) return { tipo: "uniforme", yn, yc, puntos: [], sentido: "" };
  const sub = y0 > yc;
  let objetivo;
  if (sub) objetivo = tipo === "S1" ? yc : yn;
  else objetivo = tipo === "M3" ? yc : yn;
  const yf = objetivo + (y0 - objetivo) * 0.01;
  return {
    tipo, yn, yc,
    sentido: sub ? "aguas arriba" : "aguas abajo",
    puntos: pasoDirecto(s, Q, n, S0, y0, yf, N),
  };
}

// ---------- Estructuras de aforo y control ----------

// Vertedero triangular de pared delgada: Q = (8/15) Cd √(2g) tan(θ/2) H^(5/2).
export function vertederoTriangular(H, anguloGrados = 90, Cd = 0.585) {
  return (8 / 15) * Cd * Math.sqrt(2 * g) * Math.tan((anguloGrados * Math.PI) / 360) * H ** 2.5;
}

// Vertedero rectangular de Francis (SI): Q = 1,84 (L − 0,1 n H) H^(3/2), n = contracciones laterales.
export function vertederoRectangular(H, L, contracciones = 0) {
  return 1.84 * (L - 0.1 * contracciones * H) * H ** 1.5;
}

// Compuerta deslizante con descarga libre: Q = Cd b a √(2g y1).
export function caudalCompuerta(Cd, b, a, y1) {
  return Cd * b * a * Math.sqrt(2 * g * y1);
}

// Fuerza horizontal del agua sobre una compuerta en canal rectangular (momentum entre 1 y 2), en N.
export function fuerzaCompuerta(Q, b, y1, y2) {
  return (GAMMA * b * (y1 * y1 - y2 * y2)) / 2 - RHO * Q * (Q / (b * y2) - Q / (b * y1));
}

// ---------- Tablas de referencia ----------

// Coeficiente n de Manning, valores de diseño usuales (Chow, tabla 5-6).
export const RUGOSIDAD = {
  "PVC o plástico": 0.010,
  "Concreto con llana": 0.013,
  "Concreto sin pulir": 0.015,
  "Asfalto liso": 0.013,
  "Mampostería de piedra con mortero": 0.025,
  "Tierra recta y uniforme, limpia": 0.022,
  "Tierra con pasto corto": 0.027,
  "Tierra con vegetación densa": 0.040,
  "Cauce natural limpio": 0.030,
  "Cauce natural con piedras y maleza": 0.040,
};

// Velocidades máximas permisibles para agua limpia y n de cada material
// (Fortier y Scobey, en Chow, tabla 7-3). V en m/s.
export const SUELOS = {
  "Arena fina coloidal": { V: 0.46, n: 0.020 },
  "Franco arenoso no coloidal": { V: 0.53, n: 0.020 },
  "Franco limoso no coloidal": { V: 0.61, n: 0.020 },
  "Limos aluviales no coloidales": { V: 0.61, n: 0.020 },
  "Franco firme ordinario": { V: 0.76, n: 0.020 },
  "Grava fina": { V: 0.76, n: 0.020 },
  "Arcilla rígida muy coloidal": { V: 1.14, n: 0.025 },
  "Limos aluviales coloidales": { V: 1.14, n: 0.025 },
  "Grava gruesa no coloidal": { V: 1.22, n: 0.025 },
  "Cantos rodados y guijarros": { V: 1.52, n: 0.035 },
  "Esquistos y arcillas duras": { V: 1.83, n: 0.025 },
};

// ---------- Dibujo de la sección transversal ----------

const SVGNS = "http://www.w3.org/2000/svg";

// Corte transversal a escala con el agua hasta el tirante y.
// marcas: [{y, clase, texto}] dibuja líneas horizontales (p. ej. yc o yn).
export function dibujarSeccion(s, y, { marcas = [], ancho = 420, alto = 260 } = {}) {
  const svg = document.createElementNS(SVGNS, "svg");
  svg.setAttribute("viewBox", `0 0 ${ancho} ${alto}`);
  svg.setAttribute("class", "esquema seccion");
  svg.setAttribute("role", "img");
  const izq = 40, der = 70, arriba = 30, abajo = 44;
  const W = ancho - izq - der, H = alto - arriba - abajo;
  const cx = izq + W / 2, fondo = arriba + H;
  let partes = "";
  const yMax = Math.max(y, ...marcas.map((m) => m.y).filter(Number.isFinite));

  if (s.forma === "circular") {
    const D = s.D, k = Math.min(W / D, H / D), r = (D / 2) * k, cy = fondo - r;
    const yy = Math.min(y, D * 0.999);
    const nivel = fondo - yy * k;
    const w = Math.sqrt(Math.max(r * r - (cy - nivel) ** 2, 0));
    const grande = yy > D / 2 ? 1 : 0;
    partes += `<circle cx="${cx}" cy="${cy}" r="${r}" class="contorno" fill="none"/>`;
    partes += `<path d="M${cx - w},${nivel} A${r},${r} 0 ${grande} 0 ${cx + w},${nivel} Z" class="agua"/>`;
    partes += `<line x1="${cx - w}" y1="${nivel}" x2="${cx + w}" y2="${nivel}" class="superficie"/>`;
    partes += cota(cx + r + 14, fondo, nivel, `y = ${cs(y)} m`);
    partes += `<text x="${cx}" y="${fondo + 28}" text-anchor="middle">D = ${cs(D)} m</text>`;
    for (const m of marcas) {
      if (!Number.isFinite(m.y) || m.y >= D) continue;
      const ny = fondo - m.y * k, wm = Math.sqrt(Math.max(r * r - (cy - ny) ** 2, 0));
      partes += `<line x1="${cx - wm}" y1="${ny}" x2="${cx + wm}" y2="${ny}" class="marca ${m.clase || ""}"/>`;
      partes += `<text x="${cx - wm - 4}" y="${ny + 4}" text-anchor="end" class="marca-texto ${m.clase || ""}">${m.texto}</text>`;
    }
  } else {
    const b = s.forma === "triangular" ? 0 : s.b;
    const z = s.forma === "rectangular" ? 0 : s.z;
    const Hd = Math.max(yMax * 1.3, yMax + 0.15);
    const Ttop = b + 2 * z * Hd;
    const k = Math.min(W / Math.max(Ttop, 1e-6), H / Hd);
    const X = (u) => cx + u * k, Y = (v) => fondo - v * k;
    const T = b + 2 * z * y;
    partes += `<path d="M${X(-Ttop / 2)},${Y(Hd)} L${X(-b / 2)},${Y(0)} L${X(b / 2)},${Y(0)} L${X(Ttop / 2)},${Y(Hd)}" class="contorno" fill="none"/>`;
    partes += `<path d="M${X(-T / 2)},${Y(y)} L${X(-b / 2)},${Y(0)} L${X(b / 2)},${Y(0)} L${X(T / 2)},${Y(y)} Z" class="agua"/>`;
    partes += `<line x1="${X(-T / 2)}" y1="${Y(y)}" x2="${X(T / 2)}" y2="${Y(y)}" class="superficie"/>`;
    partes += cota(X(Ttop / 2) + 14, Y(0), Y(y), `y = ${cs(y)} m`);
    partes += `<text x="${cx}" y="${Y(y) - 8}" text-anchor="middle">T = ${cs(T)} m</text>`;
    if (b > 0) partes += `<text x="${cx}" y="${Y(0) + 18}" text-anchor="middle">b = ${cs(b)} m</text>`;
    if (z > 0) partes += `<text x="${X(Ttop / 2)}" y="${Y(Hd) - 8}" text-anchor="middle">${cs(z, 2)}:1</text>`;
    for (const m of marcas) {
      if (!Number.isFinite(m.y)) continue;
      const tm = b + 2 * z * m.y;
      partes += `<line x1="${X(-tm / 2)}" y1="${Y(m.y)}" x2="${X(tm / 2)}" y2="${Y(m.y)}" class="marca ${m.clase || ""}"/>`;
      partes += `<text x="${X(-tm / 2) - 4}" y="${Y(m.y) + 4}" text-anchor="end" class="marca-texto ${m.clase || ""}">${m.texto}</text>`;
    }
  }
  svg.innerHTML = partes;
  return svg;
}

// Cota vertical con topes entre y1 y y2 (coordenadas de pantalla).
function cota(x, y1, y2, texto) {
  return `<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" class="cota"/>
    <line x1="${x - 4}" y1="${y1}" x2="${x + 4}" y2="${y1}" class="cota"/>
    <line x1="${x - 4}" y1="${y2}" x2="${x + 4}" y2="${y2}" class="cota"/>
    <text x="${x + 6}" y="${(y1 + y2) / 2 + 4}">${texto}</text>`;
}

// Cota horizontal con topes entre x1 y x2, con el texto encima (dy < 0) o debajo (dy > 0).
function cotaH(x1, x2, y, texto, clase, dy = -6) {
  return `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" class="${clase}"/>
    <line x1="${x1}" y1="${y - 4}" x2="${x1}" y2="${y + 4}" class="${clase}"/>
    <line x1="${x2}" y1="${y - 4}" x2="${x2}" y2="${y + 4}" class="${clase}"/>
    <text x="${(x1 + x2) / 2}" y="${y + dy + (dy > 0 ? 6 : 0)}" text-anchor="middle" class="t-${clase}">${texto}</text>`;
}

// Qué elementos del dibujo se resaltan con cada opción del selector de parámetros.
const RESALTA = {
  A: ["A"], P: ["P"], T: ["T"], y: ["y"],
  R: ["A", "P"], D: ["A", "T", "D"], datos: ["b", "z", "D0", "theta"],
};

// Corte transversal a escala con sus elementos geométricos señalados:
// A (área mojada), P (perímetro mojado), T (ancho superficial), y (tirante), b (ancho de fondo),
// z (talud), D₀ y θ (circular). `destacar` es una clave de RESALTA o "" para verlos todos.
export function dibujarParametros(s, y, destacar = "") {
  const svg = document.createElementNS(SVGNS, "svg");
  svg.setAttribute("viewBox", "0 0 320 250");
  svg.setAttribute("class", "esquema parametros");
  svg.setAttribute("role", "img");
  const activos = RESALTA[destacar] || [];
  const grupo = (k, contenido) => {
    const estado = !destacar ? "" : activos.includes(k) ? " activo" : " tenue";
    return `<g class="p-${k}${estado}">${contenido}</g>`;
  };
  const izq = 72, der = 72, arriba = 42, abajo = 46;
  const W = 320 - izq - der, H = 250 - arriba - abajo;
  const cx = izq + W / 2, fondo = arriba + H;
  const G = geometria(s, y);
  let partes = "", tope = 0, base = 250;

  if (s.forma === "circular") {
    const D = s.D, k = Math.min(W, H) / D, r = (D / 2) * k, cy = fondo - r;
    const yy = Math.min(y, D * 0.99);
    const nivel = fondo - yy * k;
    const w = Math.sqrt(Math.max(r * r - (cy - nivel) ** 2, 0));
    const grande = yy > D / 2 ? 1 : 0;
    const arco = `M${cx - w},${nivel} A${r},${r} 0 ${grande} 0 ${cx + w},${nivel}`;
    partes += `<circle cx="${cx}" cy="${cy}" r="${r}" class="contorno"/>`;
    partes += grupo("A", `<path d="${arco} Z" class="agua"/>
      <text x="${cx}" y="${fondo - 12}" text-anchor="middle" class="t-agua">A = ${cs(G.A)} m²</text>`);
    partes += grupo("P", `<path d="${arco}" class="perimetro"/>
      <text x="${cx - r - 6}" y="${fondo - 6}" text-anchor="end" class="t-perimetro">P = ${cs(G.P)} m</text>`);
    partes += grupo("T", cotaH(cx - w, cx + w, nivel - 10, `T = ${cs(G.T)} m`, "ancho"));
    partes += grupo("y", cota(cx + r + 14, fondo, nivel, `y = ${cs(yy)} m`).replaceAll('class="cota"', 'class="tirante"').replace("<text ", '<text class="t-tirante" '));
    partes += grupo("D0", cotaH(cx - r, cx + r, fondo + 16, `D₀ = ${cs(D)} m`, "base", 8));
    // Ángulo central θ: radios a los extremos de la superficie y arco por debajo del centro.
    const u = 18, ux = w / r, uy = (nivel - cy) / r;
    partes += grupo("theta", `<line x1="${cx}" y1="${cy}" x2="${cx - w}" y2="${nivel}" class="theta"/>
      <line x1="${cx}" y1="${cy}" x2="${cx + w}" y2="${nivel}" class="theta"/>
      <path d="M${cx - u * ux},${cy + u * uy} A${u},${u} 0 ${grande} 0 ${cx + u * ux},${cy + u * uy}" class="theta"/>
      <text x="${cx}" y="${cy + u + 14}" text-anchor="middle" class="t-theta">θ = ${cs(G.theta)} rad</text>`);
    if (destacar === "D") {
      partes += `<rect x="${cx - G.T * k / 2}" y="${nivel}" width="${G.T * k}" height="${G.Dh * k}" class="equivalente"/>`;
    }
    tope = Math.min(cy - r, nivel - 24) - 6;
    base = fondo + 36;
  } else {
    const b = s.forma === "triangular" ? 0 : s.b;
    const z = s.forma === "rectangular" ? 0 : s.z;
    const Hd = y * 1.4;
    const Ttop = b + 2 * z * Hd;
    const k = Math.min(W / Math.max(Ttop, 1e-6), H / Hd);
    const X = (u) => cx + u * k, Y = (v) => fondo - v * k;
    const T = b + 2 * z * y;
    partes += `<path d="M${X(-Ttop / 2)},${Y(Hd)} L${X(-b / 2)},${Y(0)} L${X(b / 2)},${Y(0)} L${X(Ttop / 2)},${Y(Hd)}" class="contorno"/>`;
    partes += grupo("A", `<path d="M${X(-T / 2)},${Y(y)} L${X(-b / 2)},${Y(0)} L${X(b / 2)},${Y(0)} L${X(T / 2)},${Y(y)} Z" class="agua"/>
      <text x="${cx}" y="${Y(y * (b > 0 ? 0.45 : 0.6))}" text-anchor="middle" class="t-agua">A = ${cs(G.A)} m²</text>`);
    partes += grupo("P", `<path d="M${X(-T / 2)},${Y(y)} L${X(-b / 2)},${Y(0)} L${X(b / 2)},${Y(0)} L${X(T / 2)},${Y(y)}" class="perimetro"/>
      <text x="${X(-Ttop / 2) - 6}" y="${Y(y / 2) + 4}" text-anchor="end" class="t-perimetro">P = ${cs(G.P)} m</text>`);
    partes += grupo("T", cotaH(X(-T / 2), X(T / 2), Y(y) - 10, `T = ${cs(T)} m`, "ancho"));
    partes += grupo("y", cota(X(Ttop / 2) + 14, Y(0), Y(y), `y = ${cs(y)} m`).replaceAll('class="cota"', 'class="tirante"').replace("<text ", '<text class="t-tirante" '));
    if (b > 0) partes += grupo("b", cotaH(X(-b / 2), X(b / 2), Y(0) + 14, `b = ${cs(b)} m`, "base", 8));
    if (z > 0) {
      // Triángulo del talud sobre la pared derecha: 1 vertical por z horizontal.
      const h0 = 0.15 * Hd, v = 0.3 * Hd;
      const p1 = [X(b / 2 + z * h0), Y(h0)], p2 = [X(b / 2 + z * (h0 + v)), Y(h0 + v)];
      partes += grupo("z", `<path d="M${p1[0]},${p1[1]} L${p2[0]},${p1[1]} L${p2[0]},${p2[1]}" class="talud"/>
        <text x="${(p1[0] + p2[0]) / 2}" y="${p1[1] + 13}" text-anchor="middle" class="t-talud">z = ${cs(z, 2)}</text>
        <text x="${p2[0] + 5}" y="${(p1[1] + p2[1]) / 2 + 4}" class="t-talud">1</text>`);
    }
    if (destacar === "D") {
      partes += `<rect x="${X(-T / 2)}" y="${Y(y)}" width="${T * k}" height="${G.Dh * k}" class="equivalente"/>`;
    }
    tope = Math.min(Y(Hd), Y(y) - 24) - 6;
    base = fondo + (b > 0 ? 30 : 18);
  }
  // Recorta el lienzo al contenido para que no quede espacio vacío arriba.
  svg.setAttribute("viewBox", `0 ${tope} 320 ${base - tope}`);
  svg.innerHTML = partes;
  return svg;
}

// ---------- Componentes de la página ----------

function nodo(etiqueta, clase, html) {
  const e = document.createElement(etiqueta);
  if (clase) e.className = clase;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

// Ejercicio con datos aleatorios y verificación inmediata.
//   generar():      objeto con los datos de un enunciado nuevo
//   enunciado(d):   HTML del enunciado
//   respuestas:     [{etiqueta, unidad, valor: d => número}]  o, para elegir una opción,
//                   [{etiqueta, opciones: ["M1", "M2", …], valor: d => "M2"}]
//   solucion(d):    HTML con el desarrollo paso a paso
export function practica({ titulo = "Practica", generar, enunciado, respuestas, solucion, tolerancia = 0.01 }) {
  const caja = nodo("div", "practica");
  const cabecera = nodo("div", "practica-titulo", titulo);
  const texto = nodo("div", "practica-enunciado");
  const campos = nodo("div", "practica-campos");
  const botones = nodo("div", "practica-botones");
  const verificar = nodo("button", "btn btn-primary btn-sm", "Verificar");
  const ver = nodo("button", "btn btn-outline-secondary btn-sm", "Ver solución");
  const otro = nodo("button", "btn btn-outline-secondary btn-sm", "Otro ejercicio");
  const desarrollo = nodo("div", "practica-solucion");
  const numericas = respuestas.some((r) => !r.opciones);
  const ayuda = nodo("div", "practica-ayuda", numericas ? "Usa coma o punto decimal. Se acepta un error de hasta el 1 %." : "");
  botones.append(verificar, ver, otro);
  caja.append(cabecera, texto, campos, ayuda, botones, desarrollo);

  let datos, entradas;

  function nuevo() {
    datos = generar();
    texto.innerHTML = enunciado(datos);
    campos.innerHTML = "";
    desarrollo.innerHTML = "";
    desarrollo.hidden = true;
    entradas = respuestas.map((r) => {
      const fila = nodo("label", "practica-fila");
      let input;
      if (r.opciones) {
        input = nodo("select", "form-select form-select-sm");
        input.append(nodo("option", "", "Elige…"));
        input.firstChild.value = "";
        for (const o of r.opciones) {
          const op = nodo("option", "", o);
          op.value = o;
          input.append(op);
        }
      } else {
        input = nodo("input", "form-control form-control-sm");
        input.type = "text";
        input.inputMode = "decimal";
        input.autocomplete = "off";
        input.addEventListener("keydown", (ev) => { if (ev.key === "Enter") revisar(); });
      }
      const estado = nodo("span", "practica-estado");
      estado.setAttribute("aria-live", "polite");
      fila.append(nodo("span", "practica-etiqueta", r.etiqueta), input,
                  nodo("span", "practica-unidad", r.unidad || ""), estado);
      campos.append(fila);
      return { r, input, estado };
    });
  }

  function revisar() {
    for (const { r, input, estado } of entradas) {
      const correcto = r.valor(datos);
      if (r.opciones) {
        if (!input.value) {
          estado.textContent = "Elige una opción";
          estado.className = "practica-estado pendiente";
        } else if (input.value === correcto) {
          estado.textContent = "✔ Correcto";
          estado.className = "practica-estado bien";
        } else {
          estado.textContent = "✘ Revisa el criterio";
          estado.className = "practica-estado mal";
        }
        continue;
      }
      const v = leerNumero(input.value);
      if (Number.isNaN(v)) {
        estado.textContent = "Escribe un número";
        estado.className = "practica-estado pendiente";
      } else if (coincide(v, correcto, tolerancia)) {
        estado.textContent = "✔ Correcto";
        estado.className = "practica-estado bien";
      } else {
        const pista = coincide(Math.abs(v), Math.abs(correcto), tolerancia)
          ? "✘ Revisa el signo"
          : "✘ Revisa el cálculo y las unidades";
        estado.textContent = pista;
        estado.className = "practica-estado mal";
      }
    }
  }

  verificar.addEventListener("click", revisar);
  ver.addEventListener("click", () => {
    desarrollo.innerHTML = solucion(datos);
    desarrollo.hidden = !desarrollo.hidden;
  });
  otro.addEventListener("click", nuevo);
  nuevo();
  return caja;
}

// Fila de resultados "nombre = valor unidad" para los simuladores.
export function resultados(filas) {
  const tabla = nodo("table", "table table-sm resultados");
  for (const [nombre, valor, unidad, nota] of filas) {
    const tr = nodo("tr");
    tr.append(nodo("th", "", nombre), nodo("td", "valor", valor), nodo("td", "", unidad || ""),
              nodo("td", "nota", nota || ""));
    tabla.append(tr);
  }
  return tabla;
}
