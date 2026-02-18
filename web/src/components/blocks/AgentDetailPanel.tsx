import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";

type AgentDetailPanelProps = {
  agent: string | null;
  output: string;
};

export function AgentDetailPanel({ agent, output }: AgentDetailPanelProps) {
  return (
    <Card className="mt-3">
      <CardHeader className="p-3 pb-1">
        <CardTitle className="text-base">Agent Output {agent ? `- ${agent}` : ""}</CardTitle>
      </CardHeader>
      <CardContent className="p-3 pt-0">
        <p className="whitespace-pre-wrap text-sm text-gray-700">{output || "Select a node to view its latest output."}</p>
      </CardContent>
    </Card>
  );
}

