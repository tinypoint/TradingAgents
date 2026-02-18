import { create } from "zustand";

type UIState = {
  processGraphExpanded: boolean;
  selectedAgentNode: string | null;
  setProcessGraphExpanded: (expanded: boolean) => void;
  setSelectedAgentNode: (agent: string | null) => void;
};

export const useUIStore = create<UIState>((set) => ({
  processGraphExpanded: true,
  selectedAgentNode: null,
  setProcessGraphExpanded: (expanded) => set({ processGraphExpanded: expanded }),
  setSelectedAgentNode: (agent) => set({ selectedAgentNode: agent }),
}));
