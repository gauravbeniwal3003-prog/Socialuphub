import React, { useState } from 'react';
import { Card, Button, Input, Notification } from '../ui/Components';
import { useAuth } from '../../App';
import { supabase } from '../../services/supabase';
import { 
  Key, Copy, Check, Code, Play, Send, RefreshCw, 
  ExternalLink, HelpCircle, BookOpen, Cpu, ShieldCheck, 
  Lock, AlertCircle, ShoppingCart, List, Wallet, ChevronDown, Download
} from 'lucide-react';
import { CURRENCY_SYMBOL } from '../../constants';
import { useStore, getConfig } from '../../services/mockStore';

export const ApiDocsSection: React.FC = () => {
  const { user } = useAuth();
  const [apiKey, setApiKey] = useState<string>(user?.api_key || '');
  const [isCopied, setIsCopied] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [notification, setNotification] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  // Playground States
  const [activeTab, setActiveTab] = useState<'balance' | 'services' | 'add' | 'status'>('balance');
  const [playgroundService, setPlaygroundService] = useState('11');
  const [playgroundLink, setPlaygroundLink] = useState('https://www.instagram.com/p/your_post');
  const [playgroundQty, setPlaygroundQty] = useState('1000');
  const [playgroundOrderId, setPlaygroundOrderId] = useState('');
  const [playgroundResponse, setPlaygroundResponse] = useState<any>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // Fetch SMM Configurations
  const config = useStore('suh_config', getConfig);
  const apiDiscount = (config as any)?.apiDiscountPercent || 0;

  const getActiveApiBaseUrl = () => {
    const backendBase = (config as any)?.renderBackendUrl?.trim();
    if (backendBase) {
      return `${backendBase.replace(/\/$/, "")}/api/v2`;
    }
    return `https://socialuphub-backend.onrender.com/api/v2`;
  };

  const apiBaseUrl = getActiveApiBaseUrl();

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleGenerateKey = async () => {
    if (!user) return;
    if (apiKey) {
      setNotification({ msg: 'Generation limit reached. For security, your API key cannot be modified or re-generated.', type: 'error' });
      return;
    }
    setIsGenerating(true);
    try {
      const newKey = crypto.randomUUID().replace(/-/g, '');
      const { error } = await supabase
        .from('users')
        .update({ api_key: newKey })
        .eq('id', user.id);

      if (error) {
        throw new Error(error.message || 'Failed to update user key');
      }

      setApiKey(newKey);
      setNotification({ msg: 'API Key generated successfully! It has been locked to your account.', type: 'success' });
    } catch (e: any) {
      console.error(e);
      setNotification({ msg: e.message || 'Failed to generate API Key', type: 'error' });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRunPlaygroundRequest = async () => {
    setIsPlaying(true);
    setPlaygroundResponse(null);

    const bodyParams = new URLSearchParams();
    bodyParams.append('key', apiKey || 'your_api_key_here');
    bodyParams.append('action', activeTab);

    if (activeTab === 'add') {
      bodyParams.append('service', playgroundService);
      bodyParams.append('link', playgroundLink);
      bodyParams.append('quantity', playgroundQty);
    } else if (activeTab === 'status') {
      bodyParams.append('order', playgroundOrderId);
    }

    try {
      // Fix: Use standard application/x-www-form-urlencoded to avoid OPTIONS preflight issues and parse correctly
      const res = await fetch(apiBaseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: bodyParams.toString()
      });
      const data = await res.json();
      setPlaygroundResponse(data);
      if (activeTab === 'add' && data.order) {
        setPlaygroundOrderId(data.order);
      }
    } catch (err: any) {
      setPlaygroundResponse({ error: 'Network Error', message: err.message });
    } finally {
      setIsPlaying(false);
    }
  };

  const handleDownloadDocs = () => {
    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Social Up Hub - API v2 Documentation</title>
  <style>
    :root {
      --primary: #22c55e;
      --primary-hover: #16a34a;
      --bg: #09090b;
      --card-bg: #18181b;
      --border: #27272a;
      --text: #fafafa;
      --text-muted: #a1a1aa;
      --code-bg: #09090b;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background-color: var(--bg);
      color: var(--text);
      line-height: 1.6;
      margin: 0;
      padding: 0;
    }
    .container {
      max-width: 1000px;
      margin: 0 auto;
      padding: 40px 20px;
    }
    header {
      border-bottom: 1px solid var(--border);
      padding-bottom: 24px;
      margin-bottom: 40px;
    }
    h1 {
      font-size: 2.5rem;
      font-weight: 800;
      margin: 0 0 10px 0;
      letter-spacing: -0.05em;
    }
    h2 {
      font-size: 1.5rem;
      font-weight: 700;
      border-bottom: 1px solid var(--border);
      padding-bottom: 8px;
      margin-top: 40px;
      color: var(--text);
    }
    h3 {
      font-size: 1.2rem;
      font-weight: 600;
      margin: 24px 0 12px 0;
      color: var(--primary);
    }
    p {
      color: var(--text-muted);
      font-size: 0.95rem;
    }
    .badge {
      display: inline-block;
      padding: 4px 8px;
      border-radius: 6px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .badge-primary {
      background-color: rgba(34, 197, 94, 0.1);
      color: var(--primary);
      border: 1px solid rgba(34, 197, 94, 0.2);
    }
    .badge-method {
      background-color: rgba(34, 197, 94, 0.15);
      color: var(--primary);
      border: 1px solid rgba(34, 197, 94, 0.25);
    }
    .url-box {
      background-color: var(--code-bg);
      border: 1px solid var(--border);
      padding: 12px 16px;
      border-radius: 8px;
      font-family: monospace;
      font-size: 0.9rem;
      margin: 16px 0;
      word-break: break-all;
      color: #38bdf8;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
      font-size: 0.9rem;
    }
    th, td {
      border: 1px solid var(--border);
      padding: 12px;
      text-align: left;
    }
    th {
      background-color: var(--code-bg);
      color: var(--text);
      font-weight: 600;
    }
    tr:nth-child(even) {
      background-color: rgba(255, 255, 255, 0.01);
    }
    .req-param {
      color: #f87171;
      font-weight: 600;
    }
    .opt-param {
      color: var(--text-muted);
    }
    pre {
      background-color: var(--code-bg);
      border: 1px solid var(--border);
      padding: 16px;
      border-radius: 8px;
      overflow-x: auto;
      font-size: 0.85rem;
    }
    code {
      font-family: SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace;
    }
    .grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 20px;
    }
    @media (min-width: 768px) {
      .grid {
        grid-template-columns: 1fr 1fr;
      }
    }
    .section-card {
      background-color: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 24px;
    }
    .discount-banner {
      background-color: rgba(34, 197, 94, 0.08);
      border: 1px solid rgba(34, 197, 94, 0.2);
      border-radius: 8px;
      padding: 16px;
      margin-top: 16px;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .discount-banner strong {
      color: var(--primary);
    }
    ul {
      padding-left: 20px;
      color: var(--text-muted);
    }
    li {
      margin-bottom: 8px;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1 style="color: var(--primary);">Social Up Hub</h1>
      <p style="font-size: 1.1rem; font-weight: 500; color: var(--text);">Developer SMM Integration API Document (v2 Standard)</p>
      <div class="discount-banner">
        <div>
          <strong>🔥 Exclusive SMM API Discount:</strong> Placed orders via direct API calls will receive a <strong>${apiDiscount}% direct discount</strong> on checkout instantly!
        </div>
      </div>
    </header>

    <div class="section-card">
      <h2>General SMM Specifications</h2>
      <p>Our API is built on standard SMM panel integration structures. Any website or control panel utilizing SMM scripts can seamlessly connect and automate order processing.</p>
      
      <h3>HTTP Protocol Details</h3>
      <ul>
        <li><strong>Base Server Endpoint:</strong> <code>${apiBaseUrl}</code></li>
        <li><strong>HTTP Request Method:</strong> <span class="badge badge-method">POST</span></li>
        <li><strong>Content-Type:</strong> <code>application/x-www-form-urlencoded</code></li>
        <li><strong>Response Format:</strong> Always returns strict <code>application/json</code> payloads.</li>
      </ul>
    </div>

    <div class="section-card">
      <h2>API Methods &amp; Actions</h2>
      
      <!-- BALANCE METHOD -->
      <h3>1. Retrieve Fund Balance</h3>
      <p>Query your current available user balance in your account.</p>
      <div class="url-box">POST ${apiBaseUrl}</div>
      <table>
        <thead>
          <tr>
            <th>Parameter</th>
            <th>Type</th>
            <th>Status</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>key</code></td>
            <td>String</td>
            <td><span class="req-param">Required</span></td>
            <td>Your secure account API Developer key.</td>
          </tr>
          <tr>
            <td><code>action</code></td>
            <td>String</td>
            <td><span class="req-param">Required</span></td>
            <td>Value must be <code>"balance"</code>.</td>
          </tr>
        </tbody>
      </table>
      <div class="grid">
        <div>
          <h4>Example Request (curl)</h4>
          <pre><code>curl -X POST ${apiBaseUrl} \\
  -d "key=YOUR_API_KEY" \\
  -d "action=balance"</code></pre>
        </div>
        <div>
          <h4>Example Response</h4>
          <pre><code>{
  "balance": 1827.42,
  "currency": "INR"
}</code></pre>
        </div>
      </div>

      <!-- SERVICES METHOD -->
      <h3>2. Fetch Services Directory</h3>
      <p>Fetch the complete list of system services, active rates, min/max restrictions, and category details.</p>
      <div class="url-box">POST ${apiBaseUrl}</div>
      <table>
        <thead>
          <tr>
            <th>Parameter</th>
            <th>Type</th>
            <th>Status</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>key</code></td>
            <td>String</td>
            <td><span class="req-param">Required</span></td>
            <td>Your secure account API Developer key.</td>
          </tr>
          <tr>
            <td><code>action</code></td>
            <td>String</td>
            <td><span class="req-param">Required</span></td>
            <td>Value must be <code>"services"</code>.</td>
          </tr>
        </tbody>
      </table>
      <div class="grid">
        <div>
          <h4>Example Request (curl)</h4>
          <pre><code>curl -X POST ${apiBaseUrl} \\
  -d "key=YOUR_API_KEY" \\
  -d "action=services"</code></pre>
        </div>
        <div>
          <h4>Example Response</h4>
          <pre><code>[
  {
    "service": "11",
    "name": "Instagram Followers [High Quality]",
    "category": "Instagram Followers",
    "rate": 45.50,
    "min": 100,
    "max": 10000,
    "description": "Premium speed instantly refilled"
  }
]</code></pre>
        </div>
      </div>

      <!-- ADD ORDER METHOD -->
      <h3>3. Create SMM Order</h3>
      <p>Schedules a delivery immediately, deducting order costs after applying any active API discount rates securely.</p>
      <div class="url-box">POST ${apiBaseUrl}</div>
      <table>
        <thead>
          <tr>
            <th>Parameter</th>
            <th>Type</th>
            <th>Status</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>key</code></td>
            <td>String</td>
            <td><span class="req-param">Required</span></td>
            <td>Your secure account API Developer key.</td>
          </tr>
          <tr>
            <td><code>action</code></td>
            <td>String</td>
            <td><span class="req-param">Required</span></td>
            <td>Value must be <code>"add"</code>.</td>
          </tr>
          <tr>
            <td><code>service</code></td>
            <td>Integer</td>
            <td><span class="req-param">Required</span></td>
            <td>The unique Service ID to purchase.</td>
          </tr>
          <tr>
            <td><code>link</code></td>
            <td>String</td>
            <td><span class="req-param">Required</span></td>
            <td>Target user account, post link, or platform URL.</td>
          </tr>
          <tr>
            <td><code>quantity</code></td>
            <td>Integer</td>
            <td><span class="req-param">Required</span></td>
            <td>The amount of followers, views, likes, etc.</td>
          </tr>
        </tbody>
      </table>
      <div class="grid">
        <div>
          <h4>Example Request (curl)</h4>
          <pre><code>curl -X POST ${apiBaseUrl} \\
  -d "key=YOUR_API_KEY" \\
  -d "action=add" \\
  -d "service=11" \\
  -d "link=https://www.instagram.com/profile" \\
  -d "quantity=1000"</code></pre>
        </div>
        <div>
          <h4>Example Response</h4>
          <pre><code>{
  "order": "758d4a96-ee50-4889-8d75-ec94589d985a",
  "status": "Order placed successfully"
}</code></pre>
        </div>
      </div>

      <!-- STATUS CHECK METHOD -->
      <h3>4. Retrieve Order Status</h3>
      <p>Query delivery progress status, completion parameters, start counts, and remaining balances.</p>
      <div class="url-box">POST ${apiBaseUrl}</div>
      <table>
        <thead>
          <tr>
            <th>Parameter</th>
            <th>Type</th>
            <th>Status</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>key</code></td>
            <td>String</td>
            <td><span class="req-param">Required</span></td>
            <td>Your secure account API Developer key.</td>
          </tr>
          <tr>
            <td><code>action</code></td>
            <td>String</td>
            <td><span class="req-param">Required</span></td>
            <td>Value must be <code>"status"</code>.</td>
          </tr>
          <tr>
            <td><code>order</code></td>
            <td>String</td>
            <td><span class="req-param">Required</span></td>
            <td>The unique order UUID returned during creation.</td>
          </tr>
        </tbody>
      </table>
      <div class="grid">
        <div>
          <h4>Example Request (curl)</h4>
          <pre><code>curl -X POST ${apiBaseUrl} \\
  -d "key=YOUR_API_KEY" \\
  -d "action=status" \\
  -d "order=758d4a96-ee50-4889-8d75-ec94589d985a"</code></pre>
        </div>
        <div>
          <h4>Example Response</h4>
          <pre><code>{
  "status": "In progress",
  "start_count": 124,
  "remains": 450,
  "charge": 45.42,
  "currency": "INR"
}</code></pre>
        </div>
      </div>
    </div>

    <div class="section-card">
      <h2>Advanced Implementation Snippets</h2>
      
      <h3>Python Integration (Requests)</h3>
      <pre><code>import requests

url = "${apiBaseUrl}"
payload = {
    "key": "YOUR_API_KEY",
    "action": "balance"
}

response = requests.post(url, data=payload)
print(response.json())</code></pre>

      <h3>PHP Integration (curl)</h3>
      <pre><code>&lt;?php
$url = "${apiBaseUrl}";
$key = "YOUR_API_KEY";

$post_data = array(
    'key' => $key,
    'action' => 'balance'
);

$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $url);
curl_setopt($ch, CURLOPT_POST, 1);
curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($post_data));
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);

$response = curl_exec($ch);
curl_close($ch);

echo $response;
?&gt;</code></pre>

      <h3>JavaScript (Node.js Fetch)</h3>
      <pre><code>const url = "${apiBaseUrl}";
const params = new URLSearchParams({
  key: "YOUR_API_KEY",
  action: "balance"
});

fetch(url, {
  method: "POST",
  headers: {
    "Content-Type": "application/x-www-form-urlencoded"
  },
  body: params.toString()
})
.then(res => res.json())
.then(data => console.log(data))
.catch(err => console.error(err));</code></pre>
    </div>

    <footer style="text-align: center; margin-top: 40px; border-top: 1px solid var(--border); padding-top: 20px; color: var(--text-muted); font-size: 0.8rem;">
      &copy; 2026 Social Up Hub. All rights reserved. Secure SMM API Systems.
    </footer>
  </div>
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'SocialUpHub_SMM_API_Documentation.html');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    setNotification({ msg: 'Offline API Guides and Code Examples downloaded successfully!', type: 'success' });
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {notification && (
        <Notification
          msg={notification.msg}
          type={notification.type}
          onClose={() => setNotification(null)}
        />
      )}

      {/* API Discount Promotional Banner */}
      <div className="p-5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-500 shrink-0">
            <ShoppingCart size={22} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[var(--app-text)]">
              API Automated Discount Active!
            </h3>
            <p className="text-[var(--app-text-muted)] text-xs mt-0.5">
              Every automated order placed using our direct API receives an exclusive discount automatically.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-extrabold rounded-xl text-lg shrink-0 border border-emerald-500/30">
          <span>{apiDiscount}% Direct Discount</span>
        </div>
      </div>

      {/* API Key Manager Card */}
      <Card className="p-6 md:p-8 bg-[var(--app-card-bg)] border border-[var(--app-border)] rounded-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-[var(--app-accent)]/5 rounded-full blur-3xl z-0"></div>
        <div className="relative z-10 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[var(--app-border)] pb-5">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-[var(--app-accent)]/10 text-[var(--app-accent)]">
                <Key size={24} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-[var(--app-text)]">Your Developer API Credentials</h2>
                <p className="text-[var(--app-text-muted)] text-xs mt-1">Integrate our SMM services into your website easily.</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                id="download-offline-docs-btn"
                onClick={handleDownloadDocs}
                variant="outline"
                className="inline-flex items-center gap-1.5 text-xs py-2 px-3 border border-[var(--app-border)] bg-[var(--app-bg)] text-[var(--app-text)] hover:bg-[var(--app-border)] rounded-xl font-bold font-sans cursor-pointer shrink-0"
              >
                <Download size={14} />
                <span>Download HTML Docs</span>
              </Button>
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                <ShieldCheck size={12} /> Active / Secure
              </span>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-[var(--app-text)]">API Key Selection</h3>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <input
                  type={showKey ? 'text' : 'password'}
                  id="user-api-key"
                  readOnly
                  value={apiKey || 'No API Key generated yet'}
                  className="w-full bg-[var(--app-bg)] border border-[var(--app-border)] rounded-xl px-4 py-3.5 pr-12 text-sm font-mono text-[var(--app-text)] focus:outline-none focus:border-[var(--app-accent)]/50"
                />
                <button
                  id="api-key-toggle-view"
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--app-text-muted)] hover:text-[var(--app-text)] text-xs font-bold uppercase tracking-wider font-sans bg-transparent border-none outline-none cursor-pointer"
                >
                  {showKey ? 'Hide' : 'Show'}
                </button>
              </div>

              <div className="flex gap-2">
                <Button
                  id="copy-api-key-button"
                  onClick={() => copyToClipboard(apiKey)}
                  disabled={!apiKey}
                  variant="outline"
                  className="px-5 rounded-xl border-[var(--app-border)] bg-[var(--app-bg)] text-[var(--app-text)] hover:bg-[var(--app-border)] flex items-center justify-center gap-1.5"
                >
                  {isCopied ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
                  <span>{isCopied ? 'Copied' : 'Copy'}</span>
                </Button>

                {!apiKey ? (
                  <Button
                    id="generate-api-key-button"
                    onClick={handleGenerateKey}
                    disabled={isGenerating}
                    className="bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] text-white px-5 rounded-xl font-bold flex items-center gap-1.5 animate-pulse"
                  >
                    <Key size={16} className={`${isGenerating ? 'animate-spin' : ''}`} />
                    <span>{isGenerating ? 'Generating...' : 'Generate API Key'}</span>
                  </Button>
                ) : (
                  <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-505/10 border border-emerald-500/15 px-4 rounded-xl font-medium">
                    <ShieldCheck size={14} />
                    <span>Key Locked</span>
                  </div>
                )}
              </div>
            </div>
            {!apiKey && (
              <div className="flex items-center gap-2 text-xs text-yellow-600 bg-yellow-500/10 border border-yellow-500/20 p-3 rounded-xl">
                <AlertCircle size={16} className="shrink-0" />
                <span>You do not have an API key yet. Please generate one to start integrating!</span>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* SMM API Interactive Playground / Tester */}
      <Card className="p-6 md:p-8 bg-[var(--app-card-bg)] border border-[var(--app-border)] rounded-2xl">
        <div className="space-y-6">
          <div className="flex items-center justify-between border-b border-[var(--app-border)] pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-orange-500/10 text-orange-500 dark:text-orange-400 shrink-0">
                <Play size={20} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-[var(--app-text)]">Live API System Tester</h3>
                <p className="text-[var(--app-text-muted)] text-xs mt-0.5">Test real API requests directly from your browser container safely.</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Input Selection Controls */}
            <div className="lg:col-span-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-[var(--app-text-muted)] uppercase tracking-wider mb-2">API Method / Action</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'balance', label: 'Check Balance' },
                    { id: 'services', label: 'Get Services' },
                    { id: 'add', label: 'Place Order' },
                    { id: 'status', label: 'Check Status' }
                  ].map((act) => (
                    <button
                      key={act.id}
                      onClick={() => {
                        setActiveTab(act.id as any);
                        setPlaygroundResponse(null);
                      }}
                      className={`px-3 py-2.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                        activeTab === act.id 
                          ? 'bg-[var(--app-accent)]/10 border-[var(--app-accent)] text-[var(--app-accent)] font-bold' 
                          : 'bg-[var(--app-bg)] border-[var(--app-border)] text-[var(--app-text-muted)] hover:text-[var(--app-text)] hover:border-[var(--app-border)]'
                      }`}
                    >
                      {act.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Dynamic Action Fields */}
              {activeTab === 'add' && (
                <div className="space-y-3 animate-in fade-in duration-150">
                  <div>
                    <label className="block text-xs font-bold text-[var(--app-text-muted)] mb-1">Service ID</label>
                    <Input
                      id="playground-service-id"
                      value={playgroundService}
                      onChange={(e) => setPlaygroundService(e.target.value)}
                      placeholder="e.g. 11"
                      className="bg-[var(--app-bg)] border-[var(--app-border)] text-[var(--app-text)] fill-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[var(--app-text-muted)] mb-1">Target Order Link</label>
                    <Input
                      id="playground-order-link"
                      value={playgroundLink}
                      onChange={(e) => setPlaygroundLink(e.target.value)}
                      placeholder="e.g. Instagram link"
                      className="bg-[var(--app-bg)] border-[var(--app-border)] text-[var(--app-text)] fill-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[var(--app-text-muted)] mb-1">Quantity</label>
                    <Input
                      id="playground-order-qty"
                      type="number"
                      value={playgroundQty}
                      onChange={(e) => setPlaygroundQty(e.target.value)}
                      placeholder="e.g. 1000"
                      className="bg-[var(--app-bg)] border-[var(--app-border)] text-[var(--app-text)] fill-transparent"
                    />
                  </div>
                </div>
              )}

              {activeTab === 'status' && (
                <div className="space-y-2 animate-in fade-in duration-150">
                  <label className="block text-xs font-bold text-[var(--app-text-muted)] mb-1">Order ID</label>
                  <Input
                    id="playground-order-status-id"
                    value={playgroundOrderId}
                    onChange={(e) => setPlaygroundOrderId(e.target.value)}
                    placeholder="Enter order UUID/ID"
                    className="bg-[var(--app-bg)] border-[var(--app-border)] text-[var(--app-text)] fill-transparent"
                  />
                </div>
              )}

              <Button
                id="send-api-test-request-button"
                onClick={handleRunPlaygroundRequest}
                disabled={isPlaying || !apiKey}
                className="w-full bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] text-white flex items-center justify-center gap-2 border-0 py-3 rounded-xl font-bold cursor-pointer disabled:opacity-50"
              >
                <Send size={15} className={isPlaying ? 'animate-pulse' : ''} />
                <span>{isPlaying ? 'Querying REST Server...' : 'Send API Test Request'}</span>
              </Button>
            </div>

            {/* Response Area Block */}
            <div className="lg:col-span-7 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-[var(--app-text-muted)] uppercase tracking-wider">Live Response Log</span>
                  <span className="text-[10px] font-mono text-[var(--app-text-muted)]">POST {apiBaseUrl}</span>
                </div>
                <div className="bg-[var(--app-bg)] border border-[var(--app-border)] p-4 rounded-xl font-mono text-xs max-h-[300px] overflow-auto custom-scrollbar min-h-[220px]">
                  {playgroundResponse ? (
                    <pre className="text-emerald-600 dark:text-emerald-400 whitespace-pre-wrap">{JSON.stringify(playgroundResponse, null, 2)}</pre>
                  ) : (
                    <div className="text-[var(--app-text-muted)] flex flex-col items-center justify-center h-[180px] text-center gap-1">
                      <Code size={24} className="text-[var(--app-border)] mb-1" />
                      <span>Configure your parameters and click "Send API Test Request"</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Structured API Documentation Details */}
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-[var(--app-accent)]/10 text-[var(--app-accent)]">
            <BookOpen size={20} />
          </div>
          <h3 className="text-lg font-bold text-[var(--app-text)]">Integration Documentation & Guides</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-[var(--app-card-bg)] border border-[var(--app-border)] p-5 rounded-2xl space-y-2">
            <h4 className="text-sm font-bold text-[var(--app-text)] flex items-center gap-1.5">
              <Cpu size={16} className="text-[var(--app-accent)]" /> Base SMM API Endpoint
            </h4>
            <p className="text-xs text-[var(--app-text-muted)] leading-relaxed">
              Use this standard URL inside SMM panel scripts or admin panel:
            </p>
            <div className="bg-[var(--app-bg)] border border-[var(--app-border)] rounded-xl p-3 flex justify-between items-center overflow-hidden">
              <span className="text-xs font-mono text-[var(--app-text)] truncate select-all mr-2">{apiBaseUrl}</span>
              <button onClick={() => copyToClipboard(apiBaseUrl)} className="text-[var(--app-accent)] hover:underline text-xs shrink-0 pl-1 font-bold bg-transparent border-0 outline-none cursor-pointer">Copy</button>
            </div>
          </div>

          <div className="bg-[var(--app-card-bg)] border border-[var(--app-border)] p-5 rounded-2xl flex flex-col justify-center space-y-2">
            <h4 className="text-sm font-bold text-[var(--app-text)] flex items-center gap-1.5">
              <HelpCircle size={16} className="text-orange-500" /> Content Specifications
            </h4>
            <p className="text-xs text-[var(--app-text-muted)] leading-relaxed">
              Acceptance Format: Supports clean standard <code className="text-[var(--app-accent)] bg-[var(--app-bg)] border border-[var(--app-border)] px-1.5 py-0.5 rounded font-mono">application/x-www-form-urlencoded</code> POST parameters. Response is always JSON.
            </p>
          </div>
        </div>

        {/* Complete Final Request Examples Card */}
        <div className="bg-[var(--app-card-bg)] border border-[var(--app-border)] p-6 rounded-2xl space-y-4">
          <h4 className="text-sm font-bold text-[var(--app-text)] flex items-center gap-1.5">
            <ShieldCheck size={16} className="text-emerald-500" /> Complete Final Request Examples with Your API Key
          </h4>
          <p className="text-xs text-[var(--app-text-muted)] leading-relaxed font-sans">
            Standard scripts (like PerfectPanel, SmartPanel) or simple HTTP clients can consume the endpoints directly. Because SMM endpoints accept both query strings and POST form-encoded data, we provide fully configured, live final URLs below for immediate testing:
          </p>
          <div className="space-y-3">
            <div>
              <span className="text-[10px] font-bold text-[var(--app-text-muted)] uppercase tracking-wider block mb-1">1. Check Balance Request URL</span>
              <div className="bg-[var(--app-bg)] border border-[var(--app-border)] rounded-xl p-3 flex justify-between items-center overflow-hidden font-mono text-xs">
                <span className="text-[var(--app-text)] truncate select-all mr-2">{apiBaseUrl}?key={apiKey || "YOUR_API_KEY"}&action=balance</span>
                <button onClick={() => copyToClipboard(`${apiBaseUrl}?key=${apiKey || "YOUR_API_KEY"}&action=balance`)} className="text-[var(--app-accent)] hover:underline shrink-0 pl-1 font-bold bg-transparent border-0 outline-none cursor-pointer">Copy</button>
              </div>
            </div>
            <div>
              <span className="text-[10px] font-bold text-[var(--app-text-muted)] uppercase tracking-wider block mb-1">2. Get Active Services URL</span>
              <div className="bg-[var(--app-bg)] border border-[var(--app-border)] rounded-xl p-3 flex justify-between items-center overflow-hidden font-mono text-xs">
                <span className="text-[var(--app-text)] truncate select-all mr-2">{apiBaseUrl}?key={apiKey || "YOUR_API_KEY"}&action=services</span>
                <button onClick={() => copyToClipboard(`${apiBaseUrl}?key=${apiKey || "YOUR_API_KEY"}&action=services`)} className="text-[var(--app-accent)] hover:underline shrink-0 pl-1 font-bold bg-transparent border-0 outline-none cursor-pointer">Copy</button>
              </div>
            </div>
            <div>
              <span className="text-[10px] font-bold text-[var(--app-text-muted)] uppercase tracking-wider block mb-1">3. Create Order - URL Parameter Format</span>
              <div className="bg-[var(--app-bg)] border border-[var(--app-border)] rounded-xl p-3 flex justify-between items-center overflow-hidden font-mono text-xs">
                <span className="text-[var(--app-text)] truncate select-all mr-2">{apiBaseUrl}?key={apiKey || "YOUR_API_KEY"}&action=add&service=101&link=YOUR_LINK&quantity=100</span>
                <button onClick={() => copyToClipboard(`${apiBaseUrl}?key=${apiKey || "YOUR_API_KEY"}&action=add&service=101&link=YOUR_LINK&quantity=100`)} className="text-[var(--app-accent)] hover:underline shrink-0 pl-1 font-bold bg-transparent border-0 outline-none cursor-pointer">Copy</button>
              </div>
            </div>
          </div>
        </div>

        {/* Action Details */}
        <div className="space-y-4">
          {[
            {
              title: "Retrieve Funds Balance",
              action: "balance",
              desc: "Get your account's live fund balance.",
              params: [
                { name: "key", type: "string", req: true, desc: "Your API key." },
                { name: "action", type: "string", req: true, desc: 'Value must be "balance".' }
              ],
              reqSample: `key=${apiKey || 'your_api_key'}\naction=balance`,
              resSample: `{\n  "balance": 1827.42,\n  "currency": "INR"\n}`
            },
            {
              title: "Fetch Services List",
              action: "services",
              desc: "Fetch our complete directory of active services, including updated pricing, custom descriptions, and order parameters.",
              params: [
                { name: "key", type: "string", req: true, desc: "Your API key." },
                { name: "action", type: "string", req: true, desc: 'Value must be "services".' }
              ],
              reqSample: `key=${apiKey || 'your_api_key'}\naction=services`,
              resSample: `[\n  {\n    "service": "11",\n    "name": "Instagram Followers [High Quality]",\n    "category": "Instagram Followers",\n    "rate": 45.50,\n    "min": 100,\n    "max": 10000,\n    "description": "Premium speed instantly refilled"\n  }\n]`
            },
            {
              title: "Create SMM Order",
              action: "add",
              desc: "Deducts order charges securely from your balance and queues SMM delivery immediately.",
              params: [
                { name: "key", type: "string", req: true, desc: "Your API key." },
                { name: "action", type: "string", req: true, desc: 'Value must be "add".' },
                { name: "service", type: "integer", req: true, desc: "ID of the selected service." },
                { name: "link", type: "string", req: true, desc: "Link/URL for the order." },
                { name: "quantity", type: "integer", req: true, desc: "Quantity to order." }
              ],
              reqSample: `key=${apiKey || 'your_api_key'}\naction=add\nservice=11\nlink=https://www.instagram.com/profile\nquantity=1000`,
              resSample: `{\n  "order": "758d4a96-ee50-4889-8d75-ec94589d985a",\n  "status": "Order placed successfully"\n}`
            },
            {
              title: "Get Order Status",
              action: "status",
              desc: "Retrieve live delivery reports, item counts, and status changes for any order.",
              params: [
                { name: "key", type: "string", req: true, desc: "Your API key." },
                { name: "action", type: "string", req: true, desc: 'Value must be "status".' },
                { name: "order", type: "string", req: true, desc: "Unique order ID returned from the add order response." }
              ],
              reqSample: `key=${apiKey || 'your_api_key'}\naction=status\norder=758d4a96-ee50-4889-8d75-ec94589d985a`,
              resSample: `{\n  "status": "In progress",\n  "start_count": 124,\n  "remains": 450,\n  "charge": 45.50,\n  "currency": "INR"\n}`
            },
            {
              title: "Fetch API Order History",
              action: "orders",
              desc: "Fetch recent orders you queued through the API including individual cost deductions.",
              params: [
                { name: "key", type: "string", req: true, desc: "Your API key." },
                { name: "action", type: "string", req: true, desc: 'Value must be "orders".' }
              ],
              reqSample: `key=${apiKey || 'your_api_key'}\naction=orders`,
              resSample: `{\n  "total_orders_placed": 1,\n  "orders": [\n    {\n      "id": "758d4a96-ee50-4889-8d75-ec94589d985a",\n      "service_id": "11",\n      "service_name": "Instagram Followers [High Quality]",\n      "link": "https://www.instagram.com/profile",\n      "charge": 45.50,\n      "quantity": 1000,\n      "status": "In progress",\n      "date": "2026-06-22T13:00:00Z"\n    }\n  ]\n}`
            }
          ].map((item, idx) => (
            <details key={idx} className="group bg-[var(--app-card-bg)] border border-[var(--app-border)] rounded-2xl overflow-hidden [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex items-center justify-between p-5 cursor-pointer hover:bg-[var(--app-border)]/30 transition-colors">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className={`text-xs font-mono font-bold px-2.5 py-1 rounded-md uppercase tracking-wider self-start sm:self-center ${
                    item.action === 'add' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' :
                    item.action === 'balance' ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400' : 'bg-orange-500/10 text-orange-600 dark:text-orange-400'
                  }`}>
                    action: {item.action}
                  </div>
                  <h4 className="text-sm font-bold text-[var(--app-text)]">{item.title}</h4>
                </div>
                <ChevronDown size={18} className="text-[var(--app-text-muted)] transition-transform group-open:rotate-180" />
              </summary>
              
              <div className="p-5 border-t border-[var(--app-border)] space-y-4 bg-[var(--app-bg)]/40 text-sm">
                <p className="text-[var(--app-text-muted)] text-xs leading-relaxed">{item.desc}</p>
                
                {/* Parameters table */}
                <div className="space-y-2">
                  <span className="text-xs font-bold text-[var(--app-text)] uppercase tracking-widest font-mono">Parameters</span>
                  <div className="border border-[var(--app-border)] rounded-xl overflow-hidden text-xs">
                    <div className="grid grid-cols-12 bg-[var(--app-bg)] p-2.5 border-b border-[var(--app-border)] font-bold text-[var(--app-text-muted)]">
                      <div className="col-span-3">Parameter</div>
                      <div className="col-span-2 font-sans">Type</div>
                      <div className="col-span-2 font-sans">Required</div>
                      <div className="col-span-5 font-sans">Description</div>
                    </div>
                    {item.params.map((p, pIdx) => (
                      <div key={pIdx} className="grid grid-cols-12 p-3 border-b border-[var(--app-border)] last:border-0 text-[var(--app-text)]">
                        <div className="col-span-3 font-mono font-bold text-[var(--app-accent)]">{p.name}</div>
                        <div className="col-span-2 font-mono text-[var(--app-text-muted)]">{p.type}</div>
                        <div className="col-span-2">{p.req ? <span className="text-red-500 font-semibold font-sans">Yes</span> : <span className="font-sans">No</span>}</div>
                        <div className="col-span-5 text-[var(--app-text-muted)] font-sans">{p.desc}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Example Request & Response */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
                  <div>
                    <span className="text-xs font-bold text-[var(--app-text)] uppercase tracking-widest font-mono block mb-1.5">Example URL Query / Form Data</span>
                    <pre className="bg-[var(--app-bg)] p-3 rounded-xl border border-[var(--app-border)] text-[var(--app-text)] overflow-x-auto select-all">{item.reqSample}</pre>
                  </div>
                  <div>
                    <span className="text-xs font-bold text-[var(--app-text)] uppercase tracking-widest font-mono block mb-1.5">Expected Response JSON</span>
                    <pre className="bg-[var(--app-bg)] p-3 rounded-xl border border-[var(--app-border)] text-emerald-600 dark:text-emerald-400 overflow-x-auto select-all">{item.resSample}</pre>
                  </div>
                </div>
              </div>
            </details>
          ))}
        </div>
      </div>
    </div>
  );
};
