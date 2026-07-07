import os
import time
import logging
import threading
import requests
import base64
import json
import hmac
import hashlib
from functools import wraps
from flask import Flask, request, jsonify
from flask_cors import CORS

# --- CONFIGURATION (Reads from Environment Variables) ---
# Replace with your actual credentials or set them in Render Environment Panel
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
SMM_API_KEY = os.environ.get("SMM_API_KEY", "")
SMM_API_URL = os.environ.get("SMM_API_URL", "https://safesmmpanel.com/api/v2")

# Razorpay Keys
RAZORPAY_KEY = os.environ.get("RAZORPAY_KEY", "rzp_test_rYf3Lq7C8W2oJn")
RAZORPAY_SECRET = os.environ.get("RAZORPAY_SECRET", "4wiJs8mHjvhbes6JRZFd35hT")
RAZORPAY_WEBHOOK_SECRET = os.environ.get("RAZORPAY_WEBHOOK_SECRET", "")

# Configure Logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s'
)
logger = logging.getLogger("SocialUpHub-Render-Backend")

app = Flask(__name__)
# Enable open CORS for API endpoints to prevent preflight blocks on user-deployed custom domains or subdomains
CORS(app, resources={r"/api/*": {"origins": "*"}})

# --- SUPABASE REST HELPER FUNCTIONS ---
def get_supabase_headers_for_upsert():
    h = get_supabase_headers()
    h['Prefer'] = 'resolution=merge-duplicates'
    return h

def get_supabase_headers():
    return {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation"
    }

def supabase_get(table, params):
    try:
        url = f"{SUPABASE_URL}/rest/v1/{table}"
        response = requests.get(url, headers=get_supabase_headers(), params=params, timeout=15)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        logger.error(f"Supabase GET Error on table '{table}': {str(e)}")
        return None

def supabase_rpc(rpc_name, body):
    try:
        url = f"{SUPABASE_URL}/rest/v1/rpc/{rpc_name}"
        response = requests.post(url, headers=get_supabase_headers(), json=body, timeout=15)
        response.raise_for_status()
        return response.json() or True
    except Exception as e:
        logger.error(f"Supabase RPC Error \"{rpc_name}\": {str(e)}")
        return False

def supabase_patch(table, filters, body):
    try:
        url = f"{SUPABASE_URL}/rest/v1/{table}"
        response = requests.patch(url, headers=get_supabase_headers(), params=filters, json=body, timeout=15)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        logger.error(f"Supabase PATCH Error on table '{table}': {str(e)}")
        return None

def supabase_delete(table, filters):
    try:
        url = f"{SUPABASE_URL}/rest/v1/{table}"
        response = requests.delete(url, headers=get_supabase_headers(), params=filters, timeout=15)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        logger.error(f"Supabase DELETE Error on table '{table}': {str(e)}")
        return None

# ============================================================================
# SECURITY HARDENING: THREAD-SAFE CONCURRENCY LOCKS & RPC DATABASE FALLBACKS
# ============================================================================

_user_locks = {}
_user_locks_mutex = threading.Lock()

def get_user_lock(user_id):
    with _user_locks_mutex:
        if user_id not in _user_locks:
            _user_locks[user_id] = threading.Lock()
        return _user_locks[user_id]

def secure_decrement_balance(user_id, amount):
    # Try the real RPC first
    success = supabase_rpc("decrement_balance", {"user_id": user_id, "amount": amount})
    if success:
        return True
        
    logger.info(f"[Security] rpc.decrement_balance failed. Using python-locked fallback for user {user_id}.")
    lock = get_user_lock(user_id)
    with lock:
        user_list = supabase_get("users", {"id": f"eq.{user_id}"})
        if not user_list:
            return False
        user = user_list[0]
        curr_bal = float(user.get("balance") or 0.0)
        if curr_bal < amount:
            return False
            
        new_bal = round(curr_bal - amount, 2)
        new_spent = round(float(user.get("totalSpent") or 0.0) + amount, 2)
        
        supabase_patch("users", {"id": f"eq.{user_id}"}, {"balance": new_bal, "totalSpent": new_spent})
        return True

def secure_increment_balance(user_id, amount):
    res = supabase_rpc("increment_balance", {"user_id": user_id, "amount": amount})
    if res is not False and res is not None:
        return float(res) if isinstance(res, (int, float)) else True
        
    logger.info(f"[Security] rpc.increment_balance failed. Using python-locked fallback for user {user_id}.")
    lock = get_user_lock(user_id)
    with lock:
        user_list = supabase_get("users", {"id": f"eq.{user_id}"})
        if not user_list:
            raise Exception("User not found in fallback increment_balance")
        user = user_list[0]
        curr_bal = float(user.get("balance") or 0.0)
        new_bal = round(curr_bal + amount, 2)
        supabase_patch("users", {"id": f"eq.{user_id}"}, {"balance": new_bal})
        return new_bal

def secure_use_coupon(coupon_code, user_id):
    success = supabase_rpc("use_coupon", {"coupon_code": coupon_code, "user_id": user_id})
    if success:
        return True
        
    logger.info(f"[Security] rpc.use_coupon failed. Using python-locked fallback for coupon {coupon_code}.")
    lock = get_user_lock(f"coupon_{coupon_code}")
    with lock:
        c_list = supabase_get("coupons", {"code": f"eq.{coupon_code}"})
        if not c_list:
            return False
        c = c_list[0]
        if not c.get("isEnabled"):
            return False
            
        if c.get("expiryDate"):
            try:
                expiry_str = c.get("expiryDate").replace('Z', '')
                expiry_struct = time.strptime(expiry_str.split('.')[0], "%Y-%m-%dT%H:%M:%S" if 'T' in expiry_str else "%Y-%m-%d %H:%M:%S")
                if time.mktime(expiry_struct) < time.time():
                    return False
            except Exception:
                return False
                
        used_by = c.get("usedBy") or []
        if not isinstance(used_by, list):
            used_by = []
            
        limit = int(c.get("usageLimit") or 0)
        if limit > 0 and len(used_by) >= limit:
            return False
            
        if user_id in used_by:
            return False
            
        new_used_by = used_by + [user_id]
        supabase_patch("coupons", {"code": f"eq.{coupon_code}"}, {"usedBy": new_used_by})
        return True

def secure_add_referral_commission(referrer_id, commission):
    success = supabase_rpc("add_referral_commission", {"referrer_id": referrer_id, "commission": commission})
    if success:
        return True
        
    logger.info(f"[Security] rpc.add_referral_commission failed. Using python-locked fallback for referrer {referrer_id}.")
    lock = get_user_lock(referrer_id)
    with lock:
        user_list = supabase_get("users", {"id": f"eq.{referrer_id}"})
        if not user_list:
            return False
        user = user_list[0]
        curr_ref_bal = float(user.get("referral_balance") or 0.0)
        curr_ref_earn = float(user.get("total_referral_earnings") or 0.0)
        
        new_ref_bal = round(curr_ref_bal + commission, 2)
        new_ref_earn = round(curr_ref_earn + commission, 2)
        
        supabase_patch("users", {"id": f"eq.{referrer_id}"}, {"referral_balance": new_ref_bal, "total_referral_earnings": new_ref_earn})
        return True

# --- SMM PROVIDER CALLER ---
def call_smm_provider(action, **kwargs):
    payload = {
        'key': SMM_API_KEY,
        'action': action
    }
    payload.update(kwargs)
    
    headers = {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/4.0 (compatible; MSIE 5.01; Windows NT 5.0)',
        'Accept': 'application/json'
    }
    
    try:
        # We verify ssl=False if target uses standard self-signed/WAF configurations
        response = requests.post(SMM_API_URL, data=payload, headers=headers, timeout=30, verify=False)
        response.raise_for_status()
        
        try:
            return response.json()
        except requests.exceptions.JSONDecodeError:
            # Handle standard error HTML responses gracefully
            if response.text.strip().startswith('<'):
                return {"error": "Server is maintaining or busy. (HTML Error Status)"}
            return {"error": "Invalid format response", "details": response.text[:100]}
    except Exception as e:
        logger.error(f"SMM API Provider connection error: {str(e)}")
        return {"error": str(e)}

# --- STATUS NORMALIZATION ---
def normalize_status(status_str):
    if not status_str:
        return 'Processing'
    s = str(status_str).lower().strip()
    if s in ['completed', 'success', 'complete']:
        return 'Completed'
    if s in ['processing', 'in progress', 'active']:
        return 'Processing'
    if s == 'pending':
        return 'Pending'
    if s in ['canceled', 'cancelled']:
        return 'Canceled'
    if s in ['partial', 'partially completed']:
        return 'Partial'
    if s in ['failed', 'fail', 'error']:
        return 'Failed'
    return 'Processing'

