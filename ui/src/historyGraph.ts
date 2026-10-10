export type Lane = string | null;

export interface GraphRow {
  column: number;
  before: Lane[];
  after: Lane[];
  parentColumns: number[];
  width: number;
}

export function historyGraph(commits: ReadonlyArray<{ id: string; parentIds: string[] }>): GraphRow[] {
  let lanes: Lane[] = [];
  return commits.map((commit) => {
    const before = lanes.slice();
    let column = lanes.indexOf(commit.id);
    if (column < 0) column = freeLane(lanes);
    lanes = lanes.map((lane) => (lane === commit.id ? null : lane));
    const [first, ...rest] = commit.parentIds;
    if (first !== undefined && !lanes.includes(first)) lanes[column] = first;
    for (const parent of rest) {
      if (!lanes.includes(parent)) lanes[freeLane(lanes)] = parent;
    }
    while (lanes.length > 0 && lanes[lanes.length - 1] === null) lanes.pop();
    const after = lanes.slice();
    return {
      column,
      before,
      after,
      parentColumns: commit.parentIds.map((parent) => after.indexOf(parent)).filter((index) => index >= 0),
      width: Math.max(before.length, after.length, column + 1),
    };
  });
}

function freeLane(lanes: Lane[]): number {
  const index = lanes.indexOf(null);
  return index < 0 ? lanes.length : index;
}
