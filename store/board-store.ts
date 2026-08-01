import { create } from "zustand";
import type { BoardItemFull, TaskSimple } from "@/types/board";

interface BoardState {
  workspaceId: string | null;
  items: BoardItemFull[];
  setItems: (items: BoardItemFull[]) => void;
  moveItem: (id: string, x: number, y: number) => void;
  addItem: (item: BoardItemFull) => void;
  removeItem: (id: string) => void;
  updateBoardItem: (id: string, updates: Partial<BoardItemFull>) => void;
  updateTaskInMilestone: (milestoneId: string, taskId: string, updates: Partial<TaskSimple>) => void;
}

export const useBoardStore = create<BoardState>((set) => ({
  workspaceId: null,
  items: [],
  setItems: (items) => set({ items }),
  moveItem: (id, x, y) =>
    set((state) => ({
      items: state.items.map((item) => (item.id === id ? { ...item, x, y } : item)),
    })),
  addItem: (item) => set((state) => ({ items: [...state.items, item] })),
  removeItem: (id) => set((state) => ({ items: state.items.filter((i) => i.id !== id) })),
  updateBoardItem: (id, updates) =>
    set((state) => ({
      items: state.items.map((item) => (item.id === id ? { ...item, ...updates } : item)),
    })),
  updateTaskInMilestone: (milestoneId, taskId, updates) =>
    set((state) => ({
      items: state.items.map((item) => {
        if (
          item.linkedMilestoneId === milestoneId ||
          item.linkedMilestone?.id === milestoneId
        ) {
          if (!item.linkedMilestone) return item;
          const updatedTasks = item.linkedMilestone.tasks.map((task) =>
            task.id === taskId ? { ...task, ...updates } : task
          );
          return {
            ...item,
            linkedMilestone: {
              ...item.linkedMilestone,
              tasks: updatedTasks,
            },
          };
        }
        return item;
      }),
    })),
}));

// Hook that initialises the store once with server data
export function useBoard(workspaceId: string, initialItems: BoardItemFull[]) {
  const store = useBoardStore();
  // Initialise only when workspaceId changes (e.g. navigation)
  if (store.workspaceId !== workspaceId) {
    store.setItems(initialItems);
    useBoardStore.setState({ workspaceId });
  }
  return store;
}
