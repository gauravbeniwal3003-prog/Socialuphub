import re

with open('render_backend.py', 'r') as f:
    code = f.read()

# Replace the insecure fallback
new_payment_logic = """
            rzp_order = razorpay_fetch_order(razorpay_order_id)
            if rzp_order:
                final_amount = float(rzp_order.get("amount", 0.0)) / 100.0
            else:
                return jsonify({"error": "Failed to fetch order from payment gateway."}), 400
"""

code = code.replace("""
            rzp_order = razorpay_fetch_order(razorpay_order_id)
            if rzp_order:
                final_amount = float(rzp_order.get("amount", 0.0)) / 100.0
            else:
                final_amount = float(amount or 0.0)
""", new_payment_logic)

with open('render_backend.py', 'w') as f:
    f.write(code)
