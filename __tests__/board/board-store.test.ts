import { describe, it, expect, beforeEach } from "vitest";
import { useBoardStore } from "@/store/board-store";
import type { BoardItemFull } from "@/types/board";

describe("useBoardStore - Perceived Latency Optimizations", () => {
  beforeEach(() => {
    useBoardStore.setState({
      workspaceId: "ws-1",
      itemsById: {},
      itemOrder: [],
    });
  });

  it("should optimistically add an item with instant O(1) storage", () => {
    const tempItem: BoardItemFull = {
      id: "temp-123",
      workspaceId: "ws-1",
      x: 100,
      y: 150,
      width: 220,
      height: 130,
      entityType: "note",
      color: null,
      label: "Instant Idea",
      linkedGoalId: null,
      linkedMilestoneId: null,
      linkedTaskId: null,
      linkedGoal: null,
      linkedMilestone: null,
    };

    useBoardStore.getState().addItem(tempItem);

    expect(useBoardStore.getState().getItem("temp-123")).toEqual(tempItem);
    expect(useBoardStore.getState().getAllItems()).toHaveLength(1);
    expect(useBoardStore.getState().getAllItems()[0].label).toBe("Instant Idea");
  });

  it("should reconcile an optimistic item with the server item via replaceItemId", () => {
    const tempItem: BoardItemFull = {
      id: "temp-456",
      workspaceId: "ws-1",
      x: 80,
      y: 80,
      width: 220,
      height: 130,
      entityType: "goal",
      color: null,
      label: null,
      linkedGoalId: "goal-1",
      linkedMilestoneId: null,
      linkedTaskId: null,
      linkedGoal: null,
      linkedMilestone: null,
    };

    useBoardStore.getState().addItem(tempItem);

    const realServerItem: BoardItemFull = {
      ...tempItem,
      id: "real-server-id-789",
    };

    useBoardStore.getState().replaceItemId("temp-456", realServerItem);

    // Old temporary ID should be gone
    expect(useBoardStore.getState().getItem("temp-456")).toBeUndefined();

    // Real server ID should be present in both itemsById and itemOrder
    expect(useBoardStore.getState().getItem("real-server-id-789")).toEqual(realServerItem);
    expect(useBoardStore.getState().itemOrder).toEqual(["real-server-id-789"]);
    expect(useBoardStore.getState().getAllItems()).toHaveLength(1);
  });

  it("should roll back an optimistic item on failure via removeItem", () => {
    const tempItem: BoardItemFull = {
      id: "temp-fail-1",
      workspaceId: "ws-1",
      x: 200,
      y: 200,
      width: 180,
      height: 100,
      entityType: "note",
      color: null,
      label: "Failing Card",
      linkedGoalId: null,
      linkedMilestoneId: null,
      linkedTaskId: null,
      linkedGoal: null,
      linkedMilestone: null,
    };

    useBoardStore.getState().addItem(tempItem);
    expect(useBoardStore.getState().getAllItems()).toHaveLength(1);

    useBoardStore.getState().removeItem("temp-fail-1");
    expect(useBoardStore.getState().getAllItems()).toHaveLength(0);
    expect(useBoardStore.getState().getItem("temp-fail-1")).toBeUndefined();
  });
});