# --- AUTOMATIC RECHECK & PROCESSING LOOPS ---
def forward_pending_orders_loop():
    logger.info("Background Order-Forwarder thread started.")
    while True:
        try:
            params = {
                "status": "eq.Pending",
                "externalId": "is.null",
                "error": "is.null",
                "limit": 10
            }
            pending = supabase_get("orders", params)
            if pending:
                logger.info(f"Checking queue: Found {len(pending)} pending orders to process.")
                for order in pending:
                    order_id = order.get("id")
                    
                    # Atomic lock: Only update to SENDING_PROVIDER if externalId is still null
                    lock_acquired = supabase_patch("orders", {
                        "id": f"eq.{order_id}",
                        "externalId": "is.null"
                    }, {"externalId": "SENDING_PROVIDER"})
                    
                    if not lock_acquired:
                        # Lock failed (already being forwarded by another process/thread)
                        continue
                        
                    logger.info(f"Forwarding Order {order_id} to provider...")
                    
                    res = call_smm_provider(
                        action='add',
                        service=order.get("serviceId"),
                        link=order.get("link"),
                        quantity=order.get("quantity")
                    )
                    
                    provider_id = res.get("order") or res.get("order_id")
                    if provider_id:
                        supabase_patch("orders", {"id": f"eq.{order_id}"}, {"externalId": str(provider_id)})
                        logger.info(f"Order {order_id} completed forwarding. Provider Link ID: {provider_id}")
                    else:
                        err_msg = str(res.get("error", "")).lower()
                        
                        # Advanced Duplicate Check
                        if "duplicate" in err_msg or "already exists" in err_msg:
                            logger.warn(f"Duplicate order warning for {order_id}. Querying SMM history...")
                            history = call_smm_provider(action='orders')
                            if isinstance(history, list):
                                found = False
                                for hist_order in history:
                                    if str(hist_order.get("link")) == str(order.get("link")) and str(hist_order.get("service")) == str(order.get("serviceId")):
                                        matched_id = hist_order.get("order")
                                        if matched_id:
                                            supabase_patch("orders", {"id": f"eq.{order_id}"}, {"externalId": str(matched_id)})
                                            logger.info(f"Resolved duplicate successfully. Re-linked to ID: {matched_id}")
                                            found = True
                                            break
                                if found:
                                    continue
                        
                        # Fatal payload issues vs. transient rate limits
                        is_fatal = not res.get("error") or any(keyword in err_msg for keyword in ["link", "service", "quantity", "invalid", "incorrect"])
                        if is_fatal:
                            # Refund the user
                            user_id = order.get("userId")
                            user_list = supabase_get("users", {"id": f"eq.{user_id}"})
                            if user_list:
                                user = user_list[0]
                                refund_amt = float(order.get("charge", 0.0))
                                new_bal = round((float(user.get("balance", 0.0)) + refund_amt), 2)
                                supabase_patch("users", {"id": f"eq.{user_id}"}, {"balance": new_bal})
                                # Log refund
                                tx_payload = {
                                    "id": f"ref_bg_py_{int(time.time()*1000)}",
                                    "userId": user_id,
                                    "amount": refund_amt,
                                    "type": "REFUND",
                                    "status": "SUCCESS",
                                    "method": "SYSTEM",
                                    "utr": f"Refund for Failed API Order #{order_id} ({res.get('error')})",
                                    "date": time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
                                }
                                requests.post(f"{SUPABASE_URL}/rest/v1/transactions", headers=get_supabase_headers(), json=tx_payload, timeout=15)
                            supabase_patch("orders", {"id": f"eq.{order_id}"}, {"status": "Failed", "error": res.get("error", "Unknown Error"), "externalId": None})
                            logger.error(f"Fatal error forwarding Order {order_id}: {res.get('error')}")
                        else:
                            # Transient error (rate limits, proxy error, network timeout). Release lock to retry later!
                            supabase_patch("orders", {"id": f"eq.{order_id}"}, {"externalId": None})
                            logger.warn(f"Transient error forwarding Order {order_id}: {res.get('error')}. Lock released for retry.")
        except Exception as ex:
            logger.error(f"Error during order forwarding cycle: {str(ex)}")
        time.sleep(10)  # Recheck every 10 seconds

def sync_active_statuses_loop():
    logger.info("Background Status-Sync thread started.")
    while True:
        try:
            # Query active orders that have an external ID and are in progress
            params = {
                "status": "in.(Pending,Processing)",
                "externalId": "not.is.null",
                "externalId": "not.eq.SENDING_PROVIDER",
                "limit": 100 # Batch up to 100 active orders
            }
            active_orders = supabase_get("orders", params)
            if active_orders:
                ext_ids = [o.get("externalId") for o in active_orders if o.get("externalId") and o.get("externalId") != "SENDING_PROVIDER"]
                if not ext_ids:
                    time.sleep(30)
                    continue
                
                logger.info(f"Syncing status for {len(active_orders)} active orders using batched query...")
                
                # Make a single batched status query to SMM API
                batch_res = None
                try:
                    batch_res = call_smm_provider(action='status', orders=','.join(ext_ids))
                except Exception as batch_err:
                    logger.warn(f"Batched status query failed, fallback to single calls: {str(batch_err)}")

                updated_count = 0
                for order in active_orders:
                    ext_id = order.get("externalId")
                    order_id = order.get("id")
                    
                    res = None
                    if isinstance(batch_res, dict) and ext_id in batch_res:
                        res = batch_res[ext_id]
                    elif len(ext_ids) == 1 and isinstance(batch_res, dict) and "status" in batch_res:
                        res = batch_res
                    else:
                        # Fallback to single status request
                        res = call_smm_provider(action='status', order=ext_id)
                        
                    if res and res.get("status"):
                        normalized = normalize_status(res.get("status"))
                        if normalized != order.get("status"):
                            supabase_patch(
                                "orders", 
                                {"id": f"eq.{order_id}"}, 
                                {
                                    "status": normalized,
                                    "remains": res.get("remains", order.get("remains")),
                                    "start_count": res.get("start_count", order.get("start_count"))
                                }
                             )
                            if normalized == "Canceled":
                                # Refund the user
                                user_id = order.get("userId")
                                user_list = supabase_get("users", {"id": f"eq.{user_id}"})
                                if user_list:
                                    user = user_list[0]
                                    refund_amt = float(order.get("charge", 0.0))
                                    new_bal = round((float(user.get("balance", 0.0)) + refund_amt), 2)
                                    supabase_patch("users", {"id": f"eq.{user_id}"}, {"balance": new_bal})
                                    # Log refund
                                    tx_payload = {
                                        "id": f"ref_cancel_py_{int(time.time()*1000)}",
                                        "userId": user_id,
                                        "amount": refund_amt,
                                        "type": "REFUND",
                                        "status": "SUCCESS",
                                        "method": "SYSTEM",
                                        "utr": f"Refund for Cancelled Order #{order_id}",
                                        "date": time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
                                    }
                                    requests.post(f"{SUPABASE_URL}/rest/v1/transactions", headers=get_supabase_headers(), json=tx_payload, timeout=15)
                            elif normalized == "Partial" and res.get("remains") and float(res.get("remains")) > 0:
                                # Partial refund the user
                                remains = float(res.get("remains"))
                                quantity = float(order.get("quantity") or 1.0)
                                refund_ratio = remains / quantity
                                charge = float(order.get("charge", 0.0))
                                refund_amt = round((charge * refund_ratio), 2)
                                if refund_amt > 0:
                                    user_id = order.get("userId")
                                    user_list = supabase_get("users", {"id": f"eq.{user_id}"})
                                    if user_list:
                                        user = user_list[0]
                                        new_bal = round((float(user.get("balance", 0.0)) + refund_amt), 2)
                                        supabase_patch("users", {"id": f"eq.{user_id}"}, {"balance": new_bal})
                                        # Log refund
                                        tx_payload = {
                                            "id": f"ref_part_py_{int(time.time()*1000)}",
                                            "userId": user_id,
                                            "amount": refund_amt,
                                            "type": "REFUND",
                                            "status": "SUCCESS",
                                            "method": "SYSTEM",
                                            "utr": f"Partial Refund for Order #{order_id}",
                                            "date": time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
                                        }
                                        requests.post(f"{SUPABASE_URL}/rest/v1/transactions", headers=get_supabase_headers(), json=tx_payload, timeout=15)
                            updated_count += 1
                if updated_count > 0:
                    logger.info(f"Successfully updated status for {updated_count} active orders.")
        except Exception as ex:
            logger.error(f"Error during status sync cycle: {str(ex)}")
        time.sleep(30)  # Re-sync every 30 seconds

def sync_provider_prices_loop():
    logger.info("Background Provider-Price Sync thread started.")
    while True:
        try:
            logger.info("Checking latest rates from SMM provider...")
            provider_services = call_smm_provider(action='services')
            if isinstance(provider_services, list):
                local_services = supabase_get("services", {"select": "service,rate"})
                if local_services:
                    p_map = {}
                    for ps in provider_services:
                        s_id = str(ps.get("service") or ps.get("package") or ps.get("id", ""))
                        if s_id:
                            rate = float(ps.get("rate") or ps.get("price") or ps.get("cost") or 0.0)
                            p_map[s_id] = rate
                    
                    for ls in local_services:
                        local_id = ls.get("service")
                        local_price = ls.get("rate")
                        prov_price = p_map.get(local_id)
                        
                        if prov_price is not None and prov_price != local_price:
                            supabase_patch("services", {"service": f"eq.{local_id}"}, {"rate": prov_price})
                            logger.info(f"Auto-Sync price: Service {local_id} rate modified to {prov_price}")
        except Exception as ex:
            logger.error(f"Error during price sync cycle: {str(ex)}")
        time.sleep(3600)  # Recheck hourly

