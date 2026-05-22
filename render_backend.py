import os
import time
import logging
import threading
import requests
from flask import Flask, request, jsonify
from flask_cors import CORS

# --- CONFIGURATION (Reads from Environment Variables) ---
# Replace with your actual credentials or set them in Render Environment Panel
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://igkrcgcrvnocauccebrf.supabase.co")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlna3JjZ2Nydm5vY2F1Y2NlYnJmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjgzMDU4MCwiZXhwIjoyMDgyNDA2NTgwfQ.-529L2gcgOFrfN_VVZf6tbPyAlnRFQNQjPBOk8aGwpI")
SMM_API_KEY = os.environ.get("SMM_API_KEY", "38086716603a82e68be330924e7327c7e130df7d")
SMM_API_URL = os.environ.get("SMM_API_URL", "https://safesmmpanel.com/api/v2")

# Configure Logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s'
)
logger = logging.getLogger("SocialUpHub-Render-Backend")

app = Flask(__name__)
CORS(app)  # Enables cross-origin requests from your frontend easily

# --- SUPABASE REST HELPER FUNCTIONS ---
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
                    elif "error" in res:
                        err_msg = str(res["error"]).lower()
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
                        
                        # Fatal payload issues
                        is_fatal = any(keyword in err_msg for keyword in ["link", "service", "quantity", "invalid"])
                        if is_fatal:
                            supabase_patch("orders", {"id": f"eq.{order_id}"}, {"error": res["error"]})
                            logger.error(f"Fatal error forwarding Order {order_id}: {res['error']}")
        except Exception as ex:
            logger.error(f"Error during order forwarding cycle: {str(ex)}")
        time.sleep(10)  # Recheck every 10 seconds

def sync_active_statuses_loop():
    logger.info("Background Status-Sync thread started.")
    while True:
        try:
            # Query active orders that have an external ID and are in progress
            # 'status=in.(Pending,Processing)' retrieves matching statuses in Supabase
            params = {
                "status": "in.(Pending,Processing)",
                "externalId": "not.is.null",
                "limit": 20
            }
            active_orders = supabase_get("orders", params)
            if active_orders:
                logger.info(f"Syncing status for {len(active_orders)} active orders...")
                updated_count = 0
                for order in active_orders:
                    ext_id = order.get("externalId")
                    order_id = order.get("id")
                    
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
def health_check():
    return jsonify({
        "status": "online",
        "service": "SocialUpHub-Autonomous-Python-Backend",
        "supabase_connection": SUPABASE_URL is not None,
        "smm_endpoint": SMM_API_URL
    })

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
