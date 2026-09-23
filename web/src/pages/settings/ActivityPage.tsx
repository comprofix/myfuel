import { RunsTable, usePollRuns } from './shared';

export function ActivityPage() {
  const { runs, reload } = usePollRuns(undefined, 100);
  return (
    <>
      <div className="page-head">
        <h1>Activity</h1>
        <button onClick={reload}>Reload</button>
      </div>
      <p className="muted">Scheduled and manual refreshes across all data sources.</p>
      <RunsTable runs={runs} showSource />
    </>
  );
}