def daily_system_cleanup_loop():
    logger.info("Background Cleanup thread started.")
    while True:
        try:
            logger.info("Running daily inactive client cleanup...")
            # Remove users active more than 60 days ago
            sixty_days_ago = time.time() - (60 * 24 * 60 * 60)
            sixty_days_iso = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime(sixty_days_ago))
            
            inactive_params = {
                "lastLogin": f"lt.{sixty_days_iso}",
                "select": "id"
            }
            inactive_users = supabase_get("users", inactive_params)
            
            if inactive_users:
                deleted_usr_count = 0
                for user in inactive_users:
                    uid = user.get("id")
                    supabase_delete("orders", {"userId": f"eq.{uid}"})
                    supabase_delete("transactions", {"userId": f"eq.{uid}"})
                    supabase_delete("users", {"id": f"eq.{uid}"})
                    deleted_usr_count += 1
                logger.info(f"System Cleanup: Purged {deleted_usr_count} inactive users and nested histories.")
                
            # Expiry coupons
            now_iso = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
            expired_coupons = supabase_get("coupons", {"expiryDate": f"lt.{now_iso}", "isEnabled": "eq.true", "select": "code"})
            if expired_coupons:
                for coupon in expired_coupons:
                    code = coupon.get("code")
                    supabase_patch("coupons", {"code": f"eq.{code}"}, {"isEnabled": False})
                logger.info(f"System Cleanup: Disabled {len(expired_coupons)} expired coupons.")
        except Exception as ex:
            logger.error(f"Error during clean up cycle: {str(ex)}")
        time.sleep(86400)  # Run once every 24 hours

# --- SECURE FRONTEND PROXY ENDPOINT ---
@app.route("/api/smm", methods=["POST"])
def smm_proxy():
    """
    Direct, 100% secure proxy mirroring what we built on express.
    No SMM API Key is ever leaked to the user device or client browser!
    """
    data = request.get_json(silent=True) or {}
    action = data.get("action")
    if action == "add":
        return jsonify({"error": "Direct order placement via proxy is disabled. Orders are processed securely by the backend."}), 403
    if not action:
        return jsonify({"error": "Invalid request parameters", "message": "'action' is mandatory."}), 400
    
    # Compile optional parameters securely
    payload_kwargs = {}
    if data.get("service"):
        payload_kwargs["service"] = data.get("service")
    if data.get("link"):
        payload_kwargs["link"] = data.get("link")
    if data.get("quantity"):
        payload_kwargs["quantity"] = data.get("quantity")
    if data.get("order"):
        payload_kwargs["order"] = data.get("order")
        
    smm_res = call_smm_provider(action, **payload_kwargs)
    return jsonify(smm_res)

# App Heat-Check Endpoint
@app.route("/", methods=["GET"])
@app.route("/ping", methods=["GET"])
@app.route("/health", methods=["GET"])
@app.route("/api/health", methods=["GET"])
def health_check():
    return jsonify({
        "status": "online",
        "message": "pong",
        "service": "SocialUpHub-Autonomous-Python-Backend",
        "supabase_connection": SUPABASE_URL is not None
    })


# --- USER PLATFORM SMM API ENDPOINT ---
@app.route("/api/v2", methods=["POST", "GET"])
def smm_user_api():
    """
    User SMM API endpoint. Allows other users' sites to request services,
    check balance, place orders (deducting funds), and retrieve order statuses.
    Supports both standard URL-encoded form posts (default for panel clients) and JSON.
    """
    # Grab data from form or json or args as fallback
    data = {}
    if request.form:
        data = request.form.to_dict()
    elif request.is_json:
        data = request.get_json(silent=True) or {}
    
    # Merge query parameters for maximum client compatibility
    for k, v in request.args.items():
        if k not in data:
            data[k] = v

    api_key = data.get("key")
    action = data.get("action")
    
    if not api_key:
        return jsonify({"error": "Declined: SMM key parameter is missing (param 'key')"}), 200 # SMM clients expect 200 OK with {"error": "..."}
    if not action:
        return jsonify({"error": "Declined: SMM action parameter is missing (param 'action')"}), 200

    # Retrieve user by API Key
    user_list = supabase_get("users", {"api_key": f"eq.{api_key}"})
    if not user_list or len(user_list) == 0:
        return jsonify({"error": "Declined: Invalid API key"}), 200

    user = user_list[0]
    user_id = user.get("id")
    
    if user.get("isBanned"):
        return jsonify({"error": "Declined: Your API user account has been suspended or banned"}), 200

    # 1. BALANCE ACTION
    if action == "balance":
        return jsonify({
            "balance": float(user.get("balance", 0)),
            "currency": "INR"
        })

    # 2. CATEGORIES ACTION
    elif action == "categories":
        categories = supabase_get("categories", {"isEnabled": "eq.true", "order": "sortOrder.asc"}) or []
        return jsonify(categories)

    # 3. SERVICES ACTION
    elif action == "services":
        services = supabase_get("services", {"isEnabled": "eq.true", "order": "sortOrder.asc"}) or []
        categories = supabase_get("categories", {"isEnabled": "eq.true", "order": "sortOrder.asc"}) or []
        
        # Only include services from active categories
        active_cat_names = {cat.get("name") for cat in categories}
        services = [s for s in services if s.get("category") in active_cat_names]
        
        cat_order_map = {cat.get("name"): idx for idx, cat in enumerate(categories)}

        config_data = supabase_get("settings", {"id": "eq.global"})
        config = config_data[0] if config_data else {}
        global_margin_percent = float(config.get("globalMarginPercent") or 0.0)
        global_margin_fixed = float(config.get("globalMarginFixed") or 0.0)
        api_discount = float(config.get("apiDiscountPercent") or 0.0)

        formatted = []
        for s in services:
            # Margin Percent and Margin Fixed
            margin_percent = float(s.get("customMarginPercent")) if s.get("customMarginPercent") is not None else global_margin_percent
            margin_fixed = float(s.get("customMarginFixed")) if s.get("customMarginFixed") is not None else global_margin_fixed

            s_rate = float(s.get("rate") or 0.0)
            if margin_percent:
                s_rate += s_rate * (margin_percent / 100.0)
            if margin_fixed:
                s_rate += margin_fixed

            # Discount applied to the overall final SMM Price
            if api_discount > 0.0:
                s_rate = round(s_rate * (1.0 - api_discount / 100.0), 2)
            else:
                s_rate = round(s_rate, 2)

            min_qty = int(s.get("min") or 10)
            if 0 <= min_qty <= 99:
                min_qty = 100

            formatted.append({
                "service": s.get("service"),
                "name": s.get("name"),
                "category": s.get("category"),
                "rate": s_rate,
                "min": min_qty,
                "max": int(s.get("max") or 10000),
                "type": s.get("type") or "Default",
                "description": s.get("description") or ""
            })

        # Group and sort category-wise dynamically matching category sort order
        def get_sort_key(pair):
            srv_db, srv_f = pair
            cat_name = srv_f.get("category")
            cat_order = cat_order_map.get(cat_name, 9999)
            s_sort_order = float(srv_db.get("sortOrder") or 0.0)
            try:
                srv_id = int(srv_f.get("service") or 0)
            except ValueError:
                srv_id = 999999
            return (cat_order, s_sort_order, srv_id)

        zipped = list(zip(services, formatted))
        zipped.sort(key=get_sort_key)
        formatted = [p[1] for p in zipped]

        return jsonify(formatted)

    # 4. PLACING ORDER ACTION (ADD)
    elif action == "add":
        service_id = str(data.get("service") or "").strip()
        link = str(data.get("link") or "").strip()
        quantity_str = str(data.get("quantity") or "0").strip()
        
        if not service_id:
            return jsonify({"error": "Declined: service parameter is missing or empty"}), 200
        if not link:
            return jsonify({"error": "Declined: link parameter is missing or empty"}), 200
        if not quantity_str or quantity_str == "0":
            return jsonify({"error": "Declined: quantity parameter is missing or empty"}), 200
            
        try:
            quantity = int(quantity_str)
        except ValueError:
            return jsonify({"error": f"Declined: quantity parameter must be a positive integer (received: {quantity_str})"}), 200

        if quantity <= 0:
            return jsonify({"error": "Declined: quantity parameter must be positive"}), 200

        # Retrieve selected service from DB
        srv_list = supabase_get("services", {"service": f"eq.{service_id}"})
        if not srv_list or len(srv_list) == 0:
            return jsonify({"error": f"Declined: Service ID {service_id} could not be found on this platform"}), 200
            
        service = srv_list[0]
        
        # Check if category is enabled
        cat_name = service.get("category")
        cat_check = supabase_get("categories", {"name": f"eq.{cat_name}", "isEnabled": "eq.true"})
        
        if not service.get("isEnabled") or not cat_check:
            return jsonify({"error": f"Declined: Service ID {service_id} is currently disabled or its category is inactive on this platform"}), 200

        min_qty = int(service.get("min") or 10)
        if 0 <= min_qty <= 99:
            min_qty = 100
        max_qty = int(service.get("max") or 10000)
        
        if quantity < min_qty:
            return jsonify({"error": f"Declined: Provided quantity ({quantity}) is less than the minimum required limit of {min_qty} for this service"}), 200
        if quantity > max_qty:
            return jsonify({"error": f"Declined: Provided quantity ({quantity}) exceeds the maximum allowed limit of {max_qty} for this service"}), 200

        # Fetch global margins for calculation
        config_data = supabase_get("settings", {"id": "eq.global"})
        config = config_data[0] if config_data else {}

        # SMM pricing calculations
        margin_percent = float(service.get("customMarginPercent")) if service.get("customMarginPercent") is not None else float(config.get("globalMarginPercent", 20))
        margin_fixed = float(service.get("customMarginFixed")) if service.get("customMarginFixed") is not None else float(config.get("globalMarginFixed", 0))

        rate = float(service.get("rate") or 0.0)
        if margin_percent:
            rate += rate * (margin_percent / 100.0)
        if margin_fixed:
            rate += margin_fixed

        # Apply custom API discount on overall SMM final rate
        api_discount = float(config.get("apiDiscountPercent") or 0.0)
        api_service_rate = rate
        if api_discount > 0:
            api_service_rate = round(rate * (1.0 - api_discount / 100.0), 2)
        else:
            api_service_rate = round(rate, 2)

        charge = round((api_service_rate * quantity) / 1000.0, 2)

        # Safeguard low funds check
        user_bal = float(user.get("balance") or 0.0)
        if user_bal < charge:
            return jsonify({"error": f"Declined: Insufficient funds. Your balance is ₹{user_bal:.2f}, but this order requires ₹{charge:.2f} (Charge per 1k = ₹{api_service_rate:.2f})"}), 200

        # Securely deduct client account balances
        new_bal = round(user_bal - charge, 2)
        new_spent = round(float(user.get("totalSpent") or 0.0) + charge, 2)
        # Securely deduct client account balances via atomic RPC
        success = secure_decrement_balance(user_id, charge)
        if not success:
            return jsonify({"error": "Declined: Insufficient funds or database error."}), 200

        # Generate custom unique ID to satisfy database string primary key constraints
        import random
        import string
        timestamp_ms = int(time.time() * 1000)
        random_suffix = "".join(random.choices(string.ascii_lowercase + string.digits, k=5))
        order_id = f"ord_{timestamp_ms}_{random_suffix}"
        tx_id = f"txn_{timestamp_ms}"

        # Submit actual order to orders database
        order_payload = {
            "id": order_id,
            "userId": user_id,
            "serviceId": service.get("service"),
            "serviceName": service.get("name"),
            "link": link,
            "quantity": quantity,
            "charge": charge,
            "start_count": 0,
            "status": "Pending",
            "date": time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
            "placed_via_api": True,
            "api_user_id": user_id
        }
        
        # Save order records using standard headers
        headers = get_supabase_headers()
        url = f"{SUPABASE_URL}/rest/v1/orders"
        resp = requests.post(url, headers=headers, json=order_payload, timeout=15)
        new_order = resp.json() if resp.status_code in [200, 201] else {}

        # Log spending actions in transactions table
        tx_payload = {
            "id": tx_id,
            "userId": user_id,
            "amount": charge,
            "type": "SPEND",
            "status": "SUCCESS",
            "method": "API_ORDER",
            "date": time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
        }
        requests.post(f"{SUPABASE_URL}/rest/v1/transactions", headers=headers, json=tx_payload, timeout=15)

        ret_order_id = ""
        if isinstance(new_order, dict):
            ret_order_id = new_order.get("id")
        elif isinstance(new_order, list) and len(new_order) > 0:
            ret_order_id = new_order[0].get("id")

        if not ret_order_id:
            ret_order_id = order_id

        return jsonify({
            "order": ret_order_id,
            "status": "Order placed successfully"
        })

    # 5. RETRIEVE ORDER STATUS ACTION
    elif action == "status":
        order_id = data.get("order")
        if not order_id:
            return jsonify({"error": "Declined: Order ID is required (param 'order')"}), 200

        ord_list = supabase_get("orders", {"id": f"eq.{order_id}"})
        if not ord_list or len(ord_list) == 0:
            return jsonify({"error": f"Declined: Order ID {order_id} not found"}), 200

        order = ord_list[0]
        if order.get("userId") != user_id:
            return jsonify({"error": "Declined: Access denied to order detail"}), 200

        return jsonify({
            "status": order.get("status"),
            "start_count": int(order.get("start_count") or 0),
            "remains": int(order.get("remains") or 0),
            "charge": float(order.get("charge") or 0),
            "currency": "INR"
        })

    # 6. RETRIEVE ORDER LOG HISTORY LIST
    elif action == "orders":
        orders = supabase_get("orders", {"userId": f"eq.{user_id}", "placed_via_api": "eq.true", "limit": 50, "order": "date.desc"}) or []
        return jsonify({
            "total_orders_placed": len(orders),
            "orders": [{
                "id": o.get("id"),
                "service_id": o.get("serviceId"),
                "service_name": o.get("serviceName"),
                "link": o.get("link"),
                "charge": float(o.get("charge" or 0)),
                "quantity": int(o.get("quantity" or 0)),
                "status": o.get("status"),
                "date": o.get("date")
            } for o in orders]
        })

    return jsonify({"error": "Declined: Unsupported API action"}), 200


