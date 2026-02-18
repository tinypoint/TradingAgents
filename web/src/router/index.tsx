import { createBrowserRouter } from "react-router-dom";
import AnalyzeWorkspace from "../components/blocks/AnalyzeWorkspace";

export const router = createBrowserRouter([
  { path: "/", element: <AnalyzeWorkspace /> },
]);

