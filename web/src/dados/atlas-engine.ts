// Knowledge Atlas — graph layout + canvas rendering engine.
// Pure 3D force-directed layout projected to 2D, with three view modes:
//   atlas  – free 2D force layout
//   shell  – nodes on a sphere, slowly rotatable ("Sphere")
//   tier   – nodes layered by cluster index ("Layers")
//
// The engine is intentionally framework-agnostic: the React component owns a
// canvas ref and drives the engine through an imperative handle.

import type { AtlasGraph, AtlasNode, Cluster } from "./atlas-data";

export type ViewMode = "atlas" | "shell" | "tier";

export interface EngineOptions {
  showFlow: boolean;
  showLabels: boolean;
  autoOrbit: boolean;
  theme: "dark" | "light";
}

export interface EngineStats {
  visibleNodes: number;
  visibleEdges: number;
  avgDegree: number;
  fps: number;
}

export interface EngineCallbacks {
  onSelect?: (nodeId: string | null) => void;
  onPath?: (chain: string[] | null) => void;
  onStats?: (stats: EngineStats) => void;
  onMode?: (mode: ViewMode) => void;
  onZoom?: (pct: number) => void;
}

interface NodeSim {
  id: string;
  cluster: string;
  // 3D position in world space
  x: number;
  y: number;
  z: number;
  // velocity
  vx: number;
  vy: number;
  vz: number;
  // target anchor (for shell/tier modes)
  ax: number;
  ay: number;
  az: number;
  fixed: boolean;
}

interface Camera {
  rotX: number;
  rotY: number;
  zoom: number;
  panX: number;
  panY: number;
}

const TAU = Math.PI * 2;

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

function mix(hex: string, target: [number, number, number], t: number): string {
  const [r, g, b] = hexToRgb(hex);
  const nr = Math.round(r + (target[0] - r) * t);
  const ng = Math.round(g + (target[1] - g) * t);
  const nb = Math.round(b + (target[2] - b) * t);
  return `rgb(${nr},${ng},${nb})`;
}