# ==============================================================================
# --- JWT DECODER & AUTHENTICATION MIDDLEWARES ---
# ==============================================================================
def decode_jwt_payload(token):
    try:
        parts = token.split('.')
        if len(parts) >= 2:
            payload_b64 = parts[1]
            padding = '=' * (4 - len(payload_b64) % 4)
            payload_b64 += padding
            decoded_bytes = base64.b64decode(payload_b64)
            return json.loads(decoded_bytes.decode('utf-8'))
    except Exception as e:
        logger.error(f"JWT decode error: {str(e)}")
    return None

def verify_jwt(token):
    if not token or token == 'undefined' or token == 'null':
        return None
    try:
        payload = decode_jwt_payload(token)
        if payload:
            # Enforce minimum iat check to disconnect compromised sessions
            iat = payload.get("iat")
            if iat and isinstance(iat, (int, float)):
                MIN_SESSION_IAT = 1783397700
                if iat < MIN_SESSION_IAT:
                    logger.warning(f"Rejected JWT due to security rotation: {iat} < {MIN_SESSION_IAT}")
                    return None
            user_id = payload.get("sub")
            if user_id:
                user_list = supabase_get("users", {"id": f"eq.{user_id}"})
                if user_list:
                    return user_list[0]
    except Exception as e:
        logger.error(f"verify_jwt error: {str(e)}")
    return None

def verify_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get("Authorization")
        user_id = None
        email = None
        
        req_data = request.get_json(silent=True) or {}
        user_id = req_data.get("userId") or request.args.get("userId")
        
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ")[1]
            if token and token != 'undefined' and token != 'null':
                payload = decode_jwt_payload(token)
                if payload:
                    # Enforce minimum iat check to disconnect compromised sessions
                    iat = payload.get("iat")
                    if iat and isinstance(iat, (int, float)):
                        MIN_SESSION_IAT = 1783397700
                        if iat < MIN_SESSION_IAT:
                            return jsonify({"error": "Session security rotated. Please log out and log in again."}), 401
                    user_id = payload.get("sub", user_id)
                    email = payload.get("email")

        if not user_id:
            return jsonify({"error": "User identification missing. Please log out and log in again."}), 401
            
        user_list = supabase_get("users", {"id": f"eq.{user_id}"})
        user = user_list[0] if user_list else None
        
        if not user and request.path != '/api/sync-user':
            return jsonify({"error": "User not found. Please log out and log in again."}), 401
            
        if user and user.get("isBanned"):
            return jsonify({"error": "User is banned"}), 403
            
        request.user = user or {"id": user_id, "email": email}
        return f(*args, **kwargs)
    return decorated

