import { useMemo } from 'react';
import ReactFlow, { Background, Controls } from 'reactflow';
import 'reactflow/dist/style.css';

// Visualizes a system architecture from plain JSON data.
// nodes: [{ id, label?, position?: { x, y } }] — nodes without a position
//   fall into a simple left-to-right, top-to-bottom grid.
// edges: [{ id?, source, target, label? }] — edges pointing at unknown node
//   ids are dropped, so a ragged export can never break the diagram.
const GRID_X = 240;
const GRID_Y = 120;
const GRID_COLUMNS = 3;

function toFlowNodes(nodes) {
  const seen = new Set();
  const clean = (Array.isArray(nodes) ? nodes : []).filter((n) => n && typeof n.id !== 'undefined' && !seen.has(String(n.id)) && (seen.add(String(n.id)), true));
  return clean.map((n, i) => {
    const id = String(n.id);
    const position =
      n.position && Number.isFinite(n.position.x) && Number.isFinite(n.position.y)
        ? { x: n.position.x, y: n.position.y }
        : { x: (i % GRID_COLUMNS) * GRID_X + 20, y: Math.floor(i / GRID_COLUMNS) * GRID_Y + 20 };
    return {
      id,
      position,
      data: { label: n.label ?? id },
      style: {
        background: '#0f172a',
        color: '#e2e8f0',
        border: '1px solid #334155',
        borderRadius: 8,
        padding: '8px 12px',
        fontSize: 12,
      },
    };
  });
}

function toFlowEdges(edges, nodeIds) {
  return (Array.isArray(edges) ? edges : [])
    .filter((e) => e && nodeIds.has(String(e.source)) && nodeIds.has(String(e.target)))
    .map((e, i) => ({
      id: e.id !== undefined ? String(e.id) : `e-${String(e.source)}-${String(e.target)}-${i}`,
      source: String(e.source),
      target: String(e.target),
      label: e.label,
      animated: false,
    }));
}

export default function ArchitectureGraph({ nodes = [], edges = [], className = 'h-[480px]' }) {
  const flowNodes = useMemo(() => toFlowNodes(nodes), [nodes]);
  const flowEdges = useMemo(() => toFlowEdges(edges, new Set(flowNodes.map((n) => n.id))), [edges, flowNodes]);

  if (!flowNodes.length) {
    return <p className="rounded-xl border border-slate-800 bg-slate-900 p-6 text-sm text-slate-500">No architecture data to show yet.</p>;
  }

  return (
    <div className={`overflow-hidden rounded-xl border border-slate-800 bg-slate-950 ${className}`}>
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        fitView
        defaultEdgeOptions={{ style: { stroke: '#64748b' } }}
      >
        <Background gap={16} color="#1e293b" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
