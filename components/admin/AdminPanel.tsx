import React, { useState, useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  useStore,
  fetchUsers,
  fetchServices,
  getConfig,
  updateConfig,
  updateUser,
  updateService,
  addService,
  deleteService,
  deleteUser,
  syncServicesFromProvider,
  fetchOrders,
  updateOrderStatus,
  updateOrderDetails,
  updateOrderExternalId,
  fetchCoupons,
  createCoupon,
  deleteCoupon,
  toggleCouponStatus,
  fetchTransactions,
  revertTransaction,
  manualFundUpdate,
  adminCancelOrder,
  checkSingleOrderApiStatus,
  fetchCategories,
  addCategory,
  updateCategory,
  deleteCategory,
  calculateFinalPrice,
  toggleCategoryWithServices,
  fetchUserHistory,
  disableAllCategories,
  getReferralStats,
  syncOrderStatuses,
  hardResyncServices,
  importServiceFromApi,
  hardResyncCategories,
} from "../../services/mockStore";
import {
  Card,
  Button,
  Input,
  Badge,
  Modal,
  Notification,
} from "../ui/Components";
import {
  User,
  Service,
  UserRole,
  Order,
  OrderStatus,
  Coupon,
  Transaction,
  Category,
  GlobalConfig,
} from "../../types";
import { CURRENCY_SYMBOL } from "../../constants";
import { useAuth } from "../../App";
import {
  Users,
  ShoppingBag,
  Settings,
  RefreshCw,
  Trash2,
  Edit2,
  TrendingUp,
  Search,
  Filter,
  Shield,
  AlertTriangle,
  Plus,
  Wallet,
  Clock,
  Copy,
  Check,
  List,
  Save,
  ChevronRight,
  DollarSign,
  Phone,
  Network,
  BarChart3,
  Activity,
  UserPlus,
  CreditCard,
  X,
  FolderPlus,
  Tag,
  Home,
  LogOut,
  Star,
  DownloadCloud,
  Palette,
  Server,
  PlayCircle,
  Code,
} from "lucide-react";

import { ApiManagement } from "./ApiManagement";

// --- STYLES & HELPERS ---
const CONTROL_BAR_CLASS =
  "flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-[var(--app-card-bg)] border border-[var(--app-border)] p-4 rounded-xl backdrop-blur-md sticky top-0 z-20 shadow-lg mb-4";
const TABLE_CONTAINER_CLASS =
  "overflow-x-auto custom-scrollbar bg-[var(--app-card-bg)] border border-[var(--app-border)] rounded-xl mb-4";
const TABLE_HEAD_CLASS =
  "px-4 py-4 bg-[var(--app-bg)] text-[var(--app-text-muted)] uppercase text-[10px] font-bold tracking-wider text-left sticky top-0 z-10 border-b border-[var(--app-border)] whitespace-nowrap";
const TABLE_CELL_CLASS =
  "px-4 py-4 text-sm text-[var(--app-text)] border-b border-[var(--app-border)] group-hover:bg-[var(--app-bg)]/50 transition-colors whitespace-nowrap align-middle";

const CopyButton: React.FC<{ text: string }> = ({ text }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={handleCopy}
      className="text-[var(--app-text-muted)] hover:text-[var(--app-text)] transition-colors"
      title="Copy"
    >
      {copied ? (
        <Check size={14} className="text-[var(--app-accent)]" />
      ) : (
        <Copy size={14} />
      )}
    </button>
  );
};

// --- DASHBOARD OVERVIEW WIDGET ---
const DashboardOverview: React.FC = () => {
  const users = useStore("suh_users", fetchUsers) as User[];
  const orders = useStore("suh_orders", fetchOrders) as Order[];
  const transactions = useStore(
    "suh_transactions",
    fetchTransactions,
  ) as Transaction[];

  const stats = useMemo(() => {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const txs = Array.isArray(transactions) ? transactions : [];
    const usr = Array.isArray(users) ? users : [];
    const ords = Array.isArray(orders) ? orders : [];

    const totalRevenue = txs
      .filter((t) => t && t.type === "DEPOSIT" && t.status === "SUCCESS")
      .reduce((sum, t) => sum + (t.amount || 0), 0);

    const todayUsers = usr.filter(
      (u) => u && u.createdAt && new Date(u.createdAt) > oneDayAgo,
    ).length;
    const pendingOrders = ords.filter(
      (o) =>
        o &&
        (o.status === OrderStatus.PENDING || o.status === OrderStatus.PROCESSING),
    ).length;
    const completedOrders = ords.filter(
      (o) => o && o.status === OrderStatus.COMPLETED,
    ).length;

    return {
      totalRevenue,
      todayUsers,
      pendingOrders,
      completedOrders,
      totalUsers: usr.length,
      totalTxns: txs.length,
    };
  }, [users, orders, transactions]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-in fade-in pb-20">
      <Card className="bg-gradient-to-br from-[var(--app-accent)]/10 to-[var(--app-card-bg)] border border-[var(--app-accent)]/20 p-6 relative overflow-hidden group">
        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity text-[var(--app-accent)]">
          <DollarSign size={64} />
        </div>
        <p className="text-[var(--app-accent)] text-xs font-bold uppercase tracking-wider mb-2">
          Total Revenue
        </p>
        <h2 className="text-3xl md:text-4xl font-black text-[var(--app-text)]">
          {CURRENCY_SYMBOL}
          {stats.totalRevenue.toFixed(2)}
        </h2>
        <div className="mt-4 flex items-center gap-2 text-xs text-[var(--app-text-muted)]">
          <CreditCard size={12} /> {stats.totalTxns} Transactions
        </div>
      </Card>

      <Card className="bg-[var(--app-card-bg)] border-[var(--app-border)] p-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-4 opacity-10 text-[var(--app-text)]">
          <Users size={64} />
        </div>
        <p className="text-[var(--app-text-muted)] text-xs font-bold uppercase tracking-wider mb-2">
          Total Users
        </p>
        <h2 className="text-3xl md:text-4xl font-black text-[var(--app-text)]">
          {stats.totalUsers}
        </h2>
        <div className="mt-4 flex items-center gap-2 text-xs text-[var(--app-accent)]">
          <UserPlus size={12} /> +{stats.todayUsers} New in 24h
        </div>
      </Card>

      <Card className="bg-[var(--app-card-bg)] border-[var(--app-border)] p-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-4 opacity-10 text-[var(--app-text)]">
          <Activity size={64} />
        </div>
        <p className="text-[var(--app-text-muted)] text-xs font-bold uppercase tracking-wider mb-2">
          Pending Orders
        </p>
        <h2 className="text-3xl md:text-4xl font-black text-[var(--app-text)]">
          {stats.pendingOrders}
        </h2>
        <div className="mt-4 flex items-center gap-2 text-xs text-blue-500">
          <Check size={12} /> {stats.completedOrders} Completed
        </div>
      </Card>
    </div>
  );
};

