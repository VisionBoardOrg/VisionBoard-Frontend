"use client";

import { generateConnectorPath } from "@/lib/gantt-engine";

export interface MilestonePosition {
  id: string;
  left: number;
  width: number;
  top: number;
  height: number;
  isMilestone: boolean;
}

interface GanttDependencyLayerProps {
  positions: Map<string, MilestonePosition>;
  dependencies: Array<{ predecessorId: string; successorId: string }>;
  criticalPairs: Set<string>; // "predId->succId"
  highlightCriticalPath: boolean;
  totalWidth: number;
  totalHeight: number;
  onSelectDependency?: (predecessorId: string, successorId: string) => void;
}

export function GanttDependencyLayer({
  positions,
  dependencies,
  criticalPairs,
  highlightCriticalPath,
  totalWidth,
  totalHeight,
  onSelectDependency,
}: GanttDependencyLayerProps) {
  if (dependencies.length === 0) return null;

  return (
    <svg
      className="absolute top-0 left-0 pointer-events-none z-10"
      style={{ width: totalWidth, height: totalHeight }}
    >
      <defs>
        {/* Standard Arrow Marker */}
        <marker
          id="arrow-default"
          viewBox="0 0 10 10"
          refX="6"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 1 L 8 5 L 0 9 z" fill="#94A3B8" />
        </marker>

        {/* Critical Path Arrow Marker */}
        <marker
          id="arrow-critical"
          viewBox="0 0 10 10"
          refX="6"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M 0 1 L 8 5 L 0 9 z" fill="#EF4444" />
        </marker>

        {/* Active / Hover Arrow Marker */}
        <marker
          id="arrow-active"
          viewBox="0 0 10 10"
          refX="6"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 1 L 8 5 L 0 9 z" fill="#2563EB" />
        </marker>
      </defs>

      {dependencies.map(({ predecessorId, successorId }) => {
        const src = positions.get(predecessorId);
        const tgt = positions.get(successorId);
        if (!src || !tgt) return null;

        const isCritical =
          highlightCriticalPath && criticalPairs.has(`${predecessorId}->${successorId}`);

        // Source is the right middle of predecessor bar
        const srcPt = {
          x: src.left + src.width,
          y: src.top + src.height / 2,
        };

        // Target is the left middle of successor bar
        const tgtPt = {
          x: tgt.left,
          y: tgt.top + tgt.height / 2,
        };

        const pathD = generateConnectorPath(srcPt, tgtPt);
        const strokeColor = isCritical ? "#EF4444" : "#94A3B8";
        const strokeWidth = isCritical ? 2.5 : 1.5;
        const markerEnd = isCritical ? "url(#arrow-critical)" : "url(#arrow-default)";

        return (
          <g
            key={`${predecessorId}->${successorId}`}
            className="transition-all duration-200 pointer-events-auto cursor-pointer group"
            onClick={() => onSelectDependency?.(predecessorId, successorId)}
          >
            {/* Wider transparent stroke for easier hover & clicking */}
            <path
              d={pathD}
              fill="none"
              stroke="transparent"
              strokeWidth={12}
              className="cursor-pointer"
            />
            {/* Visual connector line */}
            <path
              d={pathD}
              fill="none"
              stroke={strokeColor}
              strokeWidth={strokeWidth}
              strokeDasharray={isCritical ? "4 2" : undefined}
              markerEnd={markerEnd}
              className={`group-hover:stroke-blue transition-colors ${
                isCritical ? "drop-shadow-[0_0_4px_rgba(239,68,68,0.4)]" : ""
              }`}
            />
          </g>
        );
      })}
    </svg>
  );
}
