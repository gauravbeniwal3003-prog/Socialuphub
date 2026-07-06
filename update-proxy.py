import re

with open('render_backend.py', 'r') as f:
    code = f.read()

new_proxy = """@app.route("/api/admin/db-proxy", methods=["POST"])
@verify_auth
@verify_admin
def admin_db_proxy():
    data = request.get_json(silent=True) or {}
    table = data.get("table")
    action = data.get("action")
    payload = data.get("payload")
    match = data.get("match")
    
    if not table or not action:
        return jsonify({"error": "Table and action are required."}), 400
        
    try:
        if action == "insert":
            resp = requests.post(f"{SUPABASE_URL}/rest/v1/{table}", headers=get_supabase_headers(), json=payload, timeout=15)
            resp.raise_for_status()
        elif action == "update":
            if not match:
                return jsonify({"error": "Match criteria required for update."}), 400
            filters = {}
            for k, v in match.items():
                if isinstance(v, dict) and "neq" in v:
                    filters[k] = f"neq.{v['neq']}"
                elif isinstance(v, dict) and "in" in v:
                    filters[k] = f"in.({v['in']})"
                else:
                    filters[k] = f"eq.{v}"
            supabase_patch(table, filters, payload)
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
            
        # Audit Log
        admin_ip = request.headers.get("X-Forwarded-For", request.remote_addr)
        tx_payload = {
            "id": f"log_{int(time.time()*1000)}",
            "userId": getattr(request, 'user', {}).get("id"),
            "amount": 0,
            "type": "AUDIT_LOG",
            "status": "SUCCESS",
            "method": admin_ip,
            "utr": f"Admin action: {action} on {table}",
            "date": time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
        }
        requests.post(f"{SUPABASE_URL}/rest/v1/transactions", headers=get_supabase_headers(), json=tx_payload, timeout=15)
        
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500"""

code = re.sub(r"@app.route\(\"/api/admin/db-proxy\", methods=\[\"POST\"\]\).*?return jsonify\(\{\"error\": str\(e\)\}\), 500", new_proxy, code, flags=re.DOTALL)

with open('render_backend.py', 'w') as f:
    f.write(code)