// --- ORDER MANAGEMENT ---
const OrderManagement: React.FC<{
  notify: (m: string, t: "success" | "error") => void;
}> = ({ notify }) => {
  const orders = useStore("suh_orders", fetchOrders) as Order[];
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);

  const filteredOrders = useMemo(
    () => {
      if (!Array.isArray(orders)) return [];
      return orders
        .filter(
          (o) => {
            if (!o) return false;
            const matchesStatus = filterStatus === "ALL" || o.status === filterStatus;
            if (!matchesStatus) return false;

            const searchLower = search.toLowerCase();
            const orderId = String(o.id || "").toLowerCase();
            const userId = String(o.userId || "").toLowerCase();
            const serviceName = String(o.serviceName || "").toLowerCase();
            const link = String(o.link || "").toLowerCase();
            const externalId = String(o.externalId || "").toLowerCase();

            return (
              orderId.includes(searchLower) ||
              userId.includes(searchLower) ||
              serviceName.includes(searchLower) ||
              link.includes(searchLower) ||
              externalId.includes(searchLower)
            );
          },
        )
        .sort(
          (a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime(),
        );
    },
    [orders, search, filterStatus],
  );

  const handleCancel = async (oid: string) => {
    if (!window.confirm("Refund and Cancel Order?")) return;
    try {
      await adminCancelOrder(oid);
      notify("Order Cancelled & Refunded", "success");
    } catch (e: any) {
      notify(e.message, "error");
    }
  };

  const handleCheckStatus = async (oid: string) => {
    try {
      const s = await checkSingleOrderApiStatus(oid);
      notify(`Provider Status: ${s}`, "success");
    } catch (e: any) {
      notify(e.message, "error");
    }
  };

  const handleUpdate = async () => {
    if (!editingOrder) return;
    try {
      await updateOrderDetails(editingOrder.id, editingOrder);
      notify("Order updated", "success");
      setEditingOrder(null);
    } catch (e: any) {
      notify(e.message, "error");
    }
  };

  return (
    <div className="animate-in fade-in pb-20">
      <div className={CONTROL_BAR_CLASS}>
        <div className="flex gap-2 w-full md:w-auto overflow-x-auto custom-scrollbar pb-2 md:pb-0">
          {[
            "ALL",
            "Pending",
            "Processing",
            "Completed",
            "Partial",
            "Canceled",
            "Failed",
          ].map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${filterStatus === s ? "bg-[var(--app-accent)] text-white" : "bg-[var(--app-input-bg)] border border-[var(--app-border)] text-[var(--app-text-muted)] hover:text-[var(--app-text)]"}`}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="relative w-full md:w-64">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
            size={14}
          />
          <input
            className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded-lg pl-9 pr-4 py-2 text-xs text-[var(--app-text)] focus:border-[var(--app-accent)] outline-none"
            placeholder="Search orders..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className={TABLE_CONTAINER_CLASS}>
        <table className="w-full text-left text-xs whitespace-nowrap">
          <thead className={TABLE_HEAD_CLASS}>
            <tr>
              <th className="px-4 py-3">ID / Date</th>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Service</th>
              <th className="px-4 py-3">Link</th>
              <th className="px-4 py-3">Qty</th>
              <th className="px-4 py-3">Charge</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--app-border)]">
            {filteredOrders.slice(0, 100).map((o) => (
              <tr
                key={o.id}
                className="hover:bg-[var(--app-input-bg)]/40 hover:text-[var(--app-text)] transition-colors"
              >
                <td className={TABLE_CELL_CLASS}>
                  <div className="font-mono text-gray-300">{o.id}</div>
                  <div className="text-[10px] text-gray-500">
                    {new Date(o.date).toLocaleString()}
                  </div>
                  {o.externalId && (
                    <div className="text-[10px] text-blue-400">
                      Ext: {o.externalId}
                    </div>
                  )}
                  {o.error && (
                    <div className="text-[10px] text-red-500 font-bold mt-1 bg-red-900/10 p-1 rounded border border-red-900/20 whitespace-normal max-w-[150px]">
                      Error: {o.error}
                    </div>
                  )}
                </td>
                <td className={TABLE_CELL_CLASS}>
                  <div className="font-mono text-gray-400">
                    {(o.userId || "").substring(0, 8)}...
                  </div>
                </td>
                <td className={TABLE_CELL_CLASS}>
                  <div className="truncate max-w-[150px]" title={o.serviceName}>
                    {o.serviceName}
                  </div>
                </td>
                <td className={TABLE_CELL_CLASS}>
                  <a
                    href={o.link ? o.link.split('#comments=')[0] : ''}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-400 truncate max-w-[100px] block"
                    title={o.link ? o.link.split('#comments=')[0] : ''}
                  >
                    {o.link ? o.link.split('#comments=')[0] : ''}
                  </a>
                </td>
                <td className={TABLE_CELL_CLASS}>{o.quantity}</td>
                <td className={TABLE_CELL_CLASS}>
                  {CURRENCY_SYMBOL}
                  {o.charge}
                </td>
                <td className={TABLE_CELL_CLASS}>
                  <Badge
                    variant={
                      o.status === "Completed"
                        ? "success"
                        : o.status === "Pending"
                          ? "warning"
                          : "danger"
                    }
                  >
                    {o.status}
                  </Badge>
                </td>
                <td className={TABLE_CELL_CLASS}>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setEditingOrder(o)}
                      className="p-1 hover:text-white text-gray-400"
                      title="Edit"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      onClick={() => handleCheckStatus(o.id)}
                      className="p-1 hover:text-blue-400 text-gray-400"
                      title="Sync Status"
                    >
                      <RefreshCw size={14} />
                    </button>
                    {o.error && (
                      <button
                        onClick={async () => {
                          try {
                            await updateOrderDetails(o.id, {
                              error: null as any,
                            });
                            notify(
                              "Error cleared. Order will be retried.",
                              "success",
                            );
                          } catch (e: any) {
                            notify(e.message, "error");
                          }
                        }}
                        className="p-1 hover:text-green-500 text-gray-400"
                        title="Retry Order"
                      >
                        <RefreshCw size={14} className="rotate-180" />
                      </button>
                    )}
                    {(o.status === "Pending" || o.status === "Processing") && (
                      <button
                        onClick={() => handleCancel(o.id)}
                        className="p-1 hover:text-red-500 text-gray-400"
                        title="Cancel & Refund"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        isOpen={!!editingOrder}
        onClose={() => setEditingOrder(null)}
        title="Edit Order"
      >
        {editingOrder && (
          <div className="space-y-4">
            <Input
              label="External ID"
              value={editingOrder.externalId || ""}
              onChange={(e) =>
                setEditingOrder({ ...editingOrder, externalId: e.target.value })
              }
            />
            <Input
              label="Start Count"
              value={editingOrder.start_count}
              onChange={(e) =>
                setEditingOrder({
                  ...editingOrder,
                  start_count: parseInt(e.target.value) || 0,
                })
              }
              type="number"
            />
            <Input
              label="Remains"
              value={editingOrder.remains || 0}
              onChange={(e) =>
                setEditingOrder({
                  ...editingOrder,
                  remains: parseInt(e.target.value) || 0,
                })
              }
              type="number"
            />
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">
                Status
              </label>
              <select
                className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded-xl p-3 text-[var(--app-text)] focus:border-[var(--app-accent)] focus:outline-none transition-all"
                value={editingOrder.status}
                onChange={(e) =>
                  setEditingOrder({
                    ...editingOrder,
                    status: e.target.value as OrderStatus,
                  })
                }
              >
                {Object.values(OrderStatus).map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <Button onClick={handleUpdate} className="w-full">
              Save Changes
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
};

// --- SERVICE MANAGEMENT ---
const ServiceManagement: React.FC<{
  notify: (m: string, t: "success" | "error") => void;
}> = ({ notify }) => {
  const services = useStore("suh_services", fetchServices) as Service[];
  const categories = useStore("suh_categories", fetchCategories) as Category[];
  const [search, setSearch] = useState("");
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [importId, setImportId] = useState("");
  const [newService, setNewService] = useState<Partial<Service>>({
    name: "",
    category: categories[0]?.name || "",
    rate: 0,
    min: 10,
    max: 10000,
    sortOrder: 0,
    isPremium: false,
    description: "",
    type: "Default",
  });

  const filteredServices = services.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.service.includes(search),
  );

  const handleCreate = async () => {
    if (!newService.name || !newService.category) return;
    setIsSyncing(true);
    try {
      await addService(newService);
      notify("Service Created Successfully", "success");
      setCreateModalOpen(false);
      setNewService({
        name: "",
        category: categories[0]?.name || "",
        rate: 0,
        min: 10,
        max: 10000,
        sortOrder: 0,
        isPremium: false,
        description: "",
        type: "Default",
      });
    } catch (e: any) {
      notify(e.message, "error");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const count = await syncServicesFromProvider();
      notify(`Synced ${count} services`, "success");
    } catch (e: any) {
      notify(e.message, "error");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleHardResync = async () => {
    if (
      !window.confirm(
        "WARNING: This will DELETE ALL local services and categories and re-fetch everything from the API. Manual categories will be lost. Continue?",
      )
    )
      return;
    setIsSyncing(true);
    try {
      const count = await hardResyncServices();
      notify(`Hard Reset Complete. Imported ${count} services.`, "success");
    } catch (e: any) {
      notify(e.message, "error");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleImportById = async () => {
    if (!importId) return;
    setIsSyncing(true);
    try {
      await importServiceFromApi(importId);
      notify(`Service ${importId} imported successfully!`, "success");
      setImportModalOpen(false);
      setImportId("");
    } catch (e: any) {
      notify(e.message, "error");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSave = async () => {
    if (!editingService) return;
    try {
      await updateService(editingService);
      notify("Service Updated", "success");
      setEditingService(null);
    } catch (e: any) {
      notify(e.message, "error");
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete this service?")) return;
    try {
      await deleteService(id);
      notify("Service Deleted", "success");
    } catch (e: any) {
      notify(e.message, "error");
    }
  };

  const togglePremium = async (service: Service) => {
    try {
      await updateService({ ...service, isPremium: !service.isPremium });
      notify(
        `Service marked as ${!service.isPremium ? "Premium" : "Standard"}`,
        "success",
      );
    } catch (e: any) {
      notify(e.message, "error");
    }
  };

  return (
    <div className="animate-in fade-in pb-20">
      <div className={CONTROL_BAR_CLASS}>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => setCreateModalOpen(true)}
            size="sm"
            variant="success"
          >
            <Plus size={14} className="mr-2" /> Add Manually
          </Button>
          <Button
            onClick={handleSync}
            isLoading={isSyncing}
            size="sm"
            variant="outline"
          >
            <RefreshCw size={14} className="mr-2" /> Sync (Safe)
          </Button>
          <Button
            onClick={() => setImportModalOpen(true)}
            size="sm"
            variant="secondary"
          >
            <DownloadCloud size={14} className="mr-2" /> Import by ID
          </Button>
          <Button
            onClick={handleHardResync}
            isLoading={isSyncing}
            size="sm"
            variant="danger"
          >
            <AlertTriangle size={14} className="mr-2" /> Hard Reset & Sync
          </Button>
        </div>
        <div className="relative w-full md:w-64">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--app-text-muted)]"
            size={14}
          />
          <input
            className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded-lg pl-9 pr-4 py-2 text-xs text-[var(--app-text)] focus:border-[var(--app-accent)] outline-none"
            placeholder="Search services..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className={TABLE_CONTAINER_CLASS}>
        <table className="w-full text-left text-xs whitespace-nowrap">
          <thead className={TABLE_HEAD_CLASS}>
            <tr>
              <th className="px-4 py-3">Sort</th>
              <th className="px-4 py-3">ID</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Rate</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--app-border)]">
            {filteredServices.map((s) => (
              <tr
                key={s.service}
                className="hover:bg-[var(--app-input-bg)]/40 hover:text-[var(--app-text)] transition-colors"
              >
                <td className={TABLE_CELL_CLASS}>{s.sortOrder}</td>
                <td className={TABLE_CELL_CLASS}>{s.service}</td>
                <td className={TABLE_CELL_CLASS}>
                  <div className="truncate max-w-[200px]" title={s.name}>
                    {s.name}
                  </div>
                </td>
                <td className={TABLE_CELL_CLASS}>{s.category}</td>
                <td className={TABLE_CELL_CLASS}>
                  {CURRENCY_SYMBOL}
                  {s.rate}
                </td>
                <td className={TABLE_CELL_CLASS}>
                  <div className="flex gap-2">
                    <button
                      onClick={() =>
                        updateService({ ...s, isEnabled: !s.isEnabled })
                      }
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${s.isEnabled ? "bg-green-900 text-green-400" : "bg-red-900 text-red-400"}`}
                    >
                      {s.isEnabled ? "Active" : "Disabled"}
                    </button>
                    <button
                      onClick={() => togglePremium(s)}
                      className={`p-1 rounded transition-colors ${s.isPremium ? "text-yellow-400 hover:text-yellow-300" : "text-gray-600 hover:text-yellow-600"}`}
                      title="Toggle Premium Service"
                    >
                      <Star
                        size={16}
                        fill={s.isPremium ? "currentColor" : "none"}
                      />
                    </button>
                  </div>
                </td>
                <td className={TABLE_CELL_CLASS}>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setEditingService(s)}
                      className="p-1 hover:text-white text-gray-400"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      onClick={() => handleDelete(s.service)}
                      className="p-1 hover:text-red-500 text-gray-400"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create Modal */}
      <Modal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(null)}
        title="Add New Service Manually"
      >
        <div className="space-y-4">
          <Input
            label="Service Name"
            value={newService.name}
            onChange={(e) =>
              setNewService({ ...newService, name: e.target.value })
            }
            placeholder="e.g. Instagram Followers"
          />
          <div>
            <label className="text-xs font-bold text-gray-500 mb-1 block">
              Category
            </label>
            <select
              className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded-xl p-3 text-[var(--app-text)] focus:border-[var(--app-accent)] focus:outline-none transition-all"
              value={newService.category}
              onChange={(e) =>
                setNewService({ ...newService, category: e.target.value })
              }
            >
              <option value="">Select Category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Rate per 1000"
              type="number"
              value={newService.rate}
              onChange={(e) =>
                setNewService({
                  ...newService,
                  rate: parseFloat(e.target.value),
                })
              }
            />
            <Input
              label="Sort Order"
              type="number"
              value={newService.sortOrder}
              onChange={(e) =>
                setNewService({
                  ...newService,
                  sortOrder: parseInt(e.target.value),
                })
              }
            />
            <Input
              label="Min"
              type="number"
              value={newService.min}
              onChange={(e) =>
                setNewService({ ...newService, min: parseInt(e.target.value) })
              }
            />
            <Input
              label="Max"
              type="number"
              value={newService.max}
              onChange={(e) =>
                setNewService({ ...newService, max: parseInt(e.target.value) })
              }
            />
          </div>
          <div className="flex items-center gap-3 p-3 bg-[var(--app-input-bg)] rounded-xl border border-[var(--app-border)]">
            <input
              type="checkbox"
              checked={newService.isPremium || false}
              onChange={(e) =>
                setNewService({ ...newService, isPremium: e.target.checked })
              }
              className="w-4 h-4 accent-[var(--app-accent)]"
            />
            <label className="text-sm font-bold text-white flex items-center gap-1">
              <Star size={12} className="text-yellow-500 fill-yellow-500" />{" "}
              Mark as Premium Service
            </label>
          </div>
          <div>
            <label className="text-xs font-bold text-gray-500 mb-1 block">
              Description
            </label>
            <textarea
              className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded-xl p-3 text-[var(--app-text)] text-xs min-h-[80px] outline-none focus:border-[var(--app-accent)] transition-all"
              value={newService.description || ""}
              onChange={(e) =>
                setNewService({ ...newService, description: e.target.value })
              }
              placeholder="Service details, delivery time, etc."
            />
          </div>
          <Button
            onClick={handleCreate}
            isLoading={isSyncing}
            className="w-full"
          >
            Create Service
          </Button>
        </div>
      </Modal>

      {/* Edit Modal */}
      <Modal
        isOpen={!!editingService}
        onClose={() => setEditingService(null)}
        title="Edit Service"
      >
        {editingService && (
          <div className="space-y-4">
            <Input
              label="Name"
              value={editingService.name}
              onChange={(e) =>
                setEditingService({ ...editingService, name: e.target.value })
              }
            />
            <div>
              <label className="text-xs font-bold text-gray-500 mb-1 block">
                Category
              </label>
              <select
                className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded-xl p-3 text-[var(--app-text)] focus:border-[var(--app-accent)] focus:outline-none transition-all"
                value={editingService.category}
                onChange={(e) =>
                  setEditingService({
                    ...editingService,
                    category: e.target.value,
                  })
                }
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Sort Order"
                type="number"
                value={editingService.sortOrder || 0}
                onChange={(e) =>
                  setEditingService({
                    ...editingService,
                    sortOrder: parseInt(e.target.value),
                  })
                }
              />
              <Input
                label="Rate"
                type="number"
                value={editingService.rate}
                onChange={(e) =>
                  setEditingService({
                    ...editingService,
                    rate: parseFloat(e.target.value),
                  })
                }
              />
              <Input
                label="Min"
                type="number"
                value={editingService.min}
                onChange={(e) =>
                  setEditingService({
                    ...editingService,
                    min: parseInt(e.target.value),
                  })
                }
              />
              <Input
                label="Max"
                type="number"
                value={editingService.max}
                onChange={(e) =>
                  setEditingService({
                    ...editingService,
                    max: parseInt(e.target.value),
                  })
                }
              />
            </div>
            <div className="flex items-center gap-3 p-3 bg-[var(--app-input-bg)] rounded-xl border border-[var(--app-border)]">
              <input
                type="checkbox"
                checked={editingService.isPremium || false}
                onChange={(e) =>
                  setEditingService({
                    ...editingService,
                    isPremium: e.target.checked,
                  })
                }
                className="w-4 h-4 accent-[var(--app-accent)]"
              />
              <label className="text-sm font-bold text-white flex items-center gap-1">
                <Star size={12} className="text-yellow-500 fill-yellow-500" />{" "}
                Mark as Premium Service
              </label>
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500 mb-1 block">
                Description
              </label>
              <textarea
                className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded-xl p-3 text-[var(--app-text)] text-xs min-h-[80px] outline-none focus:border-[var(--app-accent)] transition-all"
                value={editingService.description || ""}
                onChange={(e) =>
                  setEditingService({
                    ...editingService,
                    description: e.target.value,
                  })
                }
                placeholder="Service details, delivery time, etc."
              />
            </div>
            <div className="grid grid-cols-2 gap-4 p-4 bg-[var(--app-input-bg)] rounded-xl border border-[var(--app-border)]">
              <div>
                <label className="text-xs text-[var(--app-text-muted)] block mb-1">
                  Custom Margin %
                </label>
                <input
                  className="w-full bg-[var(--app-bg)] border border-[var(--app-border)] rounded-lg p-2.5 text-[var(--app-text)] focus:border-[var(--app-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--app-accent)]/50 transition-all font-sans text-sm"
                  type="number"
                  value={editingService.customMarginPercent || 0}
                  onChange={(e) =>
                    setEditingService({
                      ...editingService,
                      customMarginPercent: parseFloat(e.target.value),
                    })
                  }
                />
              </div>
              <div>
                <label className="text-xs text-[var(--app-text-muted)] block mb-1">
                  Custom Fixed Margin
                </label>
                <input
                  className="w-full bg-[var(--app-bg)] border border-[var(--app-border)] rounded-lg p-2.5 text-[var(--app-text)] focus:border-[var(--app-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--app-accent)]/50 transition-all font-sans text-sm"
                  type="number"
                  value={editingService.customMarginFixed || 0}
                  onChange={(e) =>
                    setEditingService({
                      ...editingService,
                      customMarginFixed: parseFloat(e.target.value),
                    })
                  }
                />
              </div>
            </div>
            <Button onClick={handleSave} className="w-full">
              Save Changes
            </Button>
          </div>
        )}
      </Modal>

      {/* Import Modal */}
      <Modal
        isOpen={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        title="Import Service from Provider"
      >
        <div className="space-y-4">
          <div className="bg-red-900/10 border border-red-900/30 p-4 rounded-lg">
            <p className="text-xs text-red-200">
              Enter the exact Service ID from the provider API. This will fetch
              details, create the category if missing, and add the service to
              your panel.
            </p>
          </div>
          <Input
            label="Provider Service ID"
            value={importId}
            onChange={(e) => setImportId(e.target.value)}
            placeholder="e.g. 1025"
          />
          <Button
            onClick={handleImportById}
            isLoading={isSyncing}
            className="w-full"
          >
            Fetch & Import
          </Button>
        </div>
      </Modal>
    </div>
  );
};