def verify_admin(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        user = getattr(request, 'user', None)
        if not user:
            return jsonify({"error": "Unauthorized"}), 401
            
        email = user.get("email") if isinstance(user, dict) else None
        if email != 'gauravbeniwal30003@gmail.com' and email != 'gauravbeniwal3003@gmail.com':
            return jsonify({"error": "Forbidden: Master Admin access required."}), 403
            
        return f(*args, **kwargs)
    return decorated


# ==============================================================================
# --- RAZORPAY HELPERS ---
# ==============================================================================
def razorpay_create_order(amount, receipt, notes):
    try:
        url = "https://api.razorpay.com/v1/orders"
        auth = (RAZORPAY_KEY, RAZORPAY_SECRET)
        payload = {
            "amount": int(amount),
            "currency": "INR",
            "receipt": receipt,
            "notes": notes
        }
        res = requests.post(url, auth=auth, json=payload, timeout=15)
        res.raise_for_status()
        return res.json()
    except Exception as e:
        logger.error(f"Razorpay Order Creation Error: {str(e)}")
        return None

def razorpay_fetch_order(order_id):
    try:
        url = f"https://api.razorpay.com/v1/orders/{order_id}"
        auth = (RAZORPAY_KEY, RAZORPAY_SECRET)
        res = requests.get(url, auth=auth, timeout=15)
        res.raise_for_status()
        return res.json()
    except Exception as e:
        logger.error(f"Razorpay Order Fetch Error: {str(e)}")
        return None

def razorpay_fetch_payment(payment_id):
    try:
        url = f"https://api.razorpay.com/v1/payments/{payment_id}"
        auth = (RAZORPAY_KEY, RAZORPAY_SECRET)
        res = requests.get(url, auth=auth, timeout=15)
        res.raise_for_status()
        return res.json()
    except Exception as e:
        logger.error(f"Razorpay Payment Fetch Error: {str(e)}")
        return None

def verify_razorpay_signature(order_id, payment_id, signature):
    try:
        msg = f"{order_id}|{payment_id}"
        generated = hmac.new(
            RAZORPAY_SECRET.encode('utf-8'),
            msg.encode('utf-8'),
            hashlib.sha256
        ).hexdigest()
        return hmac.compare_digest(generated, signature)
    except Exception as e:
        logger.error(f"Razorpay signature verification error: {str(e)}")
        return False


# ==============================================================================
# --- CORE PAYMENT PROCESSOR ---
# ==============================================================================
payment_lock = threading.Lock()

def process_successful_payment(user_id, amount, payment_id, order_id=None, coupon_code=None):
    if not user_id or not amount or not payment_id:
        raise ValueError("Missing critical parameters for payment processing")
        
    with payment_lock:
        existing_tx_list = supabase_get("transactions", {"paymentId": f"eq.{payment_id}"})
        if existing_tx_list:
            for tx in existing_tx_list:
                if tx.get("status") == "SUCCESS":
                    logger.info(f"Payment {payment_id} has already been successfully credited.")
                    return {"success": True, "already_processed": True}
                    
        if order_id:
            existing_order_tx_list = supabase_get("transactions", {"orderId": f"eq.{order_id}", "status": "eq.SUCCESS"})
            if existing_order_tx_list:
                logger.info(f"Order {order_id} was already credited. Ignoring new payment {payment_id}.")
                return {"success": True, "already_processed": True}
                
        pending_txn = None
        if order_id:
            pending_list = supabase_get("transactions", {"orderId": f"eq.{order_id}", "status": "eq.PENDING"})
            if pending_list:
                pending_txn = pending_list[0]
                
        bonus_amount = 0.0
        coupon_applied_successfully = False
        
        if coupon_code:
            clean_code = str(coupon_code).strip().upper()
            c_list = supabase_get("coupons", {"code": f"eq.{clean_code}"})
            if c_list:
                c = c_list[0]
                if c.get("isEnabled") and c.get("category") == "DEPOSIT" and float(amount) >= float(c.get("minAmount") or 0.0):
                    coupon_applied = secure_use_coupon(c.get("code"), user_id)
                    if coupon_applied:
                        coupon_applied_successfully = True
                        c_val = float(c.get("value") or 0.0)
                        if c.get("type") == "PERCENTAGE":
                            bonus_amount = float(amount) * (c_val / 100.0)
                        else:
                            bonus_amount = c_val
                        bonus_amount = round(bonus_amount, 2)
                        
        total_credit = float(amount) + bonus_amount
        total_credit = round(total_credit, 2)
        
        if pending_txn:
            supabase_patch(
                "transactions",
                {"id": f"eq.{pending_txn.get('id')}"},
                {
                    "status": "SUCCESS",
                    "paymentId": payment_id,
                    "amount": total_credit,
                    "utr": f"COUPON:{coupon_code}" if coupon_applied_successfully else pending_txn.get("utr"),
                    "date": time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
                }
            )
        else:
            txn_id = f"txn_{int(time.time() * 1000)}"
            tx_payload = {
                "id": txn_id,
                "userId": user_id,
                "amount": total_credit,
                "type": "DEPOSIT",
                "status": "SUCCESS",
                "method": "RAZORPAY",
                "paymentId": payment_id,
                "orderId": order_id,
                "utr": f"COUPON:{coupon_code}" if coupon_applied_successfully else None,
                "date": time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
            }
            requests.post(f"{SUPABASE_URL}/rest/v1/transactions", headers=get_supabase_headers(), json=tx_payload, timeout=15)
            
        secure_increment_balance(user_id, total_credit)
        supabase_patch("users", {"id": f"eq.{user_id}"}, {"lastPaymentAt": time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())})
        
        logger.info(f"User {user_id} successfully credited {total_credit} INR.")
        return {"success": True, "credited": total_credit}


# ==============================================================================
# --- PLATFORM REST ENDPOINTS ---
# ==============================================================================

