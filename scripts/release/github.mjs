export function githubClient(token = process.env.GH_TOKEN) {
  return async (route, options = {}) => {
    const response = await fetch('https://api.github.com/repos/dirtyredz/Sanas' + route, {
      ...options,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: 'Bearer ' + token,
        'X-GitHub-Api-Version': '2022-11-28',
        ...options.headers,
      },
    })
    if (options.allow404 && response.status === 404) return null
    if (!response.ok) throw new Error('GitHub request failed: ' + response.status)
    return response.status === 204 ? null : response.json()
  }
}