// --- CATEGORY MANAGEMENT ---
const CategoryManagement: React.FC<{
  notify: (m: string, t: "success" | "error") => void;
}> = ({ notify }) => {
  const categories = useStore("suh_categories", fetchCategories) as Category[];
  const [newCat, setNewCat] = useState("");
  const [sort, setSort] = useState("0");
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [isSyncingCats, setIsSyncingCats] = useState(false);

  const handleAdd = async () => {
    if (!newCat) return;
    try {
      await addCategory(newCat, parseInt(sort));
      notify("Category Added", "success");
      setNewCat("");
    } catch (e: any) {
      notify(e.message, "error");
    }
  };

  const handleCategorySync = async () => {
    if (
      !window.confirm(
        "WARNING: This will delete ALL existing categories and re-import them from the provider. Any manual sorting or custom categories will be lost. Are you sure?",
      )
    ) {
      return;
    }
    setIsSyncingCats(true);
    try {
      const count = await hardResyncCategories();
      notify(`Successfully synced ${count} categories.`, "success");
    } catch (e: any) {
      notify(e.message, "error");
    } finally {
      setIsSyncingCats(false);
    }
  };

  const handleUpdateCat = async () => {
    if (!editingCategory) return;
    try {
      await updateCategory(editingCategory.id, editingCategory);
      notify("Category Updated", "success");
      setEditingCategory(null);
    } catch (e: any) {
      notify(e.message, "error");
    }
  };

  const handleToggle = async (cat: Category) => {
    try {
      await toggleCategoryWithServices(cat.id, cat.name, !cat.isEnabled);
      notify("Category & Services updated", "success");
    } catch (e: any) {
      notify(e.message, "error");
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete category?")) return;
    try {
      await deleteCategory(id);
      notify("Deleted", "success");
    } catch (e: any) {
      notify(e.message, "error");
    }
  };

  return (
    <div className="animate-in fade-in pb-20">
      <div className={CONTROL_BAR_CLASS}>
        <div className="flex flex-wrap gap-2">
          <Input
            placeholder="Category Name"
            value={newCat}
            onChange={(e) => setNewCat(e.target.value)}
            className="w-48"
          />
          <Input
            placeholder="Sort"
            type="number"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="w-20"
          />
          <Button onClick={handleAdd} size="sm">
            <Plus size={14} className="mr-1" /> Add
          </Button>
          <Button
            onClick={handleCategorySync}
            isLoading={isSyncingCats}
            size="sm"
            variant="outline"
          >
            <RefreshCw size={14} className="mr-1" /> Sync from API
          </Button>
        </div>
        <Button
          onClick={async () => {
            if (window.confirm("Disable ALL categories?")) {
              await disableAllCategories();
              notify("All disabled", "success");
            }
          }}
          variant="danger"
          size="sm"
        >
          Disable All
        </Button>
      </div>

      <div className={TABLE_CONTAINER_CLASS}>
        <table className="w-full text-left text-xs whitespace-nowrap">
          <thead className={TABLE_HEAD_CLASS}>
            <tr>
              <th className="px-4 py-3">Sort</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--app-border)]">
            {categories
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((c) => (
                <tr
                  key={c.id}
                  className="hover:bg-[var(--app-input-bg)]/40 hover:text-[var(--app-text)] transition-colors"
                >
                  <td className={TABLE_CELL_CLASS}>{c.sortOrder}</td>
                  <td className={TABLE_CELL_CLASS}>{c.name}</td>
                  <td className={TABLE_CELL_CLASS}>
                    <button
                      onClick={() => handleToggle(c)}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${c.isEnabled ? "bg-green-900 text-green-400" : "bg-red-900 text-red-400"}`}
                    >
                      {c.isEnabled ? "Active" : "Disabled"}
                    </button>
                  </td>
                  <td className={TABLE_CELL_CLASS}>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setEditingCategory(c)}
                        className="p-1 hover:text-white text-gray-400"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        onClick={() => handleDelete(c.id)}
                        className="p-1 hover:text-red-500 text-gray-400"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <Modal
        isOpen={!!editingCategory}
        onClose={() => setEditingCategory(null)}
        title="Edit Category"
      >
        {editingCategory && (
          <div className="space-y-4">
            <Input
              label="Name"
              value={editingCategory.name}
              onChange={(e) =>
                setEditingCategory({ ...editingCategory, name: e.target.value })
              }
            />
            <Input
              label="Sort Order"
              type="number"
              value={editingCategory.sortOrder}
              onChange={(e) =>
                setEditingCategory({
                  ...editingCategory,
                  sortOrder: parseInt(e.target.value),
                })
              }
            />
            <Button onClick={handleUpdateCat} className="w-full">
              Save Changes
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
};

// --- COUPON MANAGEMENT ---
const CouponManagement: React.FC<{
  notify: (m: string, t: "success" | "error") => void;
}> = ({ notify }) => {
  const coupons = useStore("suh_coupons", fetchCoupons) as Coupon[];
  const [isCreating, setIsCreating] = useState(false);
  const [newCoupon, setNewCoupon] = useState<Coupon>({
    code: "",
    category: "DEPOSIT",
    type: "PERCENTAGE",
    value: 0,
    minAmount: 100,
    usageLimit: 100,
    usedBy: [],
    isEnabled: true,
  });

  const handleCreate = async () => {
    if (!newCoupon.code) return;
    try {
      await createCoupon(newCoupon);
      notify("Coupon Created", "success");
      setIsCreating(false);
    } catch (e: any) {
      notify(e.message, "error");
    }
  };

  return (
    <div className="animate-in fade-in pb-20">
      <div className={CONTROL_BAR_CLASS}>
        <Button onClick={() => setIsCreating(true)} size="sm">
          <Plus size={14} className="mr-1" /> Create Coupon
        </Button>
      </div>

      <div className={TABLE_CONTAINER_CLASS}>
        <table className="w-full text-left text-xs whitespace-nowrap">
          <thead className={TABLE_HEAD_CLASS}>
            <tr>
              <th className="px-4 py-3">Code</th>
              <th className="px-4 py-3">Value</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Min Amount</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--app-border)]">
            {coupons.map((c) => (
              <tr
                key={c.code}
                className="hover:bg-[var(--app-input-bg)]/40 hover:text-[var(--app-text)] transition-colors"
              >
                <td className={TABLE_CELL_CLASS}>
                  <span className="font-mono bg-[var(--app-input-bg)] border border-[var(--app-border)] px-2.5 py-1 rounded-md font-bold text-[var(--app-accent)] shadow-sm">
                    {c.code}
                  </span>
                </td>
                <td className={TABLE_CELL_CLASS}>
                  {c.value}
                  {c.type === "PERCENTAGE" ? "%" : CURRENCY_SYMBOL}
                </td>
                <td className={TABLE_CELL_CLASS}>{c.category}</td>
                <td className={TABLE_CELL_CLASS}>
                  {CURRENCY_SYMBOL}
                  {c.minAmount}
                </td>
                <td className={TABLE_CELL_CLASS}>
                  <button
                    onClick={async () => {
                      await toggleCouponStatus(c.code, c.isEnabled);
                      notify("Status updated", "success");
                    }}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${c.isEnabled ? "bg-green-900 text-green-400" : "bg-red-900 text-red-400"}`}
                  >
                    {c.isEnabled ? "Active" : "Disabled"}
                  </button>
                </td>
                <td className={TABLE_CELL_CLASS}>
                  <button
                    onClick={async () => {
                      if (window.confirm("Delete coupon?")) {
                        await deleteCoupon(c.code);
                        notify("Deleted", "success");
                      }
                    }}
                    className="p-1 hover:text-red-500 text-gray-400"
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        isOpen={isCreating}
        onClose={() => setIsCreating(false)}
        title="Create Coupon"
      >
        <div className="space-y-4">
          <Input
            label="Code"
            value={newCoupon.code}
            onChange={(e) =>
              setNewCoupon({ ...newCoupon, code: e.target.value.toUpperCase() })
            }
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Value"
              type="number"
              value={newCoupon.value}
              onChange={(e) =>
                setNewCoupon({
                  ...newCoupon,
                  value: parseFloat(e.target.value),
                })
              }
            />
            <div>
              <label className="text-xs font-bold text-[var(--app-text-muted)] mb-1 block">
                Type
              </label>
              <select
                className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded-xl p-3 text-[var(--app-text)] focus:border-[var(--app-accent)] focus:outline-none transition-all"
                value={newCoupon.type}
                onChange={(e) =>
                  setNewCoupon({ ...newCoupon, type: e.target.value as any })
                }
              >
                <option value="PERCENTAGE" className="bg-[var(--app-bg)] text-[var(--app-text)]">Percentage</option>
                <option value="FIXED" className="bg-[var(--app-bg)] text-[var(--app-text)]">Fixed Amount</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-[var(--app-text-muted)] mb-1 block">
                Category
              </label>
              <select
                className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded-xl p-3 text-[var(--app-text)] focus:border-[var(--app-accent)] focus:outline-none transition-all"
                value={newCoupon.category}
                onChange={(e) =>
                  setNewCoupon({
                    ...newCoupon,
                    category: e.target.value as any,
                  })
                }
              >
                <option value="DEPOSIT" className="bg-[var(--app-bg)] text-[var(--app-text)]">Deposit</option>
                <option value="ORDER" className="bg-[var(--app-bg)] text-[var(--app-text)]">Order</option>
              </select>
            </div>
            <Input
              label="Min Amount"
              type="number"
              value={newCoupon.minAmount}
              onChange={(e) =>
                setNewCoupon({
                  ...newCoupon,
                  minAmount: parseFloat(e.target.value),
                })
              }
            />
          </div>
          <Button onClick={handleCreate} className="w-full">
            Create
          </Button>
        </div>
      </Modal>
    </div>
  );
};

// --- SETTINGS MANAGEMENT ---
const SettingsManagement: React.FC<{
  notify: (m: string, t: "success" | "error") => void;
}> = ({ notify }) => {
  const config = useStore("suh_config", getConfig) as GlobalConfig;
  const [formData, setFormData] = useState<GlobalConfig>(
    config || {
      globalMarginPercent: 0,
      globalMarginFixed: 0,
      maintenanceMode: false,
      referralSignupBonus: 1,
      referralDepositBonus: 3,
      referralMinDeposit: 10,
      isReferralSystemEnabled: true,
      themeBg: "#ffffff",
      themeDarkBg: "#09090b",
      themeAccent: "#22c55e",
      renderBackendUrl: "",
      landingVideoUrl: "",
    },
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (config) setFormData(config);
  }, [config]);

  const handleSave = async () => {
    setLoading(true);
    try {
      await updateConfig(formData);
      notify("Global Configuration Saved Successfully", "success");
    } catch (e: any) {
      notify(e.message, "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in pb-20">
      {/* Pricing Strategy Card */}
      <Card className="p-4 md:p-6 bg-[var(--app-card-bg)] border border-[var(--app-border)] text-[var(--app-text)]">
        <div className="flex items-center gap-3 mb-6 pb-4 border-b border-[var(--app-border)]">
          <div className="p-3 bg-[var(--app-accent)]/15 rounded-lg text-[var(--app-accent)] border border-[var(--app-accent)]/30">
            <DollarSign size={24} />
          </div>
          <div>
            <h3 className="text-xl font-bold text-[var(--app-text)]">
              Pricing Strategy
            </h3>
            <p className="text-sm text-[var(--app-text-muted)]">
              Control margins applied to all services.
            </p>
          </div>
        </div>
        <div className="space-y-6">
          <div>
            <label className="text-xs font-bold text-[var(--app-text-muted)] mb-2 uppercase tracking-wider block">
              Global Margin Percentage
            </label>
            <div className="flex items-center gap-4">
              <div className="relative flex-1">
                <input
                  type="number"
                  value={formData.globalMarginPercent}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      globalMarginPercent: parseFloat(e.target.value) || 0,
                    })
                  }
                  className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded-lg py-3 px-4 text-[var(--app-text)] focus:border-[var(--app-accent)] focus:outline-none font-mono text-lg"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--app-text-muted)] font-bold">
                  %
                </span>
              </div>
              <span className="text-[var(--app-text-muted)] text-xs w-1/2 leading-relaxed">
                Markup on provider rate.
              </span>
            </div>
          </div>
          <div>
            <label className="text-xs font-bold text-[var(--app-text-muted)] mb-2 uppercase tracking-wider block">
              Global Fixed Margin
            </label>
            <div className="flex items-center gap-4">
              <div className="relative flex-1">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--app-text-muted)] font-bold">
                  {CURRENCY_SYMBOL}
                </span>
                <input
                  type="number"
                  value={formData.globalMarginFixed}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      globalMarginFixed: parseFloat(e.target.value) || 0,
                    })
                  }
                  className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded-lg py-3 pl-10 pr-4 text-[var(--app-text)] focus:border-[var(--app-accent)] focus:outline-none font-mono text-lg"
                />
              </div>
              <span className="text-[var(--app-text-muted)] text-xs w-1/2 leading-relaxed">
                Flat fee added per SMM order.
              </span>
            </div>
          </div>
        </div>
      </Card>

      {/* System Controls Card */}
      <Card className="p-4 md:p-6 bg-[var(--app-card-bg)] border border-[var(--app-border)]">
        <div className="flex items-center gap-3 mb-6 pb-4 border-b border-white/10">
          <div className="p-3 bg-[var(--app-accent)]/15 rounded-lg text-[var(--app-accent)] border border-[var(--app-accent)]/30">
            <Shield size={24} />
          </div>
          <div>
            <h3 className="text-xl font-bold text-[var(--app-text)]">System Controls</h3>
            <p className="text-sm text-[var(--app-text-muted)]">Settings and Maintenance.</p>
          </div>
        </div>
        <div className="space-y-6">
          <div className="flex items-center justify-between p-4 bg-[var(--app-input-bg)] rounded-xl border border-[var(--app-border)]">
            <div>
              <h4 className="font-bold text-[var(--app-text)] mb-1">Maintenance Mode</h4>
              <p className="text-xs text-[var(--app-text-muted)]">Lock out non-admin users.</p>
            </div>
            <button
              onClick={() =>
                setFormData({
                  ...formData,
                  maintenanceMode: !formData.maintenanceMode,
                })
              }
              className={`w-14 h-8 rounded-full p-1 transition-all duration-300 ${formData.maintenanceMode ? "bg-[var(--app-accent)] shadow-[0_0_15px_rgba(46,189,89,0.5)]" : "bg-zinc-600 dark:bg-neutral-800"}`}
            >
              <div
                className={`w-6 h-6 bg-white dark:bg-zinc-200 rounded-full shadow-md transform transition-transform duration-300 ${formData.maintenanceMode ? "translate-x-6" : ""}`}
              />
            </button>
          </div>

          <div>
            <label className="text-xs font-bold text-[var(--app-text-muted)] mb-2 uppercase tracking-wider block">
              Live Render Backend URL
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--app-text-muted)]">
                <Server size={18} />
              </span>
              <input
                type="url"
                value={formData.renderBackendUrl || ""}
                placeholder="https://your-backend-app.onrender.com"
                onChange={(e) =>
                  setFormData({ ...formData, renderBackendUrl: e.target.value })
                }
                className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded-lg py-3 pl-12 pr-4 text-[var(--app-text)] focus:border-[var(--app-accent)] focus:outline-none font-mono text-sm"
              />
            </div>
            <p className="text-[10px] text-[var(--app-text-muted)] mt-2">
              All SMM API and verification requests flow here directly if
              specified.
            </p>
          </div>

          <div>
            <label className="text-xs font-bold text-[var(--app-text-muted)] mb-2 uppercase tracking-wider block">
              Landing Page Video URL
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--app-text-muted)]">
                <PlayCircle size={18} />
              </span>
              <input
                type="url"
                value={formData.landingVideoUrl || ""}
                placeholder="https://www.youtube.com/watch?v=dQw4w9WgXcQ"
                onChange={(e) =>
                  setFormData({ ...formData, landingVideoUrl: e.target.value })
                }
                className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded-lg py-3 pl-12 pr-4 text-[var(--app-text)] focus:border-[var(--app-accent)] focus:outline-none font-mono text-sm"
              />
            </div>
            <p className="text-[10px] text-[var(--app-text-muted)] mt-2 font-sans">
              Set custom YouTube promo/tutorial video URL embedded on landing
              page.
            </p>
          </div>
        </div>
      </Card>

      <div className="col-span-full">
        <Button
          onClick={handleSave}
          isLoading={loading}
          size="lg"
          className="w-full bg-[var(--app-accent)] text-white hover:opacity-95 font-black tracking-widest uppercase shadow-[0_4px_14px_rgba(46,189,89,0.3)] font-sans"
        >
          <Save size={18} className="mr-2 inline" /> Save System Configuration
        </Button>
      </div>
    </div>
  );
};

