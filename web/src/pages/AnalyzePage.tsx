import { useParams } from "react-router-dom";
import AnalyzeWorkspace from "../components/blocks/AnalyzeWorkspace";

export function AnalyzePage() {
  const { symbol } = useParams();
  return <AnalyzeWorkspace initialTicker={symbol} />;
}

