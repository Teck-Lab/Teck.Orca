export type Snapshot = {
  checkedAt: number | null;
  error: string | null;
  target?: { orca: string; omp: string };
  managedTarget?: string;
  updates?: Record<string, { state: string; message: string; at: number }>;
  settings: { refreshSeconds: number; runtimeDetails: boolean; showStatusBar: boolean; autoOpenOffice?: boolean };
  activityError?: string | null;
  activity: { id: string; parentId?: string; kind: string; workspace: string; sandbox: string;
    terminalId: string | null; title: string | null; agent: string | null; state: string; stateStartedAt: number | null;
    tool?: string | null; updatedAt?: number | null; issue?: string | null; issueSource?: string | null }[];
  launch: { kind: string; at: number; terminalId: string | null } | null;
  projects: {
    projectId: string; name: string; id: string; title: string; state: string;
    cpus: number | null; memory: string | null; error: string | null;
    runtime: {
      connection: string; daemon: string | null; omp: string | null;
      disk: { available: number; total: number } | null;
      dockerDisk?: { available: number; total: number } | null;
      ompProcesses?: number | null;
      managedDigest?: string | null;
      kubernetes: { name: string; phase: string; readiness: string; nodes: number | null; ready: number | null } | null;
    } | null;
  }[];
};
declare module 'orca' {
  interface PluginRequests {
    'sandbox.status': { input: undefined; output: Snapshot };
    'sandbox.update': { input: { projectId: string; sandboxId: string }; output: { accepted: boolean } };
    'sandbox.office': { input: { projectId: string; sandboxId: string }; output: { opened: boolean } };
  }
  interface PluginPanelEvents { 'sandbox.changed': Snapshot }
}
