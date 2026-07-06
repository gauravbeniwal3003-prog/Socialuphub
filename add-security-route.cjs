const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const route = `
  app.post("/api/admin/security-log", verifyAllowedSource, async (req: any, res: any) => {
    console.error("[SECURITY TRACKING ALERT]", req.body);
    res.json({ success: true });
  });
`;

if (!code.includes("/api/admin/security-log")) {
  code = code.replace(
    '  app.post("/api/admin/db-proxy", verifyAllowedSource, verifyAdmin, async (req: any, res: any) => {',
    route + '\n  app.post("/api/admin/db-proxy", verifyAllowedSource, verifyAdmin, async (req: any, res: any) => {'
  );
  fs.writeFileSync('server.ts', code);
}
