/**
 * GitHub Actions workflow_dispatch（移植 vue2 service/github-api.js 的 dispatchWorkflow）。
 * 只保留触发；轮询 runs 的 getWorkflowRuns 没接（前端没有用到它的场景）。
 */
export async function dispatchWorkflow(input: {
  owner: string;
  repo: string;
  workflowId: string;
  branch?: string;
  token: string;
  inputs?: Record<string, string | number | boolean>;
}): Promise<{ ok: boolean; error?: string }> {
  const url = `https://api.github.com/repos/${input.owner}/${input.repo}/actions/workflows/${input.workflowId}/dispatches`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${input.token}`,
      accept: 'application/vnd.github.v3+json',
      'x-github-api-version': '2022-11-28',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ ref: input.branch || 'main', inputs: input.inputs ?? {} }),
  });
  if (response.status === 204) {
    return { ok: true };
  }
  return { ok: false, error: `GitHub API ${response.status}: ${(await response.text()).slice(0, 300)}` };
}
