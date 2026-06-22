import React, { useState } from 'react';
import { Card, Button, Input, Notification } from '../ui/Components';
import { useAuth } from '../../App';
import { supabase } from '../../services/supabase';
import { 
  Key, Copy, Check, Code, Play, Send, RefreshCw, 
  ExternalLink, HelpCircle, BookOpen, Cpu, ShieldCheck, 
  Lock, AlertCircle, ShoppingCart, List, Wallet, ChevronDown
} from 'lucide-react';
import { CURRENCY_SYMBOL } from '../../constants';

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

  const apiBaseUrl = `${window.location.origin}/api/v2`;

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
        throw error;
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
      const res = await fetch('/api/v2', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/form-data', // will parse correctly via urlencoded parser
          'Content-Type-Custom': 'application/x-www-form-urlencoded'
        },
        body: bodyParams
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

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {notification && (
        <Notification
          msg={notification.msg}
          type={notification.type}
          onClose={() => setNotification(null)}
        />
      )}

      {/* API Key Manager Card */}
      <Card className="p-6 md:p-8 bg-neutral-900 border border-neutral-800/80 rounded-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-[var(--app-accent)]/5 rounded-full blur-3xl z-0"></div>
        <div className="relative z-10 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/5 pb-5">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-[var(--app-accent)]/10 text-[var(--app-accent)]">
                <Key size={24} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Your Developer API Credentials</h2>
                <p className="text-gray-400 text-xs mt-1">Integrate our SMM services into your website easily.</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-semibold bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                <ShieldCheck size={12} /> Active / Secure
              </span>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-300">API Key Selection</h3>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <input
                  type={showKey ? 'text' : 'password'}
                  id="user-api-key"
                  readOnly
                  value={apiKey || 'No API Key generated yet'}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3.5 pr-12 text-sm font-mono text-gray-300 focus:outline-none focus:border-[var(--app-accent)]/50"
                />
                <button
                  id="api-key-toggle-view"
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white text-xs font-bold uppercase tracking-wider font-sans"
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
                  className="px-5 rounded-xl border-neutral-800 bg-neutral-950 text-gray-300 hover:bg-neutral-800 flex items-center justify-center gap-1.5"
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
                  <div className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/15 px-4 rounded-xl font-medium">
                    <ShieldCheck size={14} />
                    <span>Key Locked</span>
                  </div>
                )}
              </div>
            </div>
            {!apiKey && (
              <div className="flex items-center gap-2 text-xs text-yellow-500 bg-yellow-500/10 border border-yellow-500/20 p-3 rounded-xl">
                <AlertCircle size={16} />
                <span>You do not have an API key yet. Please generate one to start integrating!</span>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* SMM API Interactive Playground / Tester */}
      <Card className="p-6 md:p-8 bg-neutral-900 border border-neutral-800/80 rounded-2xl">
        <div className="space-y-6">
          <div className="flex items-center gap-3 border-b border-white/5 pb-4">
            <div className="p-2.5 rounded-xl bg-orange-500/10 text-orange-400">
              <Play size={20} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Live API System Tester</h3>
              <p className="text-gray-400 text-xs mt-0.5">Test real API requests directly from your browser container safely.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Input Selection Controls */}
            <div className="lg:col-span-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">API Method / Action</label>
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
                      className={`px-3 py-2.5 rounded-xl border text-xs font-semibold transition-all ${
                        activeTab === act.id 
                          ? 'bg-[var(--app-accent)]/10 border-[var(--app-accent)] text-[var(--app-accent)]' 
                          : 'bg-neutral-950 border-neutral-800/80 text-gray-400 hover:text-white hover:border-neutral-700'
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
                    <label className="block text-xs font-bold text-gray-400 mb-1">Service ID</label>
                    <Input
                      id="playground-service-id"
                      value={playgroundService}
                      onChange={(e) => setPlaygroundService(e.target.value)}
                      placeholder="e.g. 11"
                      className="bg-neutral-950 border-neutral-800 text-gray-300"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-400 mb-1">Target Order Link</label>
                    <Input
                      id="playground-order-link"
                      value={playgroundLink}
                      onChange={(e) => setPlaygroundLink(e.target.value)}
                      placeholder="e.g. Instagram link"
                      className="bg-neutral-950 border-neutral-800 text-gray-300"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-400 mb-1">Quantity</label>
                    <Input
                      id="playground-order-qty"
                      type="number"
                      value={playgroundQty}
                      onChange={(e) => setPlaygroundQty(e.target.value)}
                      placeholder="e.g. 1000"
                      className="bg-neutral-950 border-neutral-800 text-gray-300"
                    />
                  </div>
                </div>
              )}

              {activeTab === 'status' && (
                <div className="space-y-2 animate-in fade-in duration-150">
                  <label className="block text-xs font-bold text-gray-400 mb-1">Order ID</label>
                  <Input
                    id="playground-order-status-id"
                    value={playgroundOrderId}
                    onChange={(e) => setPlaygroundOrderId(e.target.value)}
                    placeholder="Enter order UUID/ID"
                    className="bg-neutral-950 border-neutral-800 text-gray-300"
                  />
                </div>
              )}

              <Button
                id="send-api-test-request-button"
                onClick={handleRunPlaygroundRequest}
                disabled={isPlaying || !apiKey}
                className="w-full bg-neutral-950 hover:bg-neutral-900 text-gray-100 flex items-center justify-center gap-2 border border-neutral-800 py-3 rounded-xl font-bold"
              >
                <Send size={15} className={isPlaying ? 'animate-pulse' : ''} />
                <span>{isPlaying ? 'Querying REST Server...' : 'Send API Test Request'}</span>
              </Button>
            </div>

            {/* Response Area Block */}
            <div className="lg:col-span-7 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Live Response Log</span>
                  <span className="text-[10px] font-mono text-gray-500">POST {apiBaseUrl}</span>
                </div>
                <div className="bg-neutral-950 border border-neutral-800 p-4 rounded-xl font-mono text-xs max-h-[300px] overflow-auto custom-scrollbar min-h-[160px]">
                  {playgroundResponse ? (
                    <pre className="text-emerald-400 whitespace-pre-wrap">{JSON.stringify(playgroundResponse, null, 2)}</pre>
                  ) : (
                    <div className="text-gray-600 flex flex-col items-center justify-center h-[120px] text-center gap-1">
                      <Code size={24} className="text-neutral-800 mb-1" />
                      <span>Configure your parameters and click "Send Request"</span>
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
          <h3 className="text-lg font-bold text-white">Integration Documentation & Guides</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-neutral-900 border border-neutral-800/80 p-5 rounded-2xl space-y-2">
            <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
              <Cpu size={16} className="text-[var(--app-accent)]" /> Base API Endpoint
            </h4>
            <p className="text-xs text-gray-400 leading-relaxed">
              Use this standard URL inside your SMM client management scripts or admin panel:
            </p>
            <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-3 flex justify-between items-center">
              <span className="text-xs font-mono text-gray-300 truncate select-all">{apiBaseUrl}</span>
              <button onClick={() => copyToClipboard(apiBaseUrl)} className="text-[var(--app-accent)] hover:underline text-xs shrink-0 pl-2">Copy</button>
            </div>
          </div>

          <div className="bg-neutral-900 border border-neutral-800/80 p-5 rounded-2xl space-y-2">
            <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
              <HelpCircle size={16} className="text-orange-400" /> API Specifications
            </h4>
            <p className="text-xs text-gray-400 leading-relaxed font-medium">
              Format: Supports both <code className="text-gray-300 bg-neutral-950 px-1 py-0.5 rounded font-mono">application/x-www-form-urlencoded</code> (form post) and standard JSON. Response is always JSON.
            </p>
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
              resSample: `[\n  {\n    "service": "205",\n    "name": "Instagram Followers [High Quality]",\n    "category": "Instagram Followers",\n    "rate": 45.50,\n    "min": 100,\n    "max": 10000,\n    "description": "Premium speed instantly refilled"\n  }\n]`
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
              reqSample: `key=${apiKey || 'your_api_key'}\naction=add\nservice=205\nlink=https://www.instagram.com/profile\nquantity=1000`,
              resSample: `{\n  "order": "758d4a96-ee50-4889-8d75-ec94589d985a"\n}`
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
              resSample: `{\n  "total_orders_placed": 1,\n  "orders": [\n    {\n      "id": "758d4a96-ee50-4889-8d75-ec94589d985a",\n      "service_id": "205",\n      "service_name": "Instagram Followers [High Quality]",\n      "link": "https://www.instagram.com/profile",\n      "charge": 45.50,\n      "quantity": 1000,\n      "status": "In progress",\n      "date": "2026-06-22T13:00:00Z"\n    }\n  ]\n}`
            }
          ].map((item, idx) => (
            <details key={idx} className="group bg-neutral-900 border border-neutral-800/80 rounded-2xl overflow-hidden [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex items-center justify-between p-5 cursor-pointer hover:bg-neutral-800/30 transition-colors">
                <div className="flex items-center gap-3">
                  <div className={`text-xs font-mono font-bold px-2.5 py-1 rounded-md uppercase tracking-wider ${
                    item.action === 'add' ? 'bg-emerald-500/10 text-emerald-400' :
                    item.action === 'balance' ? 'bg-indigo-500/10 text-indigo-400' : 'bg-orange-500/10 text-orange-400'
                  }`}>
                    action: {item.action}
                  </div>
                  <h4 className="text-sm font-bold text-gray-100">{item.title}</h4>
                </div>
                <ChevronDown size={18} className="text-gray-400 transition-transform group-open:rotate-180" />
              </summary>
              
              <div className="p-5 border-t border-white/5 space-y-4 bg-neutral-950/40 text-sm">
                <p className="text-gray-400 text-xs leading-relaxed">{item.desc}</p>
                
                {/* Parameters table */}
                <div className="space-y-2">
                  <span className="text-xs font-bold text-gray-300 uppercase tracking-widest font-mono">Parameters</span>
                  <div className="border border-neutral-800 rounded-xl overflow-hidden text-xs">
                    <div className="grid grid-cols-12 bg-neutral-950 p-2.5 border-b border-neutral-800 font-bold text-gray-400">
                      <div className="col-span-3">Parameter</div>
                      <div className="col-span-2">Type</div>
                      <div className="col-span-2">Required</div>
                      <div className="col-span-5">Description</div>
                    </div>
                    {item.params.map((p, pIdx) => (
                      <div key={pIdx} className="grid grid-cols-12 p-2.5 border-b border-neutral-800 last:border-0 text-gray-300">
                        <div className="col-span-3 font-mono font-bold text-[var(--app-accent)]">{p.name}</div>
                        <div className="col-span-2 font-mono text-gray-400">{p.type}</div>
                        <div className="col-span-2">{p.req ? <span className="text-red-500 font-semibold">Yes</span> : 'No'}</div>
                        <div className="col-span-5 text-gray-400">{p.desc}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Example Request & Response */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
                  <div>
                    <span className="text-xs font-bold text-gray-300 uppercase tracking-widest font-mono block mb-1.5">Example URL Query / Form Data</span>
                    <pre className="bg-neutral-950 p-3 rounded-xl border border-neutral-800 text-gray-300 overflow-x-auto select-all">{item.reqSample}</pre>
                  </div>
                  <div>
                    <span className="text-xs font-bold text-gray-300 uppercase tracking-widest font-mono block mb-1.5">Expected Response JSON</span>
                    <pre className="bg-neutral-950 p-3 rounded-xl border border-neutral-800 text-emerald-400 overflow-x-auto select-all">{item.resSample}</pre>
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
