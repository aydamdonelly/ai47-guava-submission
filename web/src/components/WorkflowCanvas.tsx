import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Bot,
  CheckCircle2,
  Database,
  GitBranch,
  MessageSquareText,
  PhoneCall,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useMemo } from "react";
import { cn } from "../lib/cn";
import type { Workflow, WorkflowNode } from "../product/types";

export type WorkflowDefinition = Workflow & {
  cohort?: string;
};

type WorkflowCanvasProps = {
  workflow: WorkflowDefinition;
  activeNodeId?: string;
  emphasizedNodeId?: string;
  onNodeSelect?: (id: string) => void;
  selectedNodeId?: string;
};

type CanvasNodeData = {
  definition: WorkflowNode;
  active: boolean;
  onSelect?: (id: string) => void;
  pathActive: boolean;
  selected: boolean;
  emphasized: boolean;
};

type CanvasNode = Node<CanvasNodeData, "workflowNode">;

const nodeIcons: Record<string, LucideIcon> = {
  action: Database,
  branch: GitBranch,
  call: PhoneCall,
  check: ShieldCheck,
  closing: CheckCircle2,
  complete: CheckCircle2,
  data: Database,
  message: MessageSquareText,
  opening: PhoneCall,
  question: MessageSquareText,
};

function WorkflowNode({ data }: NodeProps<CanvasNode>) {
  const reduceMotion = useReducedMotion();
  const Icon = nodeIcons[data.definition.kind] ?? Bot;

  return (
    <>
      <Handle
        type="target"
        position={Position.Top}
        className="!size-2 !border-slate-300 !bg-white !opacity-0"
      />
      <motion.button
        type="button"
        aria-label={`Inspect ${data.definition.label}`}
        aria-pressed={data.selected}
        onClick={() => data.onSelect?.(data.definition.id)}
        whileHover={reduceMotion ? undefined : { y: -1 }}
        whileTap={reduceMotion ? undefined : { scale: 0.99 }}
        transition={{ duration: reduceMotion ? 0 : 0.16, ease: "easeOut" }}
        className={cn(
          "nodrag w-52 rounded-lg border bg-white p-3 text-left shadow-sm outline-none",
          "transition-colors duration-150 motion-reduce:transition-none",
          "hover:border-slate-400 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2",
          data.pathActive ? "border-emerald-300 bg-emerald-50/30" : "border-slate-200",
          data.active && "border-emerald-600 bg-white ring-2 ring-emerald-100",
          data.selected && !data.active && "border-blue-600",
          data.emphasized && !data.active && "ring-2 ring-slate-300",
        )}
      >
        {(data.definition.kind === "branch" || data.active) && (
          <span className="mb-2 flex items-center justify-between gap-2 text-xs font-medium">
            {data.definition.kind === "branch" ? (
              <span className="truncate text-slate-500">Decision</span>
            ) : (
              <span aria-hidden="true" />
            )}
            {data.active && (
              <span className="inline-flex shrink-0 items-center gap-1.5 text-emerald-700">
                <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                Current
              </span>
            )}
          </span>
        )}
        <span className="flex items-start gap-2.5">
          <span
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-md border",
              data.pathActive
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-slate-200 bg-slate-50 text-slate-600",
            )}
          >
            <Icon aria-hidden="true" className="size-4" strokeWidth={1.8} />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-slate-950">
              {data.definition.label}
            </span>
            {data.definition.prompt && (
              <span className="mt-0.5 block line-clamp-2 text-xs leading-5 text-slate-500">
                {data.definition.prompt}
              </span>
            )}
          </span>
        </span>
      </motion.button>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!size-2 !border-slate-300 !bg-white !opacity-0"
      />
    </>
  );
}

const nodeTypes: NodeTypes = { workflowNode: WorkflowNode };

function activePath(workflow: WorkflowDefinition, activeNodeId?: string) {
  const nodeIds = new Set<string>();
  const edgeIds = new Set<string>();
  if (!activeNodeId) return { nodeIds, edgeIds };

  const incoming = new Map(workflow.nodes.map((node) => [node.id, 0]));
  const outgoing = new Map<string, typeof workflow.edges>();
  for (const edge of workflow.edges) {
    incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1);
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge]);
  }

  const roots = workflow.nodes
    .filter((node) => (incoming.get(node.id) ?? 0) === 0)
    .map((node) => node.id);
  const queue = roots.length ? roots : [workflow.nodes[0]?.id].filter(Boolean) as string[];
  const visited = new Set(queue);
  const parent = new Map<string, { nodeId: string; edgeId: string }>();

  for (let index = 0; index < queue.length; index += 1) {
    const sourceId = queue[index];
    for (const edge of outgoing.get(sourceId) ?? []) {
      if (visited.has(edge.target)) continue;
      visited.add(edge.target);
      parent.set(edge.target, { nodeId: sourceId, edgeId: edge.id });
      queue.push(edge.target);
    }
  }

  let currentId: string | undefined = activeNodeId;
  while (currentId) {
    nodeIds.add(currentId);
    const previous = parent.get(currentId);
    if (!previous) break;
    edgeIds.add(previous.edgeId);
    currentId = previous.nodeId;
  }
  return { nodeIds, edgeIds };
}

