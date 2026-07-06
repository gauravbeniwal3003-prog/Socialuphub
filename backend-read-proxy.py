import re

with open('render_backend.py', 'r') as f:
    code = f.read()

new_endpoint = """
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
        is_admin = user.get("role") == "ADMIN"
        
    if not is_admin:
        if table in ["orders", "transactions", "users"]:
            if not user:
                return jsonify({"error": "Unauthorized"}), 401
            # Force match on user ID
            if table == "users":
                match["id"] = user["id"]
            else:
                match["userId"] = user["id"]
        elif table == "settings":
            pass # allow read
        elif table in ["services", "categories"]:
            match["isEnabled"] = "true" # public can only see enabled ones
            
    # Build query
    params = {}
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
"""

code = code + new_endpoint

with open('render_backend.py', 'w') as f:
    f.write(code)
