import { create } from "zustand";
import { useEffect, useMemo } from "react";
import type { BoardItemFull, TaskSimple } from "@/types/board";

interface BoardState {
  workspaceId: string | null;
  itemsById: Record<string, BoardItemFull>;
  itemOrder: string[];
  setItems: (items: BoardItemFull[]) => void;
  moveItem: (id: string, x: number, y: number) => void;
  addItem: (item: BoardItemFull) => void;
  removeItem: (id: string) => void;
  updateBoardItem: (id: string, updates: Partial<BoardItemFull>) => void;
  updateTaskInMilestone: (milestoneId: string, taskId: string, updates: Partial<TaskSimple>) => void;
  removeTaskFromMilestone: (milestoneId: string, taskId: string) => void;
  getAllItems: () => BoardItemFull[];
  getItem: (id: string) => BoardItemFull | undefined;
}

function itemsToRecord(items: BoardItemFull[]): {
  itemsById: Record<string, BoardItemFull>;
  itemOrder: string[];
} {
  const itemsById: Record<string, BoardItemFull> = {};
  const itemOrder: string[] = new Array(items.length);
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    itemsById[item.id] = item;
    itemOrder[i] = item.id;
  }
  return { itemsById, itemOrder };
}

export const useBoardStore = create<BoardState>((set, get) => ({
  workspaceId: null,
  itemsById: {},
  itemOrder: [],

  setItems: (items) => {
    const { itemsById, itemOrder } = itemsToRecord(items);
    set({ itemsById, itemOrder });
  },

  getAllItems: () => {
    const { itemsById, itemOrder } = get();
    const out: BoardItemFull[] = new Array(itemOrder.length);
    for (let i = 0; i < itemOrder.length; i++) {
      out[i] = itemsById[itemOrder[i]];
    }
    return out;
  },

  getItem: (id) => {
    return get().itemsById[id];
  },

  moveItem: (id, x, y) =>
    set((state) => {
      const existing = state.itemsById[id];
      if (!existing) return {};
      if (existing.x === x && existing.y === y) return {};
      return {
        itemsById: {
          ...state.itemsById,
          [id]: { ...existing, x, y },
        },
      };
    }),

  addItem: (item) =>
    set((state) => {
      if (state.itemsById[item.id]) {
        return { itemsById: { ...state.itemsById, [item.id]: item } };
      }
      return {
        itemsById: { ...state.itemsById, [item.id]: item },
        itemOrder: [...state.itemOrder, item.id],
      };
    }),

  removeItem: (id) =>
    set((state) => {
      const nextItemsById = { ...state.itemsById };
      delete nextItemsById[id];
      return {
        itemsById: nextItemsById,
        itemOrder: state.itemOrder.filter((i) => i !== id),
      };
    }),

  updateBoardItem: (id, updates) =>
    set((state) => {
      const existing = state.itemsById[id];
      if (!existing) return {};
      return {
        itemsById: {
          ...state.itemsById,
          [id]: { ...existing, ...updates },
        },
      };
    }),

  updateTaskInMilestone: (milestoneId, taskId, updates) =>
    set((state) => {
      let changed = false;
      const nextItemsById: Record<string, BoardItemFull> = { ...state.itemsById };
      for (const id of state.itemOrder) {
        const item = nextItemsById[id];
        if (
          item.linkedMilestoneId === milestoneId ||
          item.linkedMilestone?.id === milestoneId
        ) {
          if (!item.linkedMilestone) continue;
          const tasks = item.linkedMilestone.tasks ?? [];
          const updatedTasks = tasks.map((task) => {
            if (task.id === taskId) {
              changed = true;
              return { ...task, ...updates };
            }
            return task;
          });
          if (changed) {
            nextItemsById[id] = {
              ...item,
              linkedMilestone: { ...item.linkedMilestone, tasks: updatedTasks },
            };
            break;
          }
        }
      }
      return changed ? { itemsById: nextItemsById } : {};
    }),

  removeTaskFromMilestone: (milestoneId, taskId) =>
    set((state) => {
      let changed = false;
      const nextItemsById: Record<string, BoardItemFull> = { ...state.itemsById };
      for (const id of state.itemOrder) {
        const item = nextItemsById[id];
        if (
          item.linkedMilestoneId === milestoneId ||
          item.linkedMilestone?.id === milestoneId
        ) {
          if (!item.linkedMilestone) continue;
          const tasks = item.linkedMilestone.tasks ?? [];
          const updatedTasks = tasks.filter((task) => task.id !== taskId);
          if (updatedTasks.length !== tasks.length) {
            changed = true;
            nextItemsById[id] = {
              ...item,
              linkedMilestone: { ...item.linkedMilestone, tasks: updatedTasks },
            };
            break;
          }
        }
      }
      return changed ? { itemsById: nextItemsById } : {};
    }),
}));

export function useBoardItems(): BoardItemFull[] {
  const itemsById = useBoardStore((s) => s.itemsById);
  const itemOrder = useBoardStore((s) => s.itemOrder);
  return useMemo(() => {
    const items: BoardItemFull[] = new Array(itemOrder.length);
    for (let i = 0; i < itemOrder.length; i++) {
      items[i] = itemsById[itemOrder[i]];
    }
    return items;
  }, [itemsById, itemOrder]);
}

export function useBoardItem(id: string | null): BoardItemFull | undefined {
  return useBoardStore((s) => (id ? s.itemsById[id] : undefined));
}

/**
 * Hook that initialises the store with server-side data on first mount or when
 * the workspace changes.
 */
export function useBoard(workspaceId: string, initialItems: BoardItemFull[]) {
  // Subscribe only to the data slices this hook returns. Zustand actions are
  // stable store references, so they are read imperatively via getState()
  // without subscribing — a moveItem no longer re-renders every useBoard
  // consumer (previously useBoardStore() with no selector subscribed to the
  // entire store).
  const storeWorkspaceId = useBoardStore((s) => s.workspaceId);
  const itemsById = useBoardStore((s) => s.itemsById);
  const itemOrder = useBoardStore((s) => s.itemOrder);

  useEffect(() => {
    if (useBoardStore.getState().workspaceId !== workspaceId) {
      const { itemsById, itemOrder } = itemsToRecord(initialItems);
      useBoardStore.setState({ workspaceId, itemsById, itemOrder });
    }
  }, [workspaceId, initialItems]);

  const items = useMemo(() => {
    const out: BoardItemFull[] = new Array(itemOrder.length);
    for (let i = 0; i < itemOrder.length; i++) {
      out[i] = itemsById[itemOrder[i]];
    }
    return out;
  }, [itemsById, itemOrder]);

  // Stable action references — never reassigned after store creation.
  const {
    setItems,
    moveItem,
    addItem,
    removeItem,
    updateBoardItem,
    updateTaskInMilestone,
    removeTaskFromMilestone,
    getAllItems,
    getItem,
  } = useBoardStore.getState();

  // Public API is unchanged: same fields as the previous `...store` spread.
  return {
    setItems,
    moveItem,
    addItem,
    removeItem,
    updateBoardItem,
    updateTaskInMilestone,
    removeTaskFromMilestone,
    getAllItems,
    getItem,
    workspaceId: storeWorkspaceId,
    itemsById,
    itemOrder,
    items: storeWorkspaceId === workspaceId && items.length > 0 ? items : initialItems,
  };
}