export class AtlasEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private graph: AtlasGraph;
  private nodes: Map<string, NodeSim> = new Map();
  private nodeArr: NodeSim[] = [];
  private adjacency: Map<string, Set<string>> = new Map();
  private edgeList: { from: NodeSim; to: NodeSim }[] = [];
  private clusterOf: Map<string, Cluster> = new Map();

  private cam: Camera = { rotX: -0.35, rotY: 0.4, zoom: 1, panX: 0, panY: 0 };
  private mode: ViewMode = "atlas";

  private selected: string | null = null;
  private pathNodes: Set<string> = new Set();
  private pathEdges: Set<string> = new Set();
  private pathChain: string[] | null = null;
  private hovered: string | null = null;
  private hiddenClusters: Set<string> = new Set();
  private searchMatch: Set<string> = new Set();
  private hasSearch = false;

  private opts: EngineOptions = {
    showFlow: true,
    showLabels: true,
    autoOrbit: false,
    theme: "dark",
  };

  private raf = 0;
  private running = false;
  private last = 0;
  private fpsEMA = 60;
  private statsTimer = 0;

  // interaction state
  private dragging: { kind: "orbit" | "pan" | "node"; id?: string; lastX: number; lastY: number } | null = null;
  private dpr = 1;
  private width = 0;
  private height = 0;

  private cb: EngineCallbacks = {};
  private labelLayer: HTMLDivElement | null = null;

  constructor(canvas: HTMLCanvasElement, graph: AtlasGraph, labelLayer: HTMLDivElement | null) {
    this.canvas = canvas;
    this.labelLayer = labelLayer;
    this.graph = graph;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("2D context unavailable");
    this.ctx = ctx;
    this.buildGraph();
    this.resize();
  }

  private buildGraph() {
    const clusters = new Map<string, Cluster>();
    for (const c of this.graph.clusters) clusters.set(c.id, c);
    this.clusterOf = clusters;

    // initialize node positions using a layered initial layout per cluster
    // so the force sim starts from a reasonable configuration.
    const byCluster = new Map<string, AtlasNode[]>();
    for (const n of this.graph.nodes) {
      if (!byCluster.has(n.cluster)) byCluster.set(n.cluster, []);
      byCluster.get(n.cluster)!.push(n);
    }

    const clusterAngle = TAU / this.graph.clusters.length;
    this.graph.clusters.forEach((c, ci) => {
      const members = byCluster.get(c.id) ?? [];
      const cx = Math.cos(ci * clusterAngle) * 320;
      const cy = Math.sin(ci * clusterAngle) * 320;
      members.forEach((n, i) => {
        const a = (i / members.length) * TAU;
        const r = 90 + (i % 3) * 22;
        const ns: NodeSim = {
          id: n.id,
          cluster: n.cluster,
          x: cx + Math.cos(a) * r,
          y: cy + Math.sin(a) * r,
          z: (Math.random() - 0.5) * 120,
          vx: 0, vy: 0, vz: 0,
          ax: 0, ay: 0, az: 0,
          fixed: false,
        };
        this.nodes.set(n.id, ns);
        this.nodeArr.push(ns);
      });
    });

    // adjacency (undirected for repulsion; directed stored separately)
    for (const e of this.graph.edges) {
      const a = this.nodes.get(e.from);
      const b = this.nodes.get(e.to);
      if (!a || !b) continue;
      this.edgeList.push({ from: a, to: b });
      if (!this.adjacency.has(e.from)) this.adjacency.set(e.from, new Set());
      if (!this.adjacency.has(e.to)) this.adjacency.set(e.to, new Set());
      this.adjacency.get(e.from)!.add(e.to);
      this.adjacency.get(e.to)!.add(e.from);
    }

    this.computeAnchors();
  }

  // ── anchor targets for shell/tier modes ────────────────────────────────
  private computeAnchors() {
    if (this.mode === "shell") {
      // arrange on a sphere: clusters on latitude bands, nodes around longitude
      const radius = 360;
      const byCluster = new Map<string, NodeSim[]>();
      for (const n of this.nodeArr) {
        if (!byCluster.has(n.cluster)) byCluster.set(n.cluster, []);
        byCluster.get(n.cluster)!.push(n);
      }
      const clusters = this.graph.clusters;
      clusters.forEach((c, i) => {
        const members = byCluster.get(c.id) ?? [];
        const lat = -Math.PI / 2 + ((i + 1) / (clusters.length + 1)) * Math.PI;
        const y = Math.sin(lat) * radius;
        const ringR = Math.cos(lat) * radius;
        members.forEach((m, j) => {
          const lon = (j / members.length) * TAU + (i * 0.3);
          m.ax = Math.cos(lon) * ringR;
          m.ay = y;
          m.az = Math.sin(lon) * ringR;
        });
      });
    } else if (this.mode === "tier") {
      // layered: clusters as horizontal bands stacked in z
      const clusters = this.graph.clusters;
      const zStep = 180;
      clusters.forEach((c, i) => {
        const members = this.nodeArr.filter((n) => n.cluster === c.id);
        const z = (i - (clusters.length - 1) / 2) * zStep;
        const cols = Math.ceil(Math.sqrt(members.length));
        const span = 460;
        members.forEach((m, j) => {
          const col = j % cols;
          const row = Math.floor(j / cols);
          m.ax = (col - (cols - 1) / 2) * (span / Math.max(1, cols - 1));
          m.ay = (row - Math.sqrt(members.length) / 2) * 40;
          m.az = z;
        });
      });
    }
  }

  // ── physics step ─────────────────────────────────────────────────────────
  private step(dt: number) {
    const dtClamp = Math.min(dt, 1 / 30);
    if (this.mode === "atlas") this.stepAtlas(dtClamp);
    else this.stepAnchored(dtClamp);
    if (this.opts.autoOrbit) this.cam.rotY += dtClamp * 0.18;
  }

  private stepAtlas(dt: number) {
    // repulsion (O(n^2) but n=81, fine)
    const n = this.nodeArr.length;
    const REP = 9000;
    for (let i = 0; i < n; i++) {
      const a = this.nodeArr[i];
      if (a.fixed) continue;
      for (let j = i + 1; j < n; j++) {
        const b = this.nodeArr[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let dz = b.z - a.z;
        let d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < 0.01) {
          dx = Math.random() - 0.5;
          dy = Math.random() - 0.5;
          dz = Math.random() - 0.5;
          d2 = 0.01;
        }
        const d = Math.sqrt(d2);
        const f = REP / d2;
        const fx = (dx / d) * f;
        const fy = (dy / d) * f;
        const fz = (dz / d) * f;
        a.vx -= fx; a.vy -= fy; a.vz -= fz;
        b.vx += fx; b.vy += fy; b.vz += fz;
      }
    }
    // spring (edge attraction) + mild cluster cohesion
    for (const e of this.edgeList) {
      const a = e.from;
      const b = e.to;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dz = b.z - a.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.01;
      const want = 130;
      const f = (d - want) * 0.02;
      const fx = (dx / d) * f;
      const fy = (dy / d) * f;
      const fz = (dz / d) * f;
      if (!a.fixed) { a.vx += fx; a.vy += fy; a.vz += fz; }
      if (!b.fixed) { b.vx -= fx; b.vy -= fy; b.vz -= fz; }
    }
    // center gravity + damping + integrate
    for (const a of this.nodeArr) {
      if (a.fixed) continue;
      a.vx -= a.x * 0.0009;
      a.vy -= a.y * 0.0009;
      a.vz -= a.z * 0.0009;
      a.vx *= 0.86; a.vy *= 0.86; a.vz *= 0.86;
      a.x += a.vx * dt * 60;
      a.y += a.vy * dt * 60;
      a.z += a.vz * dt * 60;
    }
  }

  private stepAnchored(dt: number) {
    // gentle pull toward anchors with residual jitter for life
    for (const a of this.nodeArr) {
      if (a.fixed) continue;
      const k = 0.08;
      a.vx += (a.ax - a.x) * k;
      a.vy += (a.ay - a.y) * k;
      a.vz += (a.az - a.z) * k;
      a.vx *= 0.82; a.vy *= 0.82; a.vz *= 0.82;
      a.x += a.vx * dt * 60;
      a.y += a.vy * dt * 60;
      a.z += a.vz * dt * 60;
    }
  }

  // ── projection ──────────────────────────────────────────────────────────
  private project(x: number, y: number, z: number): { sx: number; sy: number; depth: number; scale: number } {
    // rotate around Y then X (orbit camera)
    const cy = Math.cos(this.cam.rotY);
    const sy = Math.sin(this.cam.rotY);
    let x1 = x * cy - z * sy;
    let z1 = x * sy + z * cy;
    let y1 = y;
    const cx = Math.cos(this.cam.rotX);
    const sx = Math.sin(this.cam.rotX);
    const y2 = y1 * cx - z1 * sx;
    const z2 = y1 * sx + z1 * cx;
    // perspective
    const fov = 900;
    const depth = fov + z2;
    const scale = depth > 0 ? fov / depth : 0.0001;
    const px = x1 * scale * this.cam.zoom + this.width / 2 + this.cam.panX;
    const py = y2 * scale * this.cam.zoom + this.height / 2 + this.cam.panY;
    return { sx: px, sy: py, depth: z2, scale: scale * this.cam.zoom };
  }

  // ── render ──────────────────────────────────────────────────────────────
  private render() {
    const ctx = this.ctx;
    const isDark = this.opts.theme === "dark";
    const bg = isDark ? "#0a0d18" : "#f4f5f8";
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, this.width, this.height);

    // faint radial vignette
    const grad = ctx.createRadialGradient(
      this.width / 2, this.height / 2, 40,
      this.width / 2, this.height / 2, Math.max(this.width, this.height) * 0.7
    );
    if (isDark) {
      grad.addColorStop(0, "rgba(60,80,160,0.10)");
      grad.addColorStop(1, "rgba(0,0,0,0)");
    } else {
      grad.addColorStop(0, "rgba(120,140,220,0.08)");
      grad.addColorStop(1, "rgba(0,0,0,0)");
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.width, this.height);

    // project all nodes once
    const proj = new Map<string, { sx: number; sy: number; depth: number; scale: number }>();
    for (const a of this.nodeArr) {
      if (this.hiddenClusters.has(a.cluster)) continue;
      proj.set(a.id, this.project(a.x, a.y, a.z));
    }

    // sort nodes back-to-front for proper depth
    const visibleNodes = this.nodeArr.filter((n) => !this.hiddenClusters.has(n.cluster));
    const sorted = [...visibleNodes].sort((a, b) => {
      const pa = proj.get(a.id)!;
      const pb = proj.get(b.id)!;
      return pb.depth - pa.depth;
    });

    // determine highlight sets
    const sel = this.selected;
    const neighbors = sel ? this.adjacency.get(sel) ?? new Set<string>() : new Set<string>();
    const focusMode = sel !== null || this.pathNodes.size > 0 || this.hasSearch;

    // ── edges ─────────────────────────────────────────────────────────────
    for (const e of this.edgeList) {
      if (this.hiddenClusters.has(e.from.cluster) || this.hiddenClusters.has(e.to.cluster)) continue;
      const pa = proj.get(e.from.id);
      const pb = proj.get(e.to.id);
      if (!pa || !pb) continue;
      const c = this.clusterOf.get(e.from.cluster)!;
      const onPath = this.pathEdges.has(`${e.from.id}|${e.to.id}`);
      const involvesSel =
        sel !== null && (e.from.id === sel || e.to.id === sel);
      let alpha = isDark ? 0.16 : 0.22;
      let width = 0.8;
      let color = c.color;
      if (focusMode) {
        if (onPath) { alpha = 0.95; width = 2.4; }
        else if (involvesSel) { alpha = 0.7; width = 1.6; }
        else { alpha = isDark ? 0.04 : 0.06; }
      }
      ctx.strokeStyle = withAlpha(color, alpha);
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(pa.sx, pa.sy);
      ctx.lineTo(pb.sx, pb.sy);
      ctx.stroke();

      // signal flow arrowheads / moving dots
      if (this.opts.showFlow && (onPath || involvesSel || !focusMode)) {
        const dx = pb.sx - pa.sx;
        const dy = pb.sy - pa.sy;
        const len = Math.hypot(dx, dy);
        if (len > 24) {
          const t = ((performance.now() / 1400) % 1);
          const mx = pa.sx + dx * t;
          const my = pa.sy + dy * t;
          ctx.fillStyle = withAlpha(color, onPath ? 1 : 0.5);
          ctx.beginPath();
          ctx.arc(mx, my, onPath ? 2.6 : 1.8, 0, TAU);
          ctx.fill();
        }
      }
    }

    // ── nodes ─────────────────────────────────────────────────────────────
    const labelEls: { id: string; x: number; y: number; text: string; color: string; dim: boolean; size: number }[] = [];

    for (const n of sorted) {
      const p = proj.get(n.id)!;
      const c = this.clusterOf.get(n.cluster)!;
      const isSel = n.id === sel;
      const isHover = n.id === this.hovered;
      const isNeighbor = neighbors.has(n.id);
      const isPath = this.pathNodes.has(n.id);
      const isMatch = this.searchMatch.has(n.id);
      let radius = 4 + Math.log2(1 + (this.adjacency.get(n.id)?.size ?? 0)) * 1.6;
      radius *= Math.max(0.55, Math.min(1.6, p.scale));
      radius = Math.max(2.5, radius);

      let alpha = 1;
      if (focusMode && !isSel && !isNeighbor && !isPath && !isMatch) {
        alpha = isDark ? 0.18 : 0.22;
      }

      // halo for selected / hovered / path / match
      if (isSel || isHover || isPath || isMatch) {
        const haloR = radius + (isSel ? 14 : 9);
        const hg = ctx.createRadialGradient(p.sx, p.sy, radius, p.sx, p.sy, haloR);
        hg.addColorStop(0, withAlpha(c.color, 0.55));
        hg.addColorStop(1, withAlpha(c.color, 0));
        ctx.fillStyle = hg;
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, haloR, 0, TAU);
        ctx.fill();
      }

      // body
      const bodyColor = isDark ? mix(c.color, [10, 14, 28], isSel ? 0 : 0.25) : c.color;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = bodyColor;
      ctx.beginPath();
      ctx.arc(p.sx, p.sy, radius, 0, TAU);
      ctx.fill();
      // ring
      ctx.lineWidth = isSel ? 2.4 : 1;
      ctx.strokeStyle = isDark
        ? withAlpha(c.color, 0.9)
        : mix(c.color, [0, 0, 0], 0.35);
      ctx.stroke();
      ctx.globalAlpha = 1;

      if (this.opts.showLabels && p.scale > 0.45) {
        const dim = focusMode && !isSel && !isNeighbor && !isPath && !isMatch;
        labelEls.push({
          id: n.id,
          x: p.sx + radius + 4,
          y: p.sy,
          text: this.labelFor(n.id),
          color: c.color,
          dim,
          size: isSel ? 13 : 11,
        });
      }
    }

    this.drawLabelLayer(labelEls);
  }

  private labelFor(id: string): string {
    const n = this.graph.nodes.find((x) => x.id === id);
    return n ? n.label : id;
  }

  private drawLabelLayer(els: { id: string; x: number; y: number; text: string; color: string; dim: boolean; size: number }[]) {
    const layer = this.labelLayer;
    if (!layer) return;
    const isDark = this.opts.theme === "dark";
    // Build a compact HTML string; reusing nodes via innerHTML keeps it cheap at 81 labels.
    let html = "";
    for (const e of els) {
      const col = isDark ? "rgba(235,238,250,0.92)" : "rgba(20,24,38,0.92)";
      const op = e.dim ? (isDark ? 0.25 : 0.3) : 1;
      html += `<span class="lbl" data-id="${e.id}" style="left:${e.x.toFixed(1)}px;top:${e.y.toFixed(1)}px;color:${col};opacity:${op};font-size:${e.size}px;border-left:2px solid ${e.color};">${this.escape(e.text)}</span>`;
    }
    if (layer.dataset.html !== html) {
      layer.innerHTML = html;
      layer.dataset.html = html;
    }
  }

  private escape(s: string): string {
    return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
  }

  // ── picking ─────────────────────────────────────────────────────────────
  private pick(mx: number, my: number): string | null {
    let best: string | null = null;
    let bestD = 16;
    for (const n of this.nodeArr) {
      if (this.hiddenClusters.has(n.cluster)) continue;
      const p = this.project(n.x, n.y, n.z);
      const r = 5 + Math.log2(1 + (this.adjacency.get(n.id)?.size ?? 0)) * 1.6;
      const d = Math.hypot(p.sx - mx, p.sy - my);
      if (d < Math.max(bestD, r + 4)) {
        if (d < bestD) {
          bestD = d;
          best = n.id;
        }
      }
    }
    return best;
  }

  // ── public API ──────────────────────────────────────────────────────────
  setCallbacks(cb: EngineCallbacks) {
    this.cb = cb;
  }

  setOptions(o: Partial<EngineOptions>) {
    this.opts = { ...this.opts, ...o };
  }

  setMode(mode: ViewMode) {
    if (this.mode === mode) return;
    this.mode = mode;
    if (mode === "atlas") {
      // re-seed velocities to settle into a new config
      for (const n of this.nodeArr) { n.vx *= 0.3; n.vy *= 0.3; n.vz *= 0.3; }
    } else {
      this.computeAnchors();
    }
    this.cb.onMode?.(mode);
  }

  getMode(): ViewMode {
    return this.mode;
  }

  setHiddenClusters(set: Set<string>) {
    this.hiddenClusters = new Set(set);
  }

  setSearch(query: string) {
    const q = query.trim().toLowerCase();
    this.searchMatch = new Set();
    this.hasSearch = q.length > 0;
    if (this.hasSearch) {
      for (const n of this.graph.nodes) {
        if (n.label.toLowerCase().includes(q) || n.blurb.toLowerCase().includes(q)) {
          this.searchMatch.add(n.id);
        }
      }
    }
  }

  select(id: string | null) {
    if (this.selected === id) return;
    this.selected = id;
    // if selecting a node while another is selected and shift-like context,
    // we leave path detection to explicit computePath API.
    this.cb.onSelect?.(id);
  }

  clearSelection() {
    this.selected = null;
    this.pathNodes.clear();
    this.pathEdges.clear();
    this.pathChain = null;
    this.cb.onSelect?.(null);
    this.cb.onPath?.(null);
  }

  // BFS shortest directed-considered path (treats graph as undirected for reachability)
  computePath(src: string, dst: string): string[] | null {
    if (src === dst) return null;
    const prev = new Map<string, string | null>();
    const seen = new Set<string>([src]);
    const queue: string[] = [src];
    prev.set(src, null);
    while (queue.length) {
      const cur = queue.shift()!;
      if (cur === dst) break;
      const adj = this.adjacency.get(cur);
      if (!adj) continue;
      for (const nx of adj) {
        if (!seen.has(nx)) {
          seen.add(nx);
          prev.set(nx, cur);
          queue.push(nx);
        }
      }
    }
    if (!prev.has(dst)) return null;
    const chain: string[] = [];
    let cur: string | null = dst;
    while (cur) {
      chain.unshift(cur);
      cur = prev.get(cur) ?? null;
    }
    this.pathNodes = new Set(chain);
    this.pathEdges.clear();
    for (let i = 0; i < chain.length - 1; i++) {
      this.pathEdges.add(`${chain[i]}|${chain[i + 1]}`);
      this.pathEdges.add(`${chain[i + 1]}|${chain[i]}`);
    }
    this.pathChain = chain;
    this.cb.onPath?.(chain);
    return chain;
  }

  clearPath() {
    this.pathNodes.clear();
    this.pathEdges.clear();
    this.pathChain = null;
    this.cb.onPath?.(null);
  }

  zoomBy(factor: number) {
    this.cam.zoom = Math.max(0.3, Math.min(3.2, this.cam.zoom * factor));
    this.cb.onZoom?.(Math.round(this.cam.zoom * 100));
  }

  resetZoom() {
    this.cam.zoom = 1;
    this.cb.onZoom?.(100);
  }

  resetView() {
    this.cam = { rotX: -0.35, rotY: 0.4, zoom: 1, panX: 0, panY: 0 };
    this.cb.onZoom?.(100);
  }

  // ── lifecycle ───────────────────────────────────────────────────────────
  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = Math.max(1, Math.floor(rect.width));
    this.height = Math.max(1, Math.floor(rect.height));
    this.canvas.width = Math.floor(this.width * this.dpr);
    this.canvas.height = Math.floor(this.height * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      const dt = (now - this.last) / 1000;
      this.last = now;
      // fps EMA
      const inst = 1 / Math.max(0.0001, dt);
      this.fpsEMA = this.fpsEMA * 0.9 + inst * 0.1;
      this.step(dt);
      this.render();
      this.statsTimer += dt;
      if (this.statsTimer > 0.4) {
        this.statsTimer = 0;
        const visN = this.nodeArr.length - this.nodeArr.filter((n) => this.hiddenClusters.has(n.cluster)).length;
        let visE = 0;
        for (const e of this.edgeList) {
          if (this.hiddenClusters.has(e.from.cluster) || this.hiddenClusters.has(e.to.cluster)) continue;
          visE++;
        }
        const avgDeg = visN > 0 ? (visE * 2) / visN : 0;
        this.cb.onStats?.({
          visibleNodes: visN,
          visibleEdges: visE,
          avgDegree: Number(avgDeg.toFixed(2)),
          fps: Math.round(this.fpsEMA),
        });
      }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  // ── pointer / wheel handlers (attachable) ───────────────────────────────
  onPointerDown = (ev: PointerEvent) => {
    const rect = this.canvas.getBoundingClientRect();
    const mx = ev.clientX - rect.left;
    const my = ev.clientY - rect.top;
    const hit = this.pick(mx, my);
    this.canvas.setPointerCapture(ev.pointerId);
    if (hit && ev.shiftKey && this.selected && this.selected !== hit) {
      this.computePath(this.selected, hit);
      this.dragging = null;
      return;
    }
    if (hit) {
      this.select(hit);
      this.dragging = { kind: "node", id: hit, lastX: mx, lastY: my };
    } else if (ev.button === 2 || ev.shiftKey) {
      this.dragging = { kind: "pan", lastX: mx, lastY: my };
    } else {
      this.dragging = { kind: "orbit", lastX: mx, lastY: my };
    }
  };

  onPointerMove = (ev: PointerEvent) => {
    const rect = this.canvas.getBoundingClientRect();
    const mx = ev.clientX - rect.left;
    const my = ev.clientY - rect.top;
    if (!this.dragging) {
      const h = this.pick(mx, my);
      if (h !== this.hovered) {
        this.hovered = h;
        this.canvas.style.cursor = h ? "pointer" : "grab";
      }
      return;
    }
    const dx = mx - this.dragging.lastX;
    const dy = my - this.dragging.lastY;
    this.dragging.lastX = mx;
    this.dragging.lastY = my;
    if (this.dragging.kind === "orbit") {
      this.cam.rotY += dx * 0.005;
      this.cam.rotX += dy * 0.005;
      this.cam.rotX = Math.max(-1.4, Math.min(1.4, this.cam.rotX));
    } else if (this.dragging.kind === "pan") {
      this.cam.panX += dx;
      this.cam.panY += dy;
    } else if (this.dragging.kind === "node" && this.dragging.id) {
      // project a screen delta back into world: simplest is to move along the
      // camera's right/up vectors scaled by 1/zoom.
      const node = this.nodes.get(this.dragging.id);
      if (node) {
        const s = 1 / Math.max(0.1, this.cam.zoom);
        const cy = Math.cos(this.cam.rotY);
        const sy = Math.sin(this.cam.rotY);
        // right vector in world ≈ (cosY, 0, -sinY); up ≈ (0,1,0) before X tilt
        node.x += dx * s * cy;
        node.z -= dx * s * sy;
        node.y += dy * s;
        node.fixed = true;
      }
    }
  };

  onPointerUp = (ev: PointerEvent) => {
    if (this.dragging?.kind === "node" && this.dragging.id) {
      const node = this.nodes.get(this.dragging.id);
      if (node) node.fixed = false;
    }
    this.dragging = null;
    try { this.canvas.releasePointerCapture(ev.pointerId); } catch { /* noop */ }
  };

  onWheel = (ev: WheelEvent) => {
    ev.preventDefault();
    const factor = ev.deltaY < 0 ? 1.12 : 1 / 1.12;
    this.zoomBy(factor);
  };

  // click-to-focus a node id (e.g. from the sidebar list)
  focusNode(id: string) {
    const n = this.nodes.get(id);
    if (!n) return;
    this.select(id);
  }

  getSelected(): string | null {
    return this.selected;
  }

  getPath(): string[] | null {
    return this.pathChain;
  }

  getGraph(): AtlasGraph {
    return this.graph;
  }
}