function workflowPositions(workflow: WorkflowDefinition) {
  const nodeIds = new Set(workflow.nodes.map((node) => node.id));
  const outgoing = new Map<string, string[]>();
  const incoming = new Map(workflow.nodes.map((node) => [node.id, 0]));

  for (const edge of workflow.edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) continue;
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge.target]);
    incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1);
  }

  const depth = new Map<string, number>();

  function placeComponent(startId: string, startDepth: number) {
    const queue = [startId];
    depth.set(startId, startDepth);

    for (let index = 0; index < queue.length; index += 1) {
      const sourceId = queue[index];
      const nextDepth = (depth.get(sourceId) ?? startDepth) + 1;
      for (const targetId of outgoing.get(sourceId) ?? []) {
        if (depth.has(targetId)) continue;
        depth.set(targetId, nextDepth);
        queue.push(targetId);
      }
    }
  }

  for (const node of workflow.nodes) {
    if ((incoming.get(node.id) ?? 0) === 0 && !depth.has(node.id)) {
      placeComponent(node.id, 0);
    }
  }

  for (const node of workflow.nodes) {
    if (depth.has(node.id)) continue;
    const componentDepth = Math.max(-1, ...depth.values()) + 1;
    placeComponent(node.id, componentDepth);
  }

  // Converging terminal nodes belong after their deepest branch, while revisited
  // non-terminal nodes keep their first-visit depth so recursive edges cannot
  // continually push the graph to the right.
  for (const node of workflow.nodes) {
    if ((outgoing.get(node.id) ?? []).length > 0) continue;
    const predecessorDepths = workflow.edges
      .filter((edge) => edge.target === node.id)
      .map((edge) => depth.get(edge.source))
      .filter((value): value is number => value !== undefined);
    if (predecessorDepths.length > 0) {
      depth.set(node.id, Math.max(...predecessorDepths) + 1);
    }
  }

  const rows = new Map<number, string[]>();
  for (const node of workflow.nodes) {
    const nodeDepth = depth.get(node.id) ?? 0;
    rows.set(nodeDepth, [...(rows.get(nodeDepth) ?? []), node.id]);
  }

  return new Map(
    workflow.nodes.map((node) => {
      const nodeDepth = depth.get(node.id) ?? 0;
      const row = rows.get(nodeDepth) ?? [node.id];
      const siblingIndex = row.indexOf(node.id);
      const rowWidth = (row.length - 1) * 244;
      return [node.id, { x: siblingIndex * 244 - rowWidth / 2, y: nodeDepth * 132 }];
    }),
  );
}

export function WorkflowCanvas({
  workflow,
  activeNodeId,
  emphasizedNodeId,
  onNodeSelect,
  selectedNodeId,
}: WorkflowCanvasProps) {
  const path = useMemo(() => activePath(workflow, activeNodeId), [workflow, activeNodeId]);
  const positions = useMemo(() => workflowPositions(workflow), [workflow]);

  const nodes = useMemo<CanvasNode[]>(
    () =>
      workflow.nodes.map((definition) => ({
        id: definition.id,
        type: "workflowNode",
        position: positions.get(definition.id) ?? { x: 0, y: 0 },
        draggable: false,
        selectable: true,
        data: {
          definition,
          active: definition.id === activeNodeId,
          pathActive: path.nodeIds.has(definition.id),
          emphasized: definition.id === emphasizedNodeId,
          selected: definition.id === selectedNodeId,
          onSelect: onNodeSelect,
        },
      })),
    [
      activeNodeId,
      emphasizedNodeId,
      onNodeSelect,
      path.nodeIds,
      positions,
      selectedNodeId,
      workflow.nodes,
    ],
  );

  const edges = useMemo<Edge[]>(
    () =>
      workflow.edges.map((definition) => {
        const highlighted = path.edgeIds.has(definition.id);
        const color = highlighted ? "#34d399" : "#cbd5e1";
        return {
          id: definition.id,
          source: definition.source,
          target: definition.target,
          label: definition.label,
          type: "smoothstep",
          markerEnd: { type: MarkerType.ArrowClosed, color, width: 14, height: 14 },
          style: { stroke: color, strokeWidth: highlighted ? 1.75 : 1 },
          labelStyle: { fill: "#64748b", fontSize: 11, fontWeight: 500 },
          labelBgStyle: { fill: "#ffffff", fillOpacity: 0.94 },
          labelBgPadding: [5, 3] as [number, number],
          labelBgBorderRadius: 4,
        };
      }),
    [path.edgeIds, workflow.edges],
  );

  return (
    <section
      aria-label={`${workflow.title} workflow`}
      className="relative h-full min-h-0 overflow-hidden rounded-xl border border-slate-200 bg-white"
    >
      <div className="pointer-events-none absolute left-4 top-4 z-10 max-w-72 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
        <p className="truncate text-sm font-semibold text-slate-900">{workflow.title}</p>
        <p className="mt-0.5 truncate text-xs text-slate-500">
          {workflow.cohort ?? workflow.audience}
        </p>
      </div>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.16, duration: 0 }}
        minZoom={0.45}
        maxZoom={1.6}
        nodesConnectable={false}
        nodesDraggable={false}
        nodesFocusable={false}
        edgesFocusable={false}
        panOnDrag
        zoomOnPinch
        zoomOnScroll
        proOptions={{ hideAttribution: true }}
        className="bg-white"
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#e2e8f0" />
        <Controls
          position="bottom-right"
          showInteractive={false}
          className="!overflow-hidden !rounded-lg !border !border-slate-200 !bg-white !shadow-sm"
        />
      </ReactFlow>
      <p className="sr-only">
        Pan or zoom the canvas to explore the workflow. Focus a node and activate it to inspect
        its details.
      </p>
    </section>
  );
}

export type { WorkflowCanvasProps };
