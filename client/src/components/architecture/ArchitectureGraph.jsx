import { useMemo } from 'react';
import ReactFlow, { Background, Controls } from 'reactflow';
import dagre from 'dagre';
import 'reactflow/dist/style.css';

// Visualizes a system architecture from plain JSON data.
// nodes: [{ id, label?, position? }] — explicit positions are honored; the
// rest are auto-laid-out top-down with dagre. Parallel edges between the same
// pair merge into one labeled edge so severity labels never stack.
const NODE_WIDTH = 220;
const LINE_HEIGHT = 18;
const CHARS_PER_LINE = 26;
const BASE_HEIGHT = 44;

const SEVERITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 };

function estimateHeight(label) {
  const lines = Math.max(1, Math.ceil(String(label ?? '').length / CHARS_PER_LINE));
  return BASE_HEIGHT + (lines - 1) * LINE_HEIGHT;
}

function toFlowNodes(nodes) {
  const seen = new Set();
  return (Array.isArray(nodes) ? nodes : [])
    .filter((n) => n && typeof n.id !== 'undefined' && !seen.has(String(n.id)) && (seen.add(String(n.id)), true))
    .map((n) => {
      const id = String(n.id);
      const label = n.label ?? id;
      return {
        id,
        label,
        fixed: n.position && Number.isFinite(n.position.x) && Number.isFinite(n.position.y)
          ? { x: n.position.x, y: n.position.y }
          : null,
        width: NODE_WIDTH,
        height: estimateHeight(label),
      };
    });
}

function layoutTopDown(items, pairs) {
  const free = items.filter((n) => !n.fixed);
  const positions = new Map(items.filter((n) => n.fixed).map((n) => [n.id, n.fixed]));
  if (free.length) {
    const g = new dagre.graphlib.Graph();
    g.setGraph({ rankdir: 'TB', nodesep: 80, ranksep: 130 });
    g.setDefaultEdgeLabel(() => ({}));
    for (const n of items) g.setNode(n.id, { width: n.width, height: n.height });
    for (const [s, t] of pairs) g.setEdge(s, t);
    dagre.layout(g);
    for (const n of free) {
      const p = g.node(n.id);
      positions.set(n.id, { x: p.x - n.width / 2, y: p.y - n.height / 2 });
    }
  }
  return positions;
}

function topSeverity(labels) {
  let best = null;
  for (const l of labels) {
    if (best === null || (SEVERITY_RANK[l] ?? 99) < (SEVERITY_RANK[best] ?? 99)) best = l;
  }
  return best;
}

function toFlowEdges(edges, nodeIds) {
  const groups = new Map();
  for (const e of Array.isArray(edges) ? edges : []) {
    if (!e || !nodeIds.has(String(e.source)) || !nodeIds.has(String(e.target))) continue;
    const key = `${e.source}→${e.target}`;
    if (!groups.has(key)) groups.set(key, { source: String(e.source), target: String(e.target), labels: [] });
    if (e.label !== undefined) groups.get(key).labels.push(String(e.label));
  }
  return [...groups.values()].map((g) => {
    const top = topSeverity(g.labels);
    const label = g.labels.length <= 1 ? g.labels[0] : `${g.labels.length} findings${top ? ` · ${top}` : ''}`;
    return {
      id: `e-${g.source}-${g.target}`,
      source: g.source,
      target: g.target,
      label,
      labelStyle: { fill: '#cbd5e1', fontSize: 11 },
      labelBgStyle: { fill: '#0f172a' },
      labelBgPadding: [6, 4],
      labelBgBorderRadius: 4,
    };
  });
}

export default function ArchitectureGraph({ nodes = [], edges = [], className = 'h-[50vh] min-h-[400px] w-full md:h-[75vh]' }) {
  const { flowNodes, flowEdges } = useMemo(() => {
    const items = toFlowNodes(nodes);
    const nodeIds = new Set(items.map((n) => n.id));
    const merged = toFlowEdges(edges, nodeIds);
    const positions = layoutTopDown(items, merged.map((e) => [e.source, e.target]));
    return {
      flowNodes: items.map((n) => ({
        id: n.id,
        position: positions.get(n.id),
        data: { label: n.label },
        className: 'text-xs md:text-sm',
        style: {
          background: '#0f172a',
          color: '#e2e8f0',
          border: '1px solid #334155',
          borderRadius: 8,
          padding: '8px 12px',
          width: NODE_WIDTH,
          whiteSpace: 'normal',
          overflowWrap: 'break-word',
          wordBreak: 'break-word',
        },
      })),
      flowEdges: merged,
    };
  }, [nodes, edges]);

  if (!flowNodes.length) {
    return <p className="rounded-xl border border-slate-800 bg-slate-900 p-6 text-sm text-slate-500">No architecture data to show yet.</p>;
  }

  return (
    <div className={`overflow-hidden rounded-xl border border-slate-800 bg-slate-950 ${className}`}>
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        panOnDrag
        zoomOnPinch
        defaultEdgeOptions={{ type: 'smoothstep', style: { stroke: '#64748b' } }}
      >
        <Background gap={16} color="#1e293b" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
