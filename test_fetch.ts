import axios from 'axios';

async function test() {
  try {
    console.log("Testing localhost:3000/api/health...");
    const resHealth = await axios.get('http://localhost:3000/api/health');
    console.log("Health status:", resHealth.status);
    console.log("Health response:", resHealth.data);

    console.log("\nTesting localhost:3000/api/sync-user (GET)...");
    const resSyncGet = await axios.get('http://localhost:3000/api/sync-user', { validateStatus: () => true });
    console.log("Sync GET status:", resSyncGet.status);
    console.log("Sync GET content-type:", resSyncGet.headers['content-type']);
    console.log("Sync GET response snippet:", typeof resSyncGet.data === 'string' ? resSyncGet.data.substring(0, 200) : resSyncGet.data);

    console.log("\nTesting localhost:3000/api/sync-user (POST)...");
    const resSyncPost = await axios.post('http://localhost:3000/api/sync-user', {}, { validateStatus: () => true });
    console.log("Sync POST status:", resSyncPost.status);
    console.log("Sync POST content-type:", resSyncPost.headers['content-type']);
    console.log("Sync POST response snippet:", typeof resSyncPost.data === 'string' ? resSyncPost.data.substring(0, 200) : resSyncPost.data);
    console.log("\nTesting localhost:3000/api/sync-user/ (POST with trailing slash)...");
    const resSyncPostSlash = await axios.post('http://localhost:3000/api/sync-user/', {}, { validateStatus: () => true });
    console.log("Sync POST trailing slash status:", resSyncPostSlash.status);
    console.log("Sync POST trailing slash content-type:", resSyncPostSlash.headers['content-type']);
    console.log("Sync POST trailing slash response snippet:", typeof resSyncPostSlash.data === 'string' ? resSyncPostSlash.data.substring(0, 200) : resSyncPostSlash.data);

    console.log("\nFetching live server logs from /api/logs-raw...");
    const resLogs = await axios.get('http://localhost:3000/api/logs-raw', { validateStatus: () => true });
    console.log("Logs status:", resLogs.status);
    console.log("Live Logs (newest first):");
    if (Array.isArray(resLogs.data)) {
      resLogs.data.slice(0, 15).forEach((log: any) => {
        console.log(`[${log.timestamp}] [${log.type}] ${log.message}`);
        if (log.details) console.log("Details:", JSON.stringify(log.details, null, 2));
      });
    } else {
      console.log("No structured logs found or not an array:", resLogs.data);
    }
  } catch (err: any) {
    console.error("Test failed:", err.message);
    if (err.response) {
      console.log("Error status:", err.response.status);
      console.log("Error data:", err.response.data);
    }
  }
}

test();