// --- USER MANAGEMENT ---
const UserManagement: React.FC<{
  notify: (m: string, t: "success" | "error") => void;
}> = ({ notify }) => {
  const users = useStore("suh_users", fetchUsers) as User[];
  const [search, setSearch] = useState("");
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [fundAmount, setFundAmount] = useState("");
  const [fundReason, setFundReason] = useState("Admin Bonus");

  // New States for Detailed History
  const [activeUserTab, setActiveUserTab] = useState<
    "PROFILE" | "ORDERS" | "TRANSACTIONS"
  >("PROFILE");
  const [userOrders, setUserOrders] = useState<Order[]>([]);
  const [userTxns, setUserTxns] = useState<Transaction[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [referralStats, setReferralStats] = useState<any>(null);

  useEffect(() => {
    if (editingUser) {
      setLoadingHistory(true);
      // Fetch history
      fetchUserHistory(editingUser.id).then(({ orders, transactions }) => {
        setUserOrders(orders);
        setUserTxns(transactions);
        setLoadingHistory(false);
      });
      // Fetch referral stats
      getReferralStats(editingUser.id).then(setReferralStats);
    }
  }, [editingUser]);

  const filteredUsers = useMemo(() => {
    if (!Array.isArray(users)) return [];
    return users.filter(
      (u) => {
        if (!u) return false;
        const q = search.toLowerCase();
        const name = String(u.name || "").toLowerCase();
        const email = String(u.email || "").toLowerCase();
        const mobile = String(u.mobile || "");
        const id = String(u.id || "");
        return (
          name.includes(q) ||
          email.includes(q) ||
          mobile.includes(search) ||
          id.includes(search)
        );
      }
    );
  }, [users, search]);

  const handleUpdateUser = async () => {
    if (!editingUser) return;
    try {
      await updateUser(editingUser);
      notify("User profile updated successfully", "success");
    } catch (e: any) {
      notify(e.message, "error");
    }
  };

  const handleFundUpdate = async (type: "ADD" | "DEDUCT") => {
    if (!editingUser || !fundAmount) return;
    try {
      const updatedUser = await manualFundUpdate(
        editingUser.id,
        parseFloat(fundAmount),
        type,
        fundReason,
      );
      notify(
        `Funds ${type === "ADD" ? "added to" : "deducted from"} ${editingUser.name}`,
        "success",
      );
      setFundAmount("");
      setEditingUser(updatedUser);
      // Refresh history
      fetchUserHistory(editingUser.id).then(({ transactions }) =>
        setUserTxns(transactions),
      );
    } catch (e: any) {
      notify(e.message, "error");
    }
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 pb-20">
      <div className={CONTROL_BAR_CLASS}>
        <div className="flex flex-col md:flex-row gap-4 items-center w-full">
          <div className="relative w-full md:w-96">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
              size={14}
            />
            <input
              className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded-xl pl-9 pr-4 py-2.5 text-sm text-[var(--app-text)] focus:border-[var(--app-accent)] focus:outline-none transition-all"
              placeholder="Search by name, email, mobile or ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="text-xs text-[var(--app-text-muted)] font-bold uppercase tracking-wider ml-auto bg-[var(--app-input-bg)] px-3 py-2 rounded-xl border border-[var(--app-border)] whitespace-nowrap">
            {filteredUsers.length} Users Found
          </div>
        </div>
      </div>

      <div className={TABLE_CONTAINER_CLASS}>
        <table className="w-full text-left text-xs whitespace-nowrap">
          <thead className={TABLE_HEAD_CLASS}>
            <tr>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3">Balance</th>
              <th className="px-4 py-3">Referrals</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Joined</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--app-border)]">
            {filteredUsers.map((u) => (
              <tr
                key={u.id}
                className="hover:bg-[var(--app-input-bg)]/40 hover:text-[var(--app-text)] transition-colors group"
              >
                <td className={TABLE_CELL_CLASS}>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-[var(--app-bg)] flex items-center justify-center font-bold text-[var(--app-accent)] border border-[var(--app-accent)]/20 shadow-sm shrink-0">
                      {u.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="font-bold text-[var(--app-text)] text-sm">
                        {u.name}
                      </div>
                      <div className="text-[var(--app-text-muted)] text-[10px] font-mono">
                        {(u.id || "").substring(0, 8)}...
                      </div>
                    </div>
                  </div>
                </td>
                <td className={TABLE_CELL_CLASS}>
                  <div className="flex flex-col">
                    <div className="text-[var(--app-text)]">{u.email}</div>
                    <div className="text-[var(--app-text-muted)] text-[10px] flex items-center gap-1">
                      <Phone size={10} /> {u.mobile || "N/A"}
                    </div>
                  </div>
                </td>
                <td className={TABLE_CELL_CLASS}>
                  <span className="font-mono font-bold text-[var(--app-accent)] bg-[var(--app-accent)]/15 px-2 py-0.5 rounded border border-[var(--app-accent)]/30">
                    {CURRENCY_SYMBOL}
                    {u.balance.toFixed(2)}
                  </span>
                </td>
                <td className={TABLE_CELL_CLASS}>
                  <div className="text-gray-300">
                    {CURRENCY_SYMBOL}
                    {u.total_referral_earnings || 0}
                  </div>
                  <div className="text-[10px] text-gray-500">
                    Code: {u.referral_code}
                  </div>
                </td>
                <td className={TABLE_CELL_CLASS}>
                  <Badge
                    variant={u.role === UserRole.ADMIN ? "danger" : "info"}
                  >
                    {u.role}
                  </Badge>
                </td>
                <td className={TABLE_CELL_CLASS}>
                  <Badge variant={u.isBanned ? "danger" : "success"}>
                    {u.isBanned ? "Banned" : "Active"}
                  </Badge>
                </td>
                <td className={TABLE_CELL_CLASS}>
                  {new Date(u.createdAt).toLocaleDateString()}
                </td>
                <td className={`${TABLE_CELL_CLASS} text-right`}>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setEditingUser(u);
                      setActiveUserTab("PROFILE");
                    }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    Manage
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        isOpen={!!editingUser}
        onClose={() => setEditingUser(null)}
        title={`Manage: ${editingUser?.name}`}
      >
        {editingUser && (
          <div className="space-y-6">
            <div className="flex gap-2 border-b border-[var(--app-border)] pb-1">
              {["PROFILE", "ORDERS", "TRANSACTIONS"].map((t) => (
                <button
                  key={t}
                  onClick={() => setActiveUserTab(t as any)}
                  className={`px-4 py-2 text-xs font-bold rounded-t-lg transition-colors ${activeUserTab === t ? "bg-[var(--app-accent)] text-white" : "text-[var(--app-text-muted)] hover:text-[var(--app-text)] bg-[var(--app-input-bg)] border border-[var(--app-border)] border-b-0"}`}
                >
                  {t}
                </button>
              ))}
            </div>

            {activeUserTab === "PROFILE" && (
              <div className="space-y-6 animate-in fade-in">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider block">
                      Role
                    </label>
                    <select
                      className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded-xl p-3 text-[var(--app-text)] focus:border-[var(--app-accent)] focus:outline-none transition-all"
                      value={editingUser.role}
                      onChange={(e) =>
                        setEditingUser({
                          ...editingUser,
                          role: e.target.value as UserRole,
                        })
                      }
                    >
                      <option value={UserRole.USER}>User</option>
                      <option value={UserRole.ADMIN}>Admin</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider block">
                      Account Status
                    </label>
                    <button
                      onClick={() =>
                        setEditingUser({
                          ...editingUser,
                          isBanned: !editingUser.isBanned,
                          banReason: !editingUser.isBanned
                            ? "Violation of Terms"
                            : undefined,
                        })
                      }
                      className={`w-full p-3 rounded-lg text-sm font-bold border transition-all ${editingUser.isBanned ? "bg-red-600 border-red-500 text-white" : "bg-green-600 border-green-500 text-white"}`}
                    >
                      {editingUser.isBanned ? "BANNED" : "ACTIVE"}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider block">
                    Mobile Number
                  </label>
                  <Input
                    value={editingUser.mobile || ""}
                    onChange={(e) =>
                      setEditingUser({ ...editingUser, mobile: e.target.value })
                    }
                    placeholder="10-digit Mobile"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4 bg-[var(--app-input-bg)] p-3 rounded-xl border border-[var(--app-border)] shadow-sm">
                  <div>
                    <label className="text-xs font-bold text-[var(--app-text-muted)] mb-1 block">
                      Referral Code
                    </label>
                    <div className="flex items-center gap-2">
                      <p className="text-[var(--app-text)] font-mono font-bold">
                        {editingUser.referral_code || "N/A"}
                      </p>
                      {editingUser.referral_code && (
                        <CopyButton text={editingUser.referral_code} />
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-[var(--app-text-muted)] mb-1 block">
                      Referred By
                    </label>
                    <p className="text-[var(--app-text)] font-mono font-bold">
                      {editingUser.referred_by || "None"}
                    </p>
                  </div>
                </div>

                {/* Referral Stats Mini-View */}
                {referralStats && (
                  <div className="grid grid-cols-3 gap-2 text-center bg-[var(--app-input-bg)] p-3 rounded-xl border border-[var(--app-border)] shadow-sm">
                    <div>
                      <div className="text-lg font-bold text-[var(--app-text)]">
                        {referralStats.totalReferrals}
                      </div>
                      <div className="text-[10px] text-[var(--app-text-muted)] font-medium">Invites</div>
                    </div>
                    <div>
                      <div className="text-lg font-bold text-[var(--app-accent)]">
                        {referralStats.depositCount}
                      </div>
                      <div className="text-[10px] text-[var(--app-text-muted)] font-medium">
                        Depositors
                      </div>
                    </div>
                    <div>
                      <div className="text-lg font-bold text-[var(--app-text-muted)]">
                        {referralStats.signupCount}
                      </div>
                      <div className="text-[10px] text-[var(--app-text-muted)] font-medium">Signups</div>
                    </div>
                  </div>
                )}

                {editingUser.isBanned && (
                  <div>
                    <label className="text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider block">
                      Ban Reason
                    </label>
                    <Input
                      value={editingUser.banReason || ""}
                      onChange={(e) =>
                        setEditingUser({
                          ...editingUser,
                          banReason: e.target.value,
                        })
                      }
                      placeholder="Reason for ban..."
                    />
                  </div>
                )}

                 <div className="bg-[var(--app-input-bg)] p-4 rounded-xl border border-[var(--app-border)]">
                  <h4 className="text-[var(--app-text)] font-bold mb-3 flex items-center gap-2 text-sm">
                    <Wallet size={16} className="text-[var(--app-accent)]" />{" "}
                    Fund Management
                  </h4>
                  <div className="p-3 mb-4 bg-[var(--app-bg)] rounded-xl border border-[var(--app-border)] flex justify-between items-center mr-0">
                    <span className="text-[var(--app-text-muted)] text-xs uppercase font-bold">
                      Current Balance
                    </span>
                    <span className="text-xl font-mono font-bold text-[var(--app-text)]">
                      {CURRENCY_SYMBOL}
                      {editingUser.balance.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex gap-2 mb-2">
                    <input
                      className="bg-[var(--app-bg)] border border-[var(--app-border)] rounded-xl p-3 text-[var(--app-text)] flex-1 text-sm focus:border-[var(--app-accent)] focus:outline-none transition-all"
                      type="number"
                      placeholder="Amount"
                      value={fundAmount}
                      onChange={(e) => setFundAmount(e.target.value)}
                    />
                    <input
                      className="bg-[var(--app-bg)] border border-[var(--app-border)] rounded-xl p-3 text-[var(--app-text)] flex-1 text-sm focus:border-[var(--app-accent)] focus:outline-none transition-all"
                      placeholder="Reason (e.g. Bonus)"
                      value={fundReason}
                      onChange={(e) => setFundReason(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="success"
                      onClick={() => handleFundUpdate("ADD")}
                      className="flex-1"
                    >
                      Add Funds
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => handleFundUpdate("DEDUCT")}
                      className="flex-1"
                    >
                      Deduct Funds
                    </Button>
                  </div>
                </div>

                <div className="pt-4 border-t border-white/10 flex gap-4">
                  <Button
                    onClick={handleUpdateUser}
                    className="flex-1 neon-box"
                  >
                    Save Changes
                  </Button>
                </div>
              </div>
            )}

            {/* ... Orders and Transactions Tabs ... */}
            {activeUserTab === "ORDERS" && (
              <div className="animate-in fade-in max-h-[400px] overflow-y-auto custom-scrollbar">
                {loadingHistory ? (
                  <div className="p-4 text-center text-gray-500">
                    Loading history...
                  </div>
                ) : (
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-[var(--app-bg)] z-10 text-[var(--app-text-muted)] uppercase">
                      <tr>
                        <th className="px-2 py-2">ID</th>
                        <th className="px-2 py-2">Service</th>
                        <th className="px-2 py-2">Charge</th>
                        <th className="px-2 py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {userOrders.map((o) => (
                        <tr
                          key={o.id}
                          className="border-b border-[var(--app-border)] hover:bg-[var(--app-input-bg)]/40 hover:text-[var(--app-text)] transition-colors"
                        >
                          <td className="px-2 py-2 font-mono">{o.id}</td>
                          <td className="px-2 py-2 truncate max-w-[150px]">
                            {o.serviceName}
                          </td>
                          <td className="px-2 py-2">
                            {CURRENCY_SYMBOL}
                            {o.charge}
                          </td>
                          <td className="px-2 py-2">
                            <Badge
                              variant={
                                o.status === "Completed" ? "success" : "warning"
                              }
                            >
                              {o.status}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                      {userOrders.length === 0 && (
                        <tr>
                          <td
                            colSpan={4}
                            className="p-4 text-center text-gray-500"
                          >
                            No orders found.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {activeUserTab === "TRANSACTIONS" && (
              <div className="animate-in fade-in max-h-[400px] overflow-y-auto custom-scrollbar">
                {loadingHistory ? (
                  <div className="p-4 text-center text-gray-500">
                    Loading history...
                  </div>
                ) : (
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-[var(--app-bg)] z-10 text-[var(--app-text-muted)] uppercase">
                      <tr>
                        <th className="px-2 py-2">ID</th>
                        <th className="px-2 py-2">Amount</th>
                        <th className="px-2 py-2">Type</th>
                        <th className="px-2 py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {userTxns.map((t) => (
                        <tr
                          key={t.id}
                          className="border-b border-[var(--app-border)] hover:bg-[var(--app-input-bg)]/40 hover:text-[var(--app-text)] transition-colors"
                        >
                          <td className="px-2 py-2 font-mono">{t.id}</td>
                          <td className="px-2 py-2">
                            {CURRENCY_SYMBOL}
                            {t.amount}
                          </td>
                          <td className="px-2 py-2">{t.type}</td>
                          <td className="px-2 py-2">
                            <Badge
                              variant={
                                t.status === "SUCCESS" ? "success" : "danger"
                              }
                            >
                              {t.status}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                      {userTxns.length === 0 && (
                        <tr>
                          <td
                            colSpan={4}
                            className="p-4 text-center text-gray-500"
                          >
                            No transactions found.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};

  // --- MAIN ADMIN PANEL WRAPPER ---
export const AdminPanel: React.FC = () => {
  const { logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  // Parse active tab dynamically from URL pathname
  const activeTab = useMemo(() => {
    const parts = location.pathname.split('/');
    const lastPart = parts[parts.length - 1]?.toUpperCase() || "DASHBOARD";
    if (lastPart === "ADMIN" || lastPart === "DASHBOARD" || lastPart === "") {
      return "DASHBOARD";
    }
    return lastPart as
      | "DASHBOARD"
      | "USERS"
      | "ORDERS"
      | "SERVICES"
      | "CATEGORIES"
      | "COUPONS"
      | "SETTINGS"
      | "API";
  }, [location.pathname]);

  const setActiveTab = (tab: string) => {
    if (tab === "DASHBOARD") {
      navigate("/admin/dashboard");
    } else {
      navigate(`/admin/${tab.toLowerCase()}`);
    }
  };

  // Enforce secure base route redirection when an admin user lands on other roots
  useEffect(() => {
    if (!location.pathname.startsWith('/admin')) {
      navigate('/admin/dashboard', { replace: true });
    }
  }, [location.pathname, navigate]);

  const [notification, setNotification] = useState<{
    msg: string;
    type: "success" | "error";
  } | null>(null);

  const notify = (msg: string, type: "success" | "error") => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 5000);
  };

  // Auto-Sync Hook (Every 30s)
  useEffect(() => {
    const syncInterval = setInterval(() => {
      console.log("Auto-Syncing Admin Data...");
      syncOrderStatuses().catch((err) =>
        console.warn("Order Sync Failed:", err),
      );
      syncServicesFromProvider().catch((err) =>
        console.warn("Service Sync Failed:", err),
      );
    }, 30000); // 30 seconds

    return () => clearInterval(syncInterval);
  }, []);

  const navItems = [
    { id: "DASHBOARD", label: "Home", icon: <BarChart3 size={20} /> },
    { id: "USERS", label: "Users", icon: <Users size={20} /> },
    { id: "ORDERS", label: "Orders", icon: <ShoppingBag size={20} /> },
    { id: "SERVICES", label: "Services", icon: <List size={20} /> },
    { id: "CATEGORIES", label: "Cats", icon: <FolderPlus size={20} /> },
    { id: "COUPONS", label: "Coupons", icon: <Tag size={20} /> },
    { id: "SETTINGS", label: "Config", icon: <Settings size={20} /> },
    { id: "API", label: "APIs", icon: <Code size={20} /> },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case "DASHBOARD":
        return <DashboardOverview />;
      case "USERS":
        return <UserManagement notify={notify} />;
      case "ORDERS":
        return <OrderManagement notify={notify} />;
      case "SERVICES":
        return <ServiceManagement notify={notify} />;
      case "CATEGORIES":
        return <CategoryManagement notify={notify} />;
      case "COUPONS":
        return <CouponManagement notify={notify} />;
      case "SETTINGS":
        return <SettingsManagement notify={notify} />;
      case "API":
        return <ApiManagement notify={notify} />;
      default:
        return <DashboardOverview />;
    }
  };

  return (
    <div className="min-h-screen font-sans bg-[var(--app-bg)] text-[var(--app-text)] pb-24 transition-colors duration-300">
      {notification && (
        <Notification
          message={notification.msg}
          type={notification.type}
          onClose={() => setNotification(null)}
        />
      )}

      {/* Header */}
      <div className="pt-6 px-4 mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-black italic tracking-tighter text-[var(--app-text)] flex items-center gap-2">
            ADMIN{" "}
            <span className="text-[var(--app-accent)]" style={{ textShadow: "0 0 12px rgba(46, 189, 89, 0.35)" }}>PANEL</span>
          </h1>
          <p className="text-[var(--app-text-muted)] text-xs font-mono mt-1">
            System Management Console
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center gap-2 bg-[var(--app-card-bg)] border border-[var(--app-border)] px-3 py-1.5 rounded-full shadow-sm">
            <span className="w-2 h-2 rounded-full bg-[var(--app-accent)] animate-pulse"></span>
            <span className="text-[10px] font-bold text-[var(--app-text-muted)] uppercase tracking-widest">
              Auto Sync On
            </span>
          </div>
          <button
            onClick={logout}
            className="bg-[var(--app-input-bg)] border border-[var(--app-border)] p-2.5 rounded-xl text-red-500 hover:bg-red-500/10 hover:text-red-400 transition-colors"
            title="Logout"
          >
            <LogOut size={20} />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="px-4">{renderContent()}</div>

      {/* Fixed Bottom Navigation Bar */}
      <nav className="fixed bottom-0 left-0 w-full bg-[var(--app-card-bg)]/90 backdrop-blur-md border-t border-[var(--app-border)] z-50 pb-safe shadow-lg">
        <div className="flex items-center justify-between overflow-x-auto no-scrollbar px-2">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id as any)}
              className={`flex flex-col items-center justify-center min-w-[70px] py-3 gap-1 transition-all ${activeTab === item.id ? "text-[var(--app-accent)]" : "text-[var(--app-text-muted)] hover:text-[var(--app-text)]"}`}
            >
              <div
                className={`p-1.5 rounded-full transition-colors ${activeTab === item.id ? "bg-[var(--app-accent)]/10" : ""}`}
              >
                {item.icon}
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider">
                {item.label}
              </span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
};
