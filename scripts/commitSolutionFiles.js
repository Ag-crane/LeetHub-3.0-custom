/**
 * Get the latest commit SHA of the given branch.
 * @param {string} repo - "owner/repo" 형식의 리포지토리 이름.
 * @param {string} branch - 브랜치 이름 (예: "main" 또는 "master").
 * @param {string} token - GitHub API 토큰.
 * @returns {Promise<string>} 최신 커밋 SHA.
 */
async function getLatestCommitSHA(repo, branch, token) {
	const url = `https://api.github.com/repos/${repo}/git/ref/heads/${branch}`;
	const res = await fetch(url, {
	  headers: { Authorization: `token ${token}` }
	});
	const data = await res.json();
	return data.object.sha;
  }
  
  /**
   * Create a blob for a file.
   * @param {string} repo - 리포지토리 이름.
   * @param {string} content - 파일 내용 (plain text).
   * @param {string} token - GitHub 토큰.
   * @returns {Promise<string>} Blob SHA.
   */
  async function createBlob(repo, content, token) {
	// GitHub는 content가 Base64 인코딩된 문자열을 요구합니다.
	const url = `https://api.github.com/repos/${repo}/git/blobs`;
	const body = JSON.stringify({
	  content: content, // 이미 btoa(unescape(encodeURIComponent(...)))한 문자열이면 그대로 사용
	  encoding: "base64"
	});
	const res = await fetch(url, {
	  method: 'POST',
	  headers: {
		Authorization: `token ${token}`,
		'Content-Type': 'application/json'
	  },
	  body: body
	});
	const data = await res.json();
	return data.sha;
  }
  
  /**
   * Create a new tree with the specified files.
   * @param {string} repo - 리포지토리 이름.
   * @param {string} baseTreeSha - 최신 커밋의 트리 SHA.
   * @param {Array} files - [{ path, mode, type, sha }]
   * @param {string} token - GitHub 토큰.
   * @returns {Promise<string>} 새 트리 SHA.
   */
  async function createTree(repo, baseTreeSha, files, token) {
	const url = `https://api.github.com/repos/${repo}/git/trees`;
	const body = JSON.stringify({
	  base_tree: baseTreeSha,
	  tree: files
	});
	const res = await fetch(url, {
	  method: 'POST',
	  headers: {
		Authorization: `token ${token}`,
		'Content-Type': 'application/json'
	  },
	  body: body
	});
	const data = await res.json();
	return data.sha;
  }
  
  /**
   * Create a commit with the new tree.
   * @param {string} repo - 리포지토리 이름.
   * @param {string} message - 커밋 메시지 (난이도 접두사 포함).
   * @param {string} treeSha - 새 트리 SHA.
   * @param {string} parentSha - 최신 커밋 SHA.
   * @param {string} token - GitHub 토큰.
   * @returns {Promise<string>} 새 커밋 SHA.
   */
  async function createCommit(repo, message, treeSha, parentSha, token) {
	const url = `https://api.github.com/repos/${repo}/git/commits`;
	const body = JSON.stringify({
	  message: message,
	  tree: treeSha,
	  parents: [parentSha]
	});
	const res = await fetch(url, {
	  method: 'POST',
	  headers: {
		Authorization: `token ${token}`,
		'Content-Type': 'application/json'
	  },
	  body: body
	});
	const data = await res.json();
	return data.sha;
  }
  
  /**
   * Update the given branch reference to point to new commit.
   * @param {string} repo - 리포지토리 이름.
   * @param {string} branch - 브랜치 이름.
   * @param {string} newCommitSha - 새 커밋 SHA.
   * @param {string} token - GitHub 토큰.
   * @returns {Promise<void>}
   */
  async function updateRef(repo, branch, newCommitSha, token) {
	const url = `https://api.github.com/repos/${repo}/git/refs/heads/${branch}`;
	const body = JSON.stringify({ sha: newCommitSha });
	await fetch(url, {
	  method: 'PATCH',
	  headers: {
		Authorization: `token ${token}`,
		'Content-Type': 'application/json'
	  },
	  body: body
	});
  }
  
  /**
   * Commit multiple files (e.g. README.md and code file) in one commit.
   * @param {Object} params - 파라미터 객체.
   *   {
   *     repo: "owner/repo", // 리포지토리 이름 (예: "Ag-crane/LeetHub-test")
   *     branch: "main",     // 브랜치 이름
   *     problemName: "0584-find-customer-referee",
   *     directory: "MySQL/LeetHub/Easy/0584-find-customer-referee",
   *     files: [            // 업로드할 파일 목록
   *       { filename: "README.md", content: probStatement },
   *       { filename: finalFileName, content: code }
   *     ],
   *     difficulty: "Easy",
   *     commitMsg: "Organize solution files"
   *   }
   */
async function commitSolutionFiles(params) {
	const { repo, branch, problemName, directory, files, difficulty, commitMsg } = params;
	// GitHub 토큰은 chrome.storage.local에서 가져오거나, 이미 전달된 값 사용
	const token = await chrome.storage.local.get('leethub_token').then(data => data.leethub_token);
	if (!token) throw new Error('leethub token is undefined');

	// 1. 최신 커밋 SHA 조회
	const latestCommitSha = await getLatestCommitSHA(repo, branch, token);

	// 2. 새 blob을 생성하여 각 파일의 blob SHA를 가져오기
	const fileEntries = [];
	for (const file of files) {
		// 파일 경로: directory + "/" + filename
		const filePath = `${directory}/${file.filename}`;
		// 파일 내용은 이미 Base64 인코딩 된 값이 아니면 인코딩 필요
		// 여기서는 기존 코드와 동일하게, content는 plain text로 받아서 btoa를 사용함
		const encodedContent = btoa(unescape(encodeURIComponent(file.content)));
		const blobSha = await createBlob(repo, encodedContent, token);
		fileEntries.push({
		path: filePath,
		mode: "100644",
		type: "blob",
		sha: blobSha
		});
	}

	// 3. 최신 커밋의 트리 SHA를 가져오기
	const commitUrl = `https://api.github.com/repos/${repo}/git/commits/${latestCommitSha}`;
	const commitRes = await fetch(commitUrl, {
		headers: { Authorization: `token ${token}` }
	});
	const commitData = await commitRes.json();
	const baseTreeSha = commitData.tree.sha;

	// 4. 새 트리 생성
	const newTreeSha = await createTree(repo, baseTreeSha, fileEntries, token);

	// 5. 새 커밋 생성
	const newCommitSha = await createCommit(repo, commitMsg, newTreeSha, latestCommitSha, token);

	// 6. 브랜치 업데이트
	await updateRef(repo, branch, newCommitSha, token);

	// 선택적으로 stats 업데이트 (기존 코드와 유사하게)
	let stats = await getAndInitializeStats(problemName);
	// 여기에 새 커밋 SHA를 stats에 저장하는 등 원하는 처리를 할 수 있음
	stats.lastCommitSha = newCommitSha;
	await chrome.storage.local.set({ stats });

	return newCommitSha;
}
