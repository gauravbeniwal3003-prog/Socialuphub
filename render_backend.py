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

# --- AUTH MIDDLEWARE HELPER ---
def verify_auth():
    auth_header = request.headers.get("Authorization")
    if not auth_header:
        return None, jsonify({"error": "Missing authorization header"}), 401
    
    parts = auth_header.split(' ')
    if len(parts) != 2 or parts[0].lower() != 'bearer':
        return None, jsonify({"error": "Invalid authorization header format"}), 401
        
    token = parts[1]
    if not token or token == "null" or token == "undefined":
        return None, jsonify({"error": "Empty or invalid token"}), 401
        
    try:
        url = f"{SUPABASE_URL}/auth/v1/user"
        headers = {
            "apikey": SUPABASE_SERVICE_ROLE_KEY,
            "Authorization": f"Bearer {token}"
        }
        response = requests.get(url, headers=headers, timeout=15)
        if response.status_code != 200:
            err_msg = "Invalid session"
            try:
                err_data = response.json()
                if "error_description" in err_data:
                    err_msg = err_data["error_description"]
                elif "error" in err_data:
                    err_msg = err_data["error"]
            except Exception:
                pass
            return None, jsonify({"error": err_msg}), 401
        
        user_data = response.json()
        return user_data, None, 200
    except Exception as e:
        logger.error(f"Authentication failed in Python: {str(e)}")
        return None, jsonify({"error": "Authentication failed", "details": str(e)}), 401

# --- USER PROFILE SYNC ENDPOINT ---
@app.route("/api/sync-user", methods=["POST", "GET"])
@app.route("/api/sync-user/", methods=["POST", "GET"])
def sync_user():
    if request.method == "GET":
        return jsonify({
            "error": "Method Not Allowed",
            "hint": "The synchronization endpoint requires a POST request, but a GET request was received."
        }), 405

    # Verify authorization token
    user_data, err_resp, err_code = verify_auth()
    if err_resp:
        return err_resp, err_code

    user_id = user_data.get("id")
    email = user_data.get("email")

    if not user_id:
        return jsonify({"error": "Invalid synchronization request: missing user identifier."}), 400

    body = request.get_json(silent=True) or {}
    name = body.get("name")
    mobile = body.get("mobile")
    referred_by_code = body.get("referredByCode")

    try:
        # Check if user already exists
        existing_users = supabase_get("users", {"id": f"eq.{user_id}"})
        
        if existing_users and len(existing_users) > 0:
            existing_user = existing_users[0]
            updates = {"lastLogin": time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}
            if name and not existing_user.get("name"):
                updates["name"] = name
            if mobile and not existing_user.get("mobile"):
                updates["mobile"] = mobile
                
            updated_users = supabase_patch("users", {"id": f"eq.{user_id}"}, updates)
            if updated_users and len(updated_users) > 0:
                return jsonify({"success": True, "user": updated_users[0]})
            return jsonify({"success": True, "user": existing_user})

        # Generate referral code
        import random
        import string
        referral_code = f"U{user_id[:4]}{''.join(random.choices(string.digits, k=5))}".upper()
        
        referred_by = None
        if referred_by_code:
            ref_users = supabase_get("users", {"referral_code": f"eq.{referred_by_code.upper()}"})
            if ref_users and len(ref_users) > 0:
                referred_by = ref_users[0].get("id")

        final_name = name or (email.split('@')[0] if email else "User")
        try:
            name_check = supabase_get("users", {"name": f"eq.{final_name}"})
            if name_check and len(name_check) > 0 and name_check[0].get("id") != user_id:
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

        # Save user to database via POST request using standard headers
        url = f"{SUPABASE_URL}/rest/v1/users"
        headers = get_supabase_headers()
        resp = requests.post(url, headers=headers, json=new_user, timeout=15)
        resp.raise_for_status()
        inserted = resp.json()

        inserted_user = inserted[0] if (isinstance(inserted, list) and len(inserted) > 0) else new_user
        return jsonify({"success": True, "user": inserted_user})

    except Exception as e:
        logger.error(f"Failed to sync user in python backend: {str(e)}")
        return jsonify({
            "error": "Failed to synchronize user profile",
            "details": str(e),
            "hint": "Ensure the database connection is valid and the user model matches standard schema guidelines."
        }), 500

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
        supabase_patch("users", {"id": f"eq.{user_id}"}, {"balance": new_bal, "totalSpent": new_spent})

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

# --- BOOTSTRAPPING BACKGROUND THREADS ---
def start_threads():
    threading.Thread(target=forward_pending_orders_loop, daemon=True).start()
    threading.Thread(target=sync_active_statuses_loop, daemon=True).start()
    threading.Thread(target=sync_provider_prices_loop, daemon=True).start()
    threading.Thread(target=daily_system_cleanup_loop, daemon=True).start()

# Catch-all for unmatched API routes to ensure they never fall through to return HTML
@app.route("/api/<path:path>", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
def api_catch_all(path):
    return jsonify({
        "error": "API Endpoint Not Found",
        "url": request.path,
        "method": request.method,
        "hint": "The requested API endpoint is not registered on this Python backend, or the HTTP method is incorrect."
    }), 404

# Global error handler to guarantee JSON outputs on crash
@app.errorhandler(Exception)
def handle_exception(e):
    from werkzeug.exceptions import HTTPException
    code = 500
    if isinstance(e, HTTPException):
        code = e.code
    
    logger.error(f"Global exception handler caught: {str(e)}")
    return jsonify({
        "error": getattr(e, "description", str(e)) or "Internal Server Error",
        "details": str(e),
        "hint": "Python Flask backend API crash prevention layer"
    }), code

# Initialize background tasks on server start
start_threads()

if __name__ == "__main__":
    # Render binds dynamic port to the 'PORT' environment variable
    port = int(os.environ.get("PORT", 3000))
    # We set host to '0.0.0.0' to enable external ingress connections on Render
    app.run(host="0.0.0.0", port=port)
