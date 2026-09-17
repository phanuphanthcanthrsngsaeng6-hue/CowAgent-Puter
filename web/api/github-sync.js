const ALLOWED_FILES = new Set([
  "web/sandbox-preview.html",
  "web/sandbox-preview.css",
  "web/sandbox-preview.js"
]);

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return json(res, 405, { error: "ใช้ POST เท่านั้น" });

  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_OWNER || "phanuphanthcanthrsngsaeng6-hue";
  const repo = process.env.GITHUB_REPO || "CowAgent-Puter";
  const branch = process.env.GITHUB_BRANCH || "our-core";
  if (!token) return json(res, 500, { error: "ยังไม่ได้ตั้งค่า GITHUB_TOKEN ใน Vercel Environment Variables" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const files = body.files;
    if (!files || typeof files !== "object") return json(res, 400, { error: "ต้องส่ง files" });
    const entries = Object.entries(files);
    if (!entries.length || entries.length > 3 || entries.some(([path, content]) => !ALLOWED_FILES.has(path) || typeof content !== "string" || content.length > 200000)) return json(res, 400, { error: "ไฟล์ไม่ถูกต้องหรือมีขนาดใหญ่เกินไป" });

    const api = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
    const headers = { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
    const refResponse = await fetch(`${api}/git/ref/heads/${encodeURIComponent(branch)}`, { headers });
    if (!refResponse.ok) throw new Error(`อ่าน branch ไม่สำเร็จ (${refResponse.status})`);
    const ref = await refResponse.json();
    const baseCommitResponse = await fetch(`${api}/git/commits/${ref.object.sha}`, { headers });
    if (!baseCommitResponse.ok) throw new Error("อ่าน commit ล่าสุดไม่สำเร็จ");
    const baseCommit = await baseCommitResponse.json();

    const blobShas = await Promise.all(entries.map(async ([, content]) => {
      const response = await fetch(`${api}/git/blobs`, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ content, encoding: "utf-8" }) });
      if (!response.ok) throw new Error("สร้างไฟล์ Git blob ไม่สำเร็จ");
      return (await response.json()).sha;
    }));

    const treeResponse = await fetch(`${api}/git/trees`, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ base_tree: baseCommit.tree.sha, tree: entries.map(([path], index) => ({ path, mode: "100644", type: "blob", sha: blobShas[index] })) }) });
    if (!treeResponse.ok) throw new Error("สร้าง Git tree ไม่สำเร็จ");
    const tree = await treeResponse.json();
    const commitResponse = await fetch(`${api}/git/commits`, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ message: "Update sandbox preview from CowAgent", tree: tree.sha, parents: [ref.object.sha] }) });
    if (!commitResponse.ok) throw new Error("สร้าง commit ไม่สำเร็จ");
    const commit = await commitResponse.json();
    const updateResponse = await fetch(`${api}/git/refs/heads/${encodeURIComponent(branch)}`, { method: "PATCH", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ sha: commit.sha, force: false }) });
    if (!updateResponse.ok) throw new Error("อัปเดต branch ไม่สำเร็จ");
    return json(res, 200, { ok: true, commit: commit.sha, commitUrl: `https://github.com/${owner}/${repo}/commit/${commit.sha}`, branch, files: entries.map(([path]) => path) });
  } catch (error) {
    return json(res, 500, { error: error.message || "GitHub sync failed" });
  }
};
