import type { GraphLayout } from '../../types'

export const ROW_H = 24
export const LANE_W = 14
export const NODE_R = 4
export const LANE_COLORS = ['#2563eb', '#16a34a', '#db2777', '#d97706', '#7c3aed', '#0891b2']

export function cx(lane: number): number {
  return LANE_W / 2 + lane * LANE_W
}
export function cy(row: number): number {
  return ROW_H / 2 + row * ROW_H
}
export function laneColor(lane: number): string {
  return LANE_COLORS[lane % LANE_COLORS.length]
}
export function graphWidth(g: GraphLayout): number {
  return Math.max(1, g.laneCount) * LANE_W + LANE_W
}
