import { memo, useMemo } from "react";
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

type AgentNodeState = {
  agent: string;
  status: "pending" | "in_progress" | "completed";
};

type AgentsGraphProps = {
  nodesState: AgentNodeState[];
  agentOutputs: Record<string, string>;
};

type TeamKey = "analysts" | "research" | "style" | "trader" | "risk" | "final";

type TeamNodeData = {
  label: string;
  color: string;
};

type AgentNodeData = {
  label: string;
  status: AgentNodeState["status"];
  team: TeamKey;
};

const teamTitle: Record<TeamKey, string> = {
  analysts: "Analyst Team",
  research: "Research Team",
  style: "Style Council",
  trader: "Trading Team",
  risk: "Risk Management",
  final: "Portfolio Management",
};

const teamColor: Record<TeamKey, string> = {
  analysts: "#4f6df5",
  research: "#36b37e",
  style: "#22b8cf",
  trader: "#f5a623",
  risk: "#e5534b",
  final: "#8b5cf6",
};

const teamOrder: TeamKey[] = ["analysts", "research", "style", "trader", "risk", "final"];

const teamFromAgent = (agent: string): TeamKey => {
  if (["Market Analyst", "Social Analyst", "News Analyst", "Fundamentals Analyst", "Quant Analyst"].includes(agent)) {
    return "analysts";
  }
  if (["Bull Researcher", "Bear Researcher", "Research Manager"].includes(agent)) return "research";
  if (["Buffett Advisor", "Larry Williams Advisor", "Livermore Advisor", "Style Manager"].includes(agent)) {
    return "style";
  }
  if (agent === "Trader") return "trader";
  if (["Aggressive Analyst", "Neutral Analyst", "Conservative Analyst", "Risk Judge"].includes(agent)) return "risk";
  if (agent === "Portfolio Manager") return "final";
  return "research";
};

const TeamNodeCard = memo(({ data }: NodeProps<TeamNodeData>) => {
  return (
    <div className="rf-team-node" style={{ borderColor: data.color, color: data.color, background: `${data.color}18` }}>
      <Handle type="target" position={Position.Top} className="rf-handle" />
      {data.label}
      <Handle type="source" position={Position.Bottom} className="rf-handle" />
    </div>
  );
});
TeamNodeCard.displayName = "TeamNodeCard";

const AgentNodeCard = memo(({ data, selected }: NodeProps<AgentNodeData>) => {
  return (
    <div className={`rf-agent-node ${selected ? "selected" : ""} ${data.status} team-${data.team}`}>
      <Handle type="target" position={Position.Top} className="rf-handle" />
      <div className="rf-agent-node-head">
        <span className={`rf-status-dot ${data.status}`} />
        <span className="rf-agent-node-status">{data.status.replace("_", " ")}</span>
      </div>
      <div className="rf-agent-node-title">{data.label}</div>
      <div className="rf-agent-node-lane">{teamTitle[data.team]}</div>
      <Handle type="source" position={Position.Bottom} className="rf-handle" />
    </div>
  );
});
AgentNodeCard.displayName = "AgentNodeCard";

const nodeTypes = {
  teamCard: TeamNodeCard,
  agentCard: AgentNodeCard,
};

export function AgentsGraph({ nodesState, agentOutputs }: AgentsGraphProps) {
  void agentOutputs;

  const { nodes, edges } = useMemo(() => {
    const grouped: Record<TeamKey, AgentNodeState[]> = {
      analysts: [],
      research: [],
      style: [],
      trader: [],
      risk: [],
      final: [],
    };

    nodesState.forEach((n) => grouped[teamFromAgent(n.agent)].push(n));

    const builtNodes: Node[] = [];
    const builtEdges: Edge[] = [];
    const startX = 90;
    const teamX = 370;
    const yStart = 50;
    const rowGap = 168;
    const colGap = 240;
    const itemGap = 58;

    teamOrder.forEach((team, teamIdx) => {
      const teamId = `team-${team}`;
      const teamY = yStart + teamIdx * rowGap;

      builtNodes.push({
        id: teamId,
        type: "teamCard",
        position: { x: teamX, y: teamY },
        data: { label: `${teamIdx + 1}. ${teamTitle[team]}`, color: teamColor[team] },
        draggable: false,
        selectable: false,
      });

      grouped[team].forEach((item, idx) => {
        const col = idx % 2;
        const row = Math.floor(idx / 2);
        const nodeId = item.agent;
        builtNodes.push({
          id: nodeId,
          type: "agentCard",
          position: { x: startX + col * colGap, y: teamY + 52 + row * itemGap },
          data: { label: item.agent, status: item.status, team },
          draggable: false,
          selectable: true,
        });

        builtEdges.push({
          id: `e-${teamId}-${nodeId}`,
          source: teamId,
          target: nodeId,
          type: "smoothstep",
          style: { stroke: teamColor[team], strokeWidth: 1.5, opacity: 0.4 },
        });
      });

      if (teamIdx < teamOrder.length - 1) {
        builtEdges.push({
          id: `e-${teamId}-next`,
          source: teamId,
          target: `team-${teamOrder[teamIdx + 1]}`,
          type: "smoothstep",
          style: { stroke: "#b2bfd6", strokeWidth: 1.8, strokeDasharray: "6 4" },
        });
      }
    });

    return { nodes: builtNodes, edges: builtEdges };
  }, [nodesState]);

  return (
    <div className="rf-wrap">
      <div className="h-[660px] w-full overflow-hidden rounded-lg border border-gray-200">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.22 }}
          nodesDraggable={false}
          nodesConnectable={false}
          proOptions={{ hideAttribution: true }}
        >
          <Controls showInteractive={false} />
          <Background gap={20} size={1} color="#e4e9f4" />
        </ReactFlow>
      </div>
    </div>
  );
}

