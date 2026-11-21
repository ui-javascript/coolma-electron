/**
 * GitHub REST API 封装
 * 用于触发 workflow_dispatch 事件
 */

export async function dispatchWorkflow ({ owner, repo, workflowId, branch, token, inputs = {} }) {
  const url = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflowId}/dispatches`
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      ref: branch || 'main',
      inputs
    })
  })

  if (response.status === 204) {
    return { success: true }
  }

  const errorText = await response.text()
  return {
    success: false,
    error: `GitHub API error: ${response.status} ${errorText}`
  }
}

export async function getWorkflowRuns ({ owner, repo, token, workflowId }) {
  const url = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflowId}/runs`
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'X-GitHub-Api-Version': '2022-11-28'
    }
  })

  if (!response.ok) {
    return { success: false, error: `HTTP ${response.status}` }
  }

  const data = await response.json()
  return { success: true, runs: data.workflow_runs }
}
