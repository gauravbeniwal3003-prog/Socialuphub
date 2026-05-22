import requests
import logging
import json

# Configure professional logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("SocialUpHub-API")

def place_smm_request(api_url, api_key, action, **params):
    """
    Strictly follows Final Safe SMM Panel documentation (key/service standard).
    
    Args:
        api_url (str): The endpoint URL (e.g., https://safesmmpanel.com/api/v2)
        api_key (str): Your unique API key (key)
        action (str): The API action (services, add, status, balance, etc)
        **params: Additional parameters (service, link, quantity, etc.)
    """
    
    # 1. Prepare payload using 'key' as per final documentation
    payload = {
        'key': api_key,
        'action': action,
    }
    
    # Merge additional parameters (Standard naming: service, link, quantity)
    payload.update(params)
    
    # 2. Configure Headers
    # SMM panels strictly require application/x-www-form-urlencoded for POST
    headers = {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'SocialUpHub-Backend/1.0',
        'Accept': 'application/json'
    }
    
    # 3. Configure Proxy (Optional)
    # If using a professional smart proxy, configure it here
    # proxies = {
    #     'http': 'http://username:password@proxy-server:port',
    #     'https': 'http://username:password@proxy-server:port'
    # }
    
    try:
        logger.info(f"Initiating SMM {action} request to {api_url}")
        
        # 4. Execute POST Request (Strict SMM Standard)
        # Using 'data' instead of 'json' ensures form-url-encoding
        response = requests.post(
            api_url,
            data=payload,
            headers=headers,
            # proxies=proxies,
            timeout=30
        )
        
        # 5. Debug Logs (Full Request & Response)
        logger.debug(f"Request Method: POST")
        logger.debug(f"Payload: {payload}")
        logger.info(f"Response Code: {response.status_code}")
        
        # 6. Handle Response
        if response.status_code != 200:
            logger.error(f"SMM API Error: Received status code {response.status_code}")
            return {"error": f"HTTP_{response.status_code}", "message": response.text}
            
        try:
            data = response.json()
            
            # Check for SW1Z or similar provider-side logic errors
            if isinstance(data, dict) and 'error' in data:
                logger.warning(f"SMM Provider returned an error: {data['error']}")
                
            return data
            
        except json.JSONDecodeError:
            logger.error(f"Failed to decode SMM Provider response: {response.text}")
            return {"error": "INVALID_JSON", "raw": response.text}
            
    except requests.exceptions.RequestException as e:
        logger.error(f"SMM API Connection Failed: {str(e)}")
        return {"error": "CONNECTION_FAILED", "details": str(e)}

# --- EXAMPLE USAGE ---
if __name__ == "__main__":
    # Test credentials (replace with environment variables in production)
    API_URL = "https://safesmmpanel.com/api/v2"
    API_KEY = "38086716603a82e68be330924e7327c7e130df7d"
    
    # 1. Example: Place Order (add)
    # order_result = place_smm_request(
    #     API_URL, 
    #     API_KEY, 
    #     action='add', 
    #     service='1', 
    #     link='https://www.instagram.com/p/...', 
    #     quantity=100
    # )
    # print(json.dumps(order_result, indent=4))
    
    # 2. Example: Check Status (status)
    status_result = place_smm_request(API_URL, API_KEY, action='status', order='12345')
    print("Example Status Response:", status_result)