@app.route("/api/sync-user", methods=["POST"])
@verify_auth
def sync_user():
    data = request.get_json(silent=True) or {}
    name = data.get("name")
    mobile = data.get("mobile")
    referredByCode = data.get("referredByCode")
    
    user = request.user
    user_id = user.get("id")
    email = user.get("email")
    
    if name and len(str(name)) > 50:
        return jsonify({"error": "Name too long."}), 400
    if mobile and len(str(mobile)) > 15:
        return jsonify({"error": "Mobile too long."}), 400
    if referredByCode and len(str(referredByCode)) > 20:
        return jsonify({"error": "Referral code too long."}), 400
        
    try:
        user_list = supabase_get("users", {"id": f"eq.{user_id}"})
        existing_user = user_list[0] if user_list else None
        
        if existing_user:
            updates = {"lastLogin": time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}
            if name and not existing_user.get("name"):
                updates["name"] = name
            if mobile and not existing_user.get("mobile"):
                updates["mobile"] = mobile
                
            if referredByCode and not existing_user.get("referred_by"):
                ref_list = supabase_get("users", {"referral_code": f"eq.{referredByCode.upper()}"})
                ref_user = ref_list[0] if ref_list else None
                if ref_user and ref_user.get("id") != user_id:
                    updates["referred_by"] = ref_user.get("id")
                    
                    config_data = supabase_get("settings", {"id": "eq.global"})
                    config = config_data[0] if config_data else {}
                    if config.get("isReferralSystemEnabled") and float(config.get("referralSignupBonus") or 0.0) > 0:
                        bonus = float(config.get("referralSignupBonus"))
                        secure_increment_balance(user_id, bonus)
                        tx_payload = {
                            "id": f"ref_sign_{int(time.time() * 1000)}",
                            "userId": user_id,
                            "amount": bonus,
                            "type": "DEPOSIT",
                            "status": "SUCCESS",
                            "method": "REFERRAL",
                            "utr": "Signup Bonus",
                            "date": time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
                        }
                        requests.post(f"{SUPABASE_URL}/rest/v1/transactions", headers=get_supabase_headers(), json=tx_payload, timeout=15)
                        
            updated = supabase_patch("users", {"id": f"eq.{user_id}"}, updates)
            updated_user = updated[0] if updated else existing_user
            return jsonify({"success": True, "user": updated_user})
            
        if name:
            name_check = supabase_get("users", {"name": f"eq.{name}"})
            if name_check:
                return jsonify({"error": "Username is already taken. Please try another."}), 400
        if mobile:
            mobile_check = supabase_get("users", {"mobile": f"eq.{mobile}"})
            if mobile_check:
                return jsonify({"error": "Mobile number is already registered."}), 400
                
        import random
        import string
        referral_code = f"U{user_id[:4]}{''.join(random.choices(string.digits, k=5))}".upper()
        referred_by = None
        
        if referredByCode:
            ref_list = supabase_get("users", {"referral_code": f"eq.{referredByCode.upper()}"})
            ref_user = ref_list[0] if ref_list else None
            if ref_user:
                referred_by = ref_user.get("id")
                
        final_name = name or (email.split('@')[0] if email else "User")
        try:
            name_check = supabase_get("users", {"name": f"eq.{final_name}"})
            if name_check and name_check[0].get("id") != user_id:
                final_name = f"{final_name}_{random.randint(1000, 9999)}"
        except Exception:
            pass
            
        new_user = {
            "id": user_id,
            "email": email or "",
            "name": final_name,
            "mobile": mobile or None,
            "role": "USER",
            "balance": 0,
            "totalSpent": 0,
            "isBanned": False,
            "createdAt": time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
            "lastLogin": time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
            "referral_code": referral_code,
            "referred_by": referred_by,
            "referral_balance": 0,
            "total_referral_earnings": 0
        }
        
        resp = requests.post(f"{SUPABASE_URL}/rest/v1/users", headers=get_supabase_headers(), json=new_user, timeout=15)
        if resp.status_code not in [200, 201]:
            err_json = resp.json() if resp.status_code == 400 else {}
            err_msg = err_json.get("message", "")
            if "users_name_key" in err_msg or "name" in err_msg:
                return jsonify({"error": "Username is already taken."}), 400
            if "users_mobile_key" in err_msg or "mobile" in err_msg:
                return jsonify({"error": "Mobile number is already registered."}), 400
            return jsonify({"error": f"Database error: {resp.text}"}), 400
            
        inserted_user = resp.json()[0] if isinstance(resp.json(), list) else resp.json()
        return jsonify({"success": True, "user": inserted_user})
        
    except Exception as e:
        logger.error(f"Failed to sync user: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route("/api/coupons/verify", methods=["POST"])
@verify_auth
def verify_coupon():
    data = request.get_json(silent=True) or {}
    code = data.get("code")
    category = data.get("category")
    amount = data.get("amount")
    userId = data.get("userId")
    
    if not code or not category or amount is None or not userId:
        return jsonify({"error": "Invalid input"}), 400
        
    if request.user.get("id") != userId:
        return jsonify({"error": "Unauthorized user mismatch"}), 403
        
    try:
        clean_code = str(code).strip().upper()
        coupon_list = supabase_get("coupons", {"code": f"eq.{clean_code}"})
        if not coupon_list:
            return jsonify({"error": "This coupon doesn't exist or expired"}), 400
            
        c = coupon_list[0]
        if not c.get("isEnabled"):
            return jsonify({"error": "This coupon doesn't exist or expired"}), 400
            
        if c.get("expiryDate"):
            try:
                expiry_str = c.get("expiryDate").replace('Z', '')
                expiry_struct = time.strptime(expiry_str.split('.')[0], "%Y-%m-%dT%H:%M:%S" if 'T' in expiry_str else "%Y-%m-%d %H:%M:%S")
                if time.mktime(expiry_struct) < time.time():
                    return jsonify({"error": "This coupon doesn't exist or expired"}), 400
            except Exception as e:
                logger.error(f"Coupon expiry parse error: {str(e)}")
                return jsonify({"error": "This coupon doesn't exist or expired"}), 400
                
        if c.get("category") != category:
            return jsonify({"error": "This coupon doesn't exist or expired"}), 400
            
        if float(amount) < float(c.get("minAmount") or 0.0):
            return jsonify({"error": f"Minimum amount required to use this coupon is {c.get('minAmount')} INR."}), 400
            
        used_by = c.get("usedBy") or []
        if not isinstance(used_by, list):
            used_by = []
            
        if int(c.get("usageLimit") or 0) > 0 and len(used_by) >= int(c.get("usageLimit")):
            return jsonify({"error": "This coupon has reached its usage limit."}), 400
            
        if userId in used_by:
            return jsonify({"error": "You have already used this coupon."}), 400
            
        discount = 0.0
        c_value = float(c.get("value") or 0.0)
        if c.get("type") == 'PERCENTAGE':
            discount = float(amount) * (c_value / 100.0)
        else:
            discount = c_value
            
        discount = min(float(amount), discount)
        discount = round(discount, 2)
        
        return jsonify({
            "success": True,
            "coupon": {
                "code": c.get("code"),
                "type": c.get("type"),
                "value": c_value,
                "discount": discount
            }
        })
    except Exception as e:
        logger.error(f"Coupon verify error: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route("/api/orders/place", methods=["POST"])
@verify_auth
def place_order_endpoint():
    data = request.get_json(silent=True) or {}
    userId = data.get("userId")
    serviceId = str(data.get("serviceId") or "").strip()
    serviceName = data.get("serviceName")
    link = str(data.get("link") or "").strip()
    quantity = data.get("quantity")
    originalCost = data.get("originalCost")
    couponCode = data.get("couponCode")
    
    if not userId or not serviceId or not link or quantity is None:
        return jsonify({"error": "Invalid input"}), 400
        
    try:
        quantity_int = int(quantity)
        if quantity_int <= 0:
            raise ValueError
    except (ValueError, TypeError):
        return jsonify({"error": "Invalid quantity. Quantity must be a positive integer."}), 400
        
    if request.user.get("id") != userId:
        return jsonify({"error": "Unauthorized user mismatch"}), 403
        
    import re
    clean_link = str(link).strip()
    has_html_or_script = bool(re.search(r"<[^>]*>|javascript:|onerror=|onload=|onclick=", clean_link, re.IGNORECASE))
    if has_html_or_script or "<" in clean_link or ">" in clean_link:
        return jsonify({"error": "Invalid link format. HTML tags or script protocols are strictly forbidden."}), 400
        
    try:
        dup_params = {
            "link": f"eq.{clean_link}",
            "serviceId": f"eq.{serviceId}",
            "status": "in.(Pending,Processing)",
            "limit": 1
        }
        dup_orders = supabase_get("orders", dup_params)
        if dup_orders:
            return jsonify({"error": "An active order for this link already exists."}), 400
            
        user = request.user
        if user.get("isBanned"):
            return jsonify({"error": "User is banned"}), 403
            
        srv_list = supabase_get("services", {"service": f"eq.{serviceId}"})
        if not srv_list:
            return jsonify({"error": "Service not found"}), 404
            
        db_service = srv_list[0]
        if db_service.get("isEnabled") is False:
            return jsonify({"error": "This service is currently disabled or unavailable."}), 400

        final_service_name = db_service.get("name") or serviceName or "SMM Service"

        min_qty = int(db_service.get("min") or 10)
        if 0 <= min_qty <= 99:
            min_qty = 100
        max_qty = int(db_service.get("max") or 10000)
        
        if quantity_int < min_qty or quantity_int > max_qty:
            return jsonify({"error": f"Quantity must be between {min_qty} and {max_qty}"}), 400
            
        price = float(db_service.get("rate") or 0.0)
        config_data = supabase_get("settings", {"id": "eq.global"})
        config = config_data[0] if config_data else {}
        
        margin_percent = float(db_service.get("customMarginPercent")) if db_service.get("customMarginPercent") is not None else float(config.get("globalMarginPercent") or 0.0)
        margin_fixed = float(db_service.get("customMarginFixed")) if db_service.get("customMarginFixed") is not None else float(config.get("globalMarginFixed") or 0.0)
        
        if margin_percent:
            price += price * (margin_percent / 100.0)
        if margin_fixed:
            price += margin_fixed
            
        final_cost = (price / 1000.0) * quantity_int
        final_cost = round(final_cost, 2)
        
        if couponCode:
            clean_code = str(couponCode).strip().upper()
            c_list = supabase_get("coupons", {"code": f"eq.{clean_code}"})
            if not c_list:
                return jsonify({"error": "This coupon doesn't exist or expired"}), 400
            c = c_list[0]
            if not c.get("isEnabled"):
                return jsonify({"error": "This coupon doesn't exist or expired"}), 400
            if c.get("expiryDate"):
                try:
                    expiry_str = c.get("expiryDate").replace('Z', '')
                    expiry_struct = time.strptime(expiry_str.split('.')[0], "%Y-%m-%dT%H:%M:%S" if 'T' in expiry_str else "%Y-%m-%d %H:%M:%S")
                    if time.mktime(expiry_struct) < time.time():
                        return jsonify({"error": "This coupon doesn't exist or expired"}), 400
                except Exception:
                    return jsonify({"error": "This coupon doesn't exist or expired"}), 400
            if c.get("category") != 'ORDER':
                return jsonify({"error": "This coupon doesn't exist or expired"}), 400
            if final_cost < float(c.get("minAmount") or 0.0):
                return jsonify({"error": f"Minimum amount required to use this coupon is {c.get('minAmount')} INR."}), 400
                
            coupon_applied = secure_use_coupon(c.get("code"), userId)
            if not coupon_applied:
                return jsonify({"error": "Coupon is invalid, expired, or has reached its usage limit."}), 400
                
            c_val = float(c.get("value") or 0.0)
            if c.get("type") == 'PERCENTAGE':
                final_cost = final_cost - (final_cost * (c_val / 100.0))
            else:
                final_cost = final_cost - c_val
                
            final_cost = max(0.0, final_cost)
            final_cost = round(final_cost, 2)
            
        deducted = secure_decrement_balance(userId, final_cost)
        if not deducted:
            return jsonify({"error": "Insufficient balance."}), 400
        
        import random
        import string
        timestamp_ms = int(time.time() * 1000)
        random_suffix = "".join(random.choices(string.ascii_lowercase + string.digits, k=5))
        order_id = f"ord_{timestamp_ms}_{random_suffix}"
        tx_id = f"txn_{timestamp_ms}"
        
        order_payload = {
            "id": order_id,
            "userId": userId,
            "serviceId": serviceId,
            "serviceName": final_service_name,
            "link": clean_link,
            "quantity": quantity_int,
            "charge": final_cost,
            "status": "Pending",
            "externalId": "SYNC_IN_PROGRESS",
            "remains": quantity_int,
            "date": time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
        }
        resp = requests.post(f"{SUPABASE_URL}/rest/v1/orders", headers=get_supabase_headers(), json=order_payload, timeout=15)
        if resp.status_code not in [200, 201]:
            supabase_patch("users", {"id": f"eq.{userId}"}, {"balance": user_bal})
            return jsonify({"error": "Failed to create order record."}), 500
            
        tx_payload = {
            "id": tx_id,
            "userId": userId,
            "amount": final_cost,
            "type": "SPEND",
            "status": "SUCCESS",
            "method": "ORDER",
            "utr": order_id,
            "date": time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
        }
        requests.post(f"{SUPABASE_URL}/rest/v1/transactions", headers=get_supabase_headers(), json=tx_payload, timeout=15)
        
        referred_by = user.get("referred_by")
        if referred_by and final_cost > 0.0:
            if config.get("isReferralSystemEnabled") and float(config.get("referral_commission_percent") or 0.0) > 0.0:
                comm_pct = float(config.get("referral_commission_percent"))
                commission = round((final_cost * comm_pct) / 100.0, 2)
                if commission > 0.0:
                    secure_add_referral_commission(referred_by, commission)
                    tx_ref_payload = {
                        "id": f"ref_com_{timestamp_ms}_{random.randint(100, 999)}",
                        "userId": referred_by,
                        "amount": commission,
                        "type": "REFERRAL_COMMISSION",
                        "status": "SUCCESS",
                        "method": "REFERRAL",
                        "utr": f"Commission from order #{order_id} by {user.get('name') or 'referred user'}",
                        "date": time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
                    }
                    requests.post(f"{SUPABASE_URL}/rest/v1/transactions", headers=get_supabase_headers(), json=tx_ref_payload, timeout=15)
                    
        try:
            res_provider = call_smm_provider(
                action='add',
                service=serviceId,
                link=clean_link,
                quantity=quantity_int
            )
            provider_id = res_provider.get("order") or res_provider.get("order_id")
            if provider_id:
                supabase_patch("orders", {"id": f"eq.{order_id}"}, {"externalId": str(provider_id), "status": "Processing"})
                return jsonify({"success": True, "orderId": order_id})
            elif "error" in res_provider:
                err_msg = str(res_provider["error"]).lower()
                if "duplicate" in err_msg or "already exists" in err_msg:
                    history = call_smm_provider(action='orders')
                    if isinstance(history, list):
                        for item in history:
                            if str(item.get("link")) == clean_link and str(item.get("service")) == serviceId:
                                match_order = item.get("order")
                                if match_order:
                                    supabase_patch("orders", {"id": f"eq.{order_id}"}, {"externalId": str(match_order), "status": "Processing"})
                                    return jsonify({"success": True, "orderId": order_id})
                                    
                supabase_patch("users", {"id": f"eq.{userId}"}, {"balance": user_bal})
                tx_ref_payload = {
                    "id": f"ref_{timestamp_ms}",
                    "userId": userId,
                    "amount": final_cost,
                    "type": "REFUND",
                    "status": "SUCCESS",
                    "method": "SYSTEM",
                    "utr": f"Refund for Order #{order_id} ({res_provider['error']})",
                    "date": time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
                }
                requests.post(f"{SUPABASE_URL}/rest/v1/transactions", headers=get_supabase_headers(), json=tx_ref_payload, timeout=15)
                supabase_patch("orders", {"id": f"eq.{order_id}"}, {"status": "Failed", "error": res_provider["error"]})
                return jsonify({"error": f"Provider Error: {res_provider['error']}"}), 400
                
        except Exception as e:
            logger.error(f"Sync provider forwarding failed: {str(e)}")
            supabase_patch("orders", {"id": f"eq.{order_id}"}, {"externalId": None})
            
        return jsonify({"success": True, "orderId": order_id})
    except Exception as e:
        logger.error(f"Failed to place order: {str(e)}")
        return jsonify({"error": "Server error"}), 500

@app.route("/api/users/transfer-referral", methods=["POST"])
@verify_auth
def transfer_referral():
    user_id = request.user.get("id")
    try:
        resp = requests.post(
            f"{SUPABASE_URL}/rest/v1/rpc/transfer_referral_balance",
            headers=get_supabase_headers(),
            json={"user_id": user_id},
            timeout=15
        )
        if resp.status_code not in [200, 201]:
            return jsonify({"error": f"RPC failed: {resp.text}"}), 400
            
        transfer_amount = resp.json()
        if not transfer_amount or float(transfer_amount) <= 0.0:
            return jsonify({"error": "No referral earnings to transfer."}), 400
            
        tx_payload = {
            "id": f"ref_out_{int(time.time() * 1000)}",
            "userId": user_id,
            "amount": float(transfer_amount),
            "type": "REFERRAL_PAYOUT",
            "status": "SUCCESS",
            "method": "WALLET_TRANSFER",
            "date": time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
        }
        requests.post(f"{SUPABASE_URL}/rest/v1/transactions", headers=get_supabase_headers(), json=tx_payload, timeout=15)
        
        u_list = supabase_get("users", {"id": f"eq.{user_id}"})
        new_balance = u_list[0].get("balance") if u_list else 0.0
        
        return jsonify({"success": True, "newBalance": new_balance})
    except Exception as e:
        logger.error(f"Transfer referral error: {str(e)}")
        return jsonify({"error": str(e)}), 500


# --- STRICT AUDIT LOGGING & FORENSICS (Python) ---
@app.route("/api/admin/security/logs", methods=["GET"])
@verify_auth
@verify_admin
def admin_security_logs():
    try:
        bans = supabase_get("transactions", {"type": "eq.BANNED_IP", "status": "eq.ACTIVE", "order": "date.desc"})
        return jsonify({"logs": [], "bannedIps": bans or []})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/admin/users/ban", methods=["POST"])
@verify_auth
@verify_admin
def admin_users_ban():
    data = request.get_json(silent=True) or {}
    user_id = data.get("userId")
    action = data.get("action")
    reason = data.get("reason", "Violating terms of service")
    
    if not user_id or action not in ["BAN", "UNBAN"]:
        return jsonify({"error": "Invalid payload"}), 400
        
    try:
        user_list = supabase_get("users", {"id": f"eq.{user_id}"})
        if not user_list:
            return jsonify({"error": "User not found"}), 404
        user_to_ban = user_list[0]
        
        updates = {}
        if action == "BAN":
            updates = {
                "isBanned": True,
                "banReason": reason,
                "banExpires": "2099-12-31T23:59:59Z"
            }
        else:
            updates = {
                "isBanned": False,
                "banReason": None,
                "banExpires": None
            }
            
        supabase_patch("users", {"id": f"eq.{user_id}"}, updates)
        

        
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/admin/db-proxy", methods=["POST"])
@verify_auth
@verify_admin
def admin_db_proxy():
    data = request.get_json(silent=True) or {}
    table = data.get("table")
    action = data.get("action")
    payload = data.get("payload")
    match = data.get("match")
    
    admin_user = request.user
    
    if not table or not action:
        return jsonify({"error": "Table and action are required."}), 400
        
    try:
        if action == "insert":
            if table == "coupons":
                pass
            
            resp = requests.post(f"{SUPABASE_URL}/rest/v1/{table}", headers=get_supabase_headers(), json=payload, timeout=15)
            resp.raise_for_status()
        elif action in ["update", "upsert"]:
            if not match and action == "update":
                return jsonify({"error": "Match criteria required for update."}), 400
            filters = {}
            if match:
                for k, v in match.items():
                    if isinstance(v, dict) and "neq" in v:
                        filters[k] = f"neq.{v['neq']}"
                    elif isinstance(v, dict) and "in" in v:
                        filters[k] = f"in.({v['in']})"
                    else:
                        filters[k] = f"eq.{v}"
            
            if table == "users" and "balance" in payload:
                # Manual balance update by admin
                old_users = supabase_get("users", filters)
                if old_users:
                    old_user = old_users[0]
                    diff = float(payload["balance"]) - float(old_user.get("balance") or 0.0)
                    if diff != 0:
                        log_tx = {
                            "id": f"adm_bal_{int(time.time()*1000)}",
                            "userId": old_user["id"],
                            "amount": abs(diff),
                            "type": "DEPOSIT" if diff > 0 else "SPEND",
                            "status": "SUCCESS",
                            "method": "MANUAL_BY_ADMIN",
                            "utr": f"Admin updated balance (Diff: {'+' if diff > 0 else ''}{diff})",
                            "date": time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
                        }
                        requests.post(f"{SUPABASE_URL}/rest/v1/transactions", headers=get_supabase_headers(), json=log_tx, timeout=5)
            
            if action == "update":
                supabase_patch(table, filters, payload)
            else:
                resp = requests.post(f"{SUPABASE_URL}/rest/v1/{table}", headers=get_supabase_headers_for_upsert(), json=payload, timeout=15)
                resp.raise_for_status()
                
        elif action == "delete":
            if not match:
                return jsonify({"error": "Match criteria required for delete."}), 400
            filters = {}
            for k, v in match.items():
                if isinstance(v, dict) and "neq" in v:
                    filters[k] = f"neq.{v['neq']}"
                elif isinstance(v, dict) and "in" in v:
                    filters[k] = f"in.({v['in']})"
                else:
                    filters[k] = f"eq.{v}"
            supabase_delete(table, filters)
        else:
            return jsonify({"error": f"Unsupported action: {action}"}), 400
            
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/auth/lookup", methods=["POST"])
def auth_lookup():
    data = request.get_json(silent=True) or {}
    action = data.get("action")
    value = data.get("value")
    
    if not action or value is None:
        return jsonify({"error": "Missing parameters"}), 400
        
    try:
        if action == "getEmailByMobile":
            u_list = supabase_get("users", {"mobile": f"eq.{str(value).strip()}"})
            email = u_list[0].get("email") if u_list else None
            return jsonify({"email": email})
            
        if action == "checkUsernameUnique":
            u_list = supabase_get("users", {"name": f"eq.{str(value).strip()}"})
            return jsonify({"unique": not bool(u_list)})
            
        if action == "checkMobileUnique":
            u_list = supabase_get("users", {"mobile": f"eq.{str(value).strip()}"})
            return jsonify({"unique": not bool(u_list)})
            
        return jsonify({"error": "Invalid lookup action"}), 400
    except Exception as e:
        logger.error(f"Auth lookup error: {str(e)}")
        return jsonify({"error": "Server lookup failed"}), 500

@app.route("/api/payments/create-order", methods=["POST"])
@verify_auth
def payments_create_order():
    data = request.get_json(silent=True) or {}
    amount = data.get("amount")
    couponCode = data.get("couponCode")
    
    if amount is None or float(amount) < 1.0:
        return jsonify({"error": "Invalid request parameters"}), 400
        
    user_id = request.user.get("id")
    receipt = f"rcpt_{int(time.time())}_{user_id[:4]}"
    
    try:
        order_id = None
        rzp_order = None
        
        amount_paise = int(round(float(amount) * 100))
        notes = {
            "userId": user_id,
            "couponCode": couponCode or ""
        }
        rzp_order = razorpay_create_order(amount_paise, receipt, notes)
        if rzp_order:
            order_id = rzp_order.get("id")
            
        txn_id = f"txn_{int(time.time() * 1000)}"
        tx_payload = {
            "id": txn_id,
            "userId": user_id,
            "amount": float(amount),
            "type": "DEPOSIT",
            "status": "PENDING",
            "method": "RAZORPAY",
            "orderId": order_id,
            "utr": f"COUPON:{couponCode}" if couponCode else None,
            "date": time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
        }
        requests.post(f"{SUPABASE_URL}/rest/v1/transactions", headers=get_supabase_headers(), json=tx_payload, timeout=15)
        
        if rzp_order:
            return jsonify(rzp_order)
        else:
            return jsonify({
                "id": None,
                "amount": amount_paise,
                "currency": "INR",
                "receipt": receipt,
                "fallback": True
            })
    except Exception as e:
        logger.error(f"Failed to create Razorpay order: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route("/api/payments/verify", methods=["POST"])
@verify_auth
def payments_verify():
    data = request.get_json(silent=True) or {}
    razorpay_order_id = data.get("razorpay_order_id")
    razorpay_payment_id = data.get("razorpay_payment_id")
    razorpay_signature = data.get("razorpay_signature")
    couponCode = data.get("couponCode")
    
    if not razorpay_order_id or not razorpay_payment_id or not razorpay_signature:
        return jsonify({"error": "Invalid payment data"}), 400

    try:
        user_id = request.user.get("id")

        # 1. Fetch pending transaction from database to verify ownership & expected amount
        pending_list = supabase_get("transactions", {"orderId": f"eq.{razorpay_order_id}", "status": "eq.PENDING"})
        if not pending_list:
            logger.warning(f"[Payment Security] Unauthorized/Invalid Order Verification attempt: Order ID {razorpay_order_id} not found as PENDING.")
            return jsonify({"error": "Invalid payment request. No matching pending transaction found."}), 404
            
        pending_txn = pending_list[0]
        if pending_txn.get("userId") != user_id:
            logger.warning(f"[Payment Security] User ID Mismatch! Authenticated User: {user_id}, Pending Transaction User: {pending_txn.get('userId')}")
            return jsonify({"error": "Security Violation: Unauthorized payment verification."}), 403

        # 2. Verify Razorpay Signature
        is_verified = verify_razorpay_signature(razorpay_order_id, razorpay_payment_id, razorpay_signature)
        if not is_verified:
            logger.warning(f"[Payment Security] Signature verification failed for payment {razorpay_payment_id}.")
            return jsonify({"success": False, "error": "Invalid payment signature verification failed."}), 400

        # 3. Double-check directly with Razorpay Provider API to prevent any front-end manipulation
        final_amount = 0.0
        
        # Fetch order details
        rzp_order = razorpay_fetch_order(razorpay_order_id)
        if not rzp_order:
            return jsonify({"error": "Razorpay order not found on provider."}), 400
            
        # Fetch payment details to verify capture status and amount paid
        rzp_payment = razorpay_fetch_payment(razorpay_payment_id)
        if not rzp_payment:
            return jsonify({"error": "Razorpay payment details not found on provider."}), 400

        # Secure server-side validation checks
        if rzp_payment.get("status") not in ["captured", "authorized"]:
            return jsonify({"error": f"Razorpay payment is not captured/authorized. Status: {rzp_payment.get('status')}"}), 400

        if rzp_payment.get("order_id") != razorpay_order_id:
            return jsonify({"error": "Security Mismatch: Payment order ID does not match request order ID."}), 400

        # Verify the paid amount matches the pending transaction's amount (Razorpay amount is in paise)
        expected_amount_paise = int(round(float(pending_txn.get("amount", 0.0)) * 100))
        if abs(float(rzp_payment.get("amount", 0.0)) - expected_amount_paise) > 10: # allow small tolerance
            return jsonify({"error": "Security Mismatch: Paid amount does not match expected transaction amount."}), 400

        final_amount = float(rzp_order.get("amount", 0.0)) / 100.0

        # 4. Process the successful payment securely in the database
        result = process_successful_payment(user_id, final_amount, razorpay_payment_id, razorpay_order_id, couponCode)
        return jsonify(result)
    except Exception as e:
        logger.error(f"Manual verification process failed: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route("/api/payments/webhook", methods=["POST"])
def payments_webhook():
    signature = request.headers.get("X-Razorpay-Signature")
    raw_body = request.get_data()
    
    if RAZORPAY_WEBHOOK_SECRET:
        if not signature:
            logger.error("Missing signature header in webhook.")
            return jsonify({"error": "Missing signature header"}), 400
            
        computed = hmac.new(
            RAZORPAY_WEBHOOK_SECRET.encode('utf-8'),
            raw_body,
            hashlib.sha256
        ).hexdigest()
        
        if not hmac.compare_digest(computed, signature):
            logger.error("Webhook signature verification failed.")
            return jsonify({"error": "Invalid webhook signature"}), 400
    else:
        logger.warning("RAZORPAY_WEBHOOK_SECRET is not configured. Processing without signature check.")
        
    try:
        event_obj = json.loads(raw_body.decode('utf-8'))
        event_name = event_obj.get("event")
        logger.info(f"Processing webhook event: {event_name}")
        
        if event_name in ["payment.captured", "order.paid"]:
            payload = event_obj.get("payload", {})
            payment_entity = payload.get("payment", {}).get("entity", {}) if isinstance(payload.get("payment"), dict) else payload.get("payment", {})
            order_entity = payload.get("order", {}).get("entity", {}) if isinstance(payload.get("order"), dict) else payload.get("order", {})
            
            payment_id = payment_entity.get("id")
            rzp_order_id = payment_entity.get("order_id") or order_entity.get("id")
            
            if not payment_id:
                logger.warn("Missing payment ID in payload.")
                return jsonify({"status": "ignored", "reason": "missing payment id"})
                
            txn = None
            if rzp_order_id:
                tx_list = supabase_get("transactions", {"orderId": f"eq.{rzp_order_id}"})
                txn = tx_list[0] if tx_list else None
                
            user_id = None
            notes = payment_entity.get("notes") or order_entity.get("notes") or {}
            if isinstance(notes, dict):
                user_id = notes.get("userId") or notes.get("user_id")
                
            if not user_id and txn:
                user_id = txn.get("userId")
                
            if not user_id:
                logger.error(f"Could not associate payment {payment_id} with any user.")
                return jsonify({"error": "User association failed"}), 400
                
            raw_amount = float(payment_entity.get("amount") or order_entity.get("amount") or ((txn.get("amount") * 100) if txn else 0))
            amount = raw_amount / 100.0
            
            coupon_code = None
            if isinstance(notes, dict):
                coupon_code = notes.get("couponCode") or notes.get("coupon_code")
            if not coupon_code and txn and txn.get("utr") and txn.get("utr").startswith("COUPON:"):
                coupon_code = txn.get("utr").replace("COUPON:", "")
                
            result = process_successful_payment(user_id, amount, payment_id, rzp_order_id, coupon_code)
            return jsonify({"status": "processed", **result})
            
        return jsonify({"status": "ignored", "event": event_name})
    except Exception as e:
        logger.error(f"Webhook processing error: {str(e)}")
        return jsonify({"error": str(e)}), 500


# ==============================================================================
# --- BOOTSTRAPPING BACKGROUND THREADS ---
def start_threads():
    threading.Thread(target=forward_pending_orders_loop, daemon=True).start()
    threading.Thread(target=sync_active_statuses_loop, daemon=True).start()
    threading.Thread(target=sync_provider_prices_loop, daemon=True).start()
    threading.Thread(target=daily_system_cleanup_loop, daemon=True).start()

# Initialize background tasks on server start
start_threads()

if __name__ == "__main__":
    # Render binds dynamic port to the 'PORT' environment variable
    port = int(os.environ.get("PORT", 3000))
    # We set host to '0.0.0.0' to enable external ingress connections on Render
    app.run(host="0.0.0.0", port=port)

@app.route("/api/db-read", methods=["POST"])
def db_read_proxy():
    # Public or User-authenticated reads
    data = request.get_json(silent=True) or {}
    table = data.get("table")
    match = data.get("match", {})
    limit_val = data.get("limit")
    order_val = data.get("order")
    
    # We will enforce security at the backend level.
    # For a regular user, if they query 'orders' or 'transactions' or 'users', they can only query their own ID unless they are admin.
    auth_header = request.headers.get("Authorization")
    user = None
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]
        user = verify_jwt(token)
        
    is_admin = False
    if user:
        is_admin = user.get("email") in ['gauravbeniwal30003@gmail.com', 'gauravbeniwal3003@gmail.com']
        
    if not is_admin:
        if table == "coupons":
            return jsonify({"error": "Access denied to coupons table"}), 403
        if table in ["orders", "transactions", "users"]:
            if not user:
                return jsonify({"error": "Unauthorized"}), 401
            if table == "users":
                is_own_profile = match.get("id") == user["id"]
                is_referral_query = match.get("referred_by") == user["id"]
                is_referral_code_query = "referral_code" in match
                is_name_query = "name" in match

                if not is_own_profile and not is_referral_query and not is_referral_code_query and not is_name_query:
                    return jsonify({"error": "Forbidden: Unauthorized users table query"}), 403
            else:
                match["userId"] = user["id"]
        elif table == "settings":
            pass # allow read
        elif table in ["services", "categories"]:
            match["isEnabled"] = "true" # public can only see enabled ones
            
    # Build query
    params = {}
    if not is_admin and table == "users":
        is_own_profile = match.get("id") == user["id"] if user else False
        if not is_own_profile:
            params["select"] = "id,name,referral_code,created_at"
    if limit_val:
        params["limit"] = str(limit_val)
    if order_val:
        params["order"] = order_val
        
    for k, v in match.items():
        if isinstance(v, dict):
            if "lt" in v: params[k] = f"lt.{v['lt']}"
            elif "gt" in v: params[k] = f"gt.{v['gt']}"
            elif "neq" in v: params[k] = f"neq.{v['neq']}"
            elif "in" in v: params[k] = f"in.({v['in']})"
            elif "is" in v: params[k] = f"is.{v['is']}"
        else:
            params[k] = f"eq.{v}"
            
    res = supabase_get(table, params)
    return jsonify({"success": True, "data": res if res else []})
