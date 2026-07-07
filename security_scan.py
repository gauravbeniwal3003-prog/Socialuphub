#!/usr/bin/env python3
"""
Advanced Website Security Testing Tool
For Termux - Professional Grade Security Scanner
Version: 3.2.0 - Built-in Urllib Optimized (No Dependencies Required)
"""

import os
import sys
import re
import time
import json
import socket
import urllib.request
import urllib.parse
from datetime import datetime
from typing import Dict, List, Tuple, Optional, Any

# ==================== GROQ API CLIENT ====================

class GroqAPIClient:
    """Lightweight Groq API client using built-in urllib"""
    
    def __init__(self):
        self.api_key = "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"
        self.base_url = "https://api.groq.com/openai/v1/chat/completions"
        self.enabled = True if self.api_key else False
    
    def analyze(self, prompt: str) -> Optional[str]:
        """Send analysis request to Groq API"""
        if not self.enabled:
            return None
        
        try:
            payload = {
                "model": "llama3-70b-8192",
                "messages": [
                    {
                        "role": "system",
                        "content": "You are a professional security analyst with expertise in web application security testing."
                    },
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                "temperature": 0.3,
                "max_tokens": 4000
            }
            
            req = urllib.request.Request(
                self.base_url,
                data=json.dumps(payload).encode('utf-8'),
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json"
                },
                method="POST"
            )
            
            with urllib.request.urlopen(req, timeout=30) as response:
                if response.status == 200:
                    result = json.loads(response.read().decode('utf-8'))
                    return result['choices'][0]['message']['content']
                else:
                    print(f"[!] Groq API status error: {response.status}")
                    return None
                    
        except Exception as e:
            print(f"[!] Groq API error: {e}")
            return None

# ==================== SECURITY TESTER CLASS ====================

class SecurityTester:
    """Main Security Testing Class - Lightweight & Built-in Library Only"""
    
    def __init__(self, target_url: str):
        self.target = target_url
        parsed_target = urllib.parse.urlparse(target_url)
        self.base_domain = parsed_target.netloc or 'localhost'
        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
        }
        
        self.vulnerabilities = []
        self.scan_results = {
            'sql_injection': [],
            'xss': [],
            'command_injection': [],
            'security_headers': {},
            'authentication': {},
            'port_scan': [],
            'csrf': [],
            'directory_traversal': [],
            'vulnerabilities': []
        }
        
        self.logs = []
        self.crawled_urls = set()
        self.forms = []
        self.parameters = set()
        self.cookies = {}
        self.groq_client = GroqAPIClient()
    
    def log(self, message: str, level: str = "INFO"):
        """Log messages with timestamp"""
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        log_entry = f"[{timestamp}] [{level}] {message}"
        self.logs.append(log_entry)
        print(log_entry)
    
    def make_request(self, url: str, method: str = "GET", data: Dict = None, 
                    params: Dict = None, allow_redirects: bool = True, timeout: int = 15):
        """Make HTTP request with standard urllib"""
        try:
            if params:
                query_string = urllib.parse.urlencode(params)
                url = f"{url}?{query_string}" if "?" not in url else f"{url}&{query_string}"
                
            req_data = None
            if data:
                req_data = urllib.parse.urlencode(data).encode('utf-8')
                
            req = urllib.request.Request(
                url,
                data=req_data,
                headers=self.headers,
                method=method.upper()
            )
            
            with urllib.request.urlopen(req, timeout=timeout) as response:
                content = response.read().decode('utf-8', errors='ignore')
                return {
                    'text': content,
                    'headers': dict(response.info()),
                    'status': response.status,
                    'url': response.url
                }
        except Exception as e:
            return None
            
    def extract_simple_inputs(self, html: str) -> List[Dict]:
        """Parse inputs using simple regex safely"""
        inputs = []
        input_tags = re.findall(r'<input\s+([^>]*?)>', html, re.IGNORECASE)
        for tag in input_tags:
            name_match = re.search(r'name=["\'](.*?)["\']', tag, re.IGNORECASE)
            type_match = re.search(r'type=["\'](.*?)["\']', tag, re.IGNORECASE)
            value_match = re.search(r'value=["\'](.*?)["\']', tag, re.IGNORECASE)
            
            inputs.append({
                'name': name_match.group(1) if name_match else '',
                'type': type_match.group(1) if type_match else 'text',
                'value': value_match.group(1) if value_match else ''
            })
        return inputs
        
    def extract_forms_regex(self, html: str, base_url: str) -> List[Dict]:
        """Extract forms using regular expressions to bypass bs4 dependency"""
        forms = []
        form_blocks = re.findall(r'<form\s+([^>]*?)>(.*?)</form>', html, re.DOTALL | re.IGNORECASE)
        for attribs, body in form_blocks:
            action_match = re.search(r'action=["\'](.*?)["\']', attribs, re.IGNORECASE)
            method_match = re.search(r'method=["\'](.*?)["\']', attribs, re.IGNORECASE)
            
            action = action_match.group(1) if action_match else ''
            action = urllib.parse.urljoin(base_url, action) if action else base_url
            method = method_match.group(1).upper() if method_match else 'GET'
            
            inputs = self.extract_simple_inputs(body)
            forms.append({
                'action': action,
                'method': method,
                'inputs': inputs,
                'original': body
            })
        return forms
    
    def analyze_landing_page(self):
        """Analyze landing page for vulnerabilities"""
        self.log("Analyzing landing page...", "INFO")
        response = self.make_request(self.target)
        if not response:
            self.log("Failed to access landing page", "ERROR")
            return False
            
        self.analyze_security_headers(response['headers'])
        
        # Extract forms
        self.forms = self.extract_forms_regex(response['text'], self.target)
        self.log(f"Found {len(self.forms)} forms on landing page", "INFO")
        
        # Extract links
        links = re.findall(r'href=["\'](https?://.*?)["\']', response['text'], re.IGNORECASE)
        self.crawled_urls.update(links[:30])
        self.log(f"Found {len(links)} links on landing page", "INFO")
        
        # Extract parameters
        for link in links:
            parsed = urllib.parse.urlparse(link)
            if parsed.query:
                params = urllib.parse.parse_qs(parsed.query)
                for param in params.keys():
                    self.parameters.add(param)
        
        # Add basic dummy params for scan test if none found
        if not self.parameters:
            self.parameters.add('id')
            self.parameters.add('q')
            self.parameters.add('ref')
        
        # Test SQL injection on some parameters
        self.log(f"Testing parameters for SQL injection...", "INFO")
        for param in list(self.parameters)[:3]:
            self.test_sql_injection_parameter(self.target, param)
        
        # Test forms
        for form in self.forms[:3]:
            self.test_form_vulnerabilities(form)
        
        return True
    
    def analyze_security_headers(self, headers):
        """Analyze security headers"""
        self.log("Analyzing security headers...", "INFO")
        security_headers = {
            'strict-transport-security': 'HSTS',
            'content-security-policy': 'CSP',
            'x-frame-options': 'Clickjacking Protection',
            'x-content-type-options': 'MIME Sniffing Protection',
            'x-xss-protection': 'XSS Protection',
            'referrer-policy': 'Referrer Policy',
            'permissions-policy': 'Permissions Policy'
        }
        
        missing_headers = []
        lower_headers = {k.lower(): v for k, v in headers.items()}
        for header, description in security_headers.items():
            if header in lower_headers:
                self.log(f"✓ {description}: {lower_headers[header]}", "SUCCESS")
                self.scan_results['security_headers'][header] = lower_headers[header]
            else:
                self.log(f"✗ Missing {description} ({header})", "WARNING")
                missing_headers.append(header)
                self.scan_results['security_headers'][header] = 'MISSING'
        
        if missing_headers:
            self.vulnerabilities.append({
                'type': 'Missing Security Headers',
                'details': f"Missing headers: {', '.join(missing_headers)}",
                'severity': 'Medium',
                'url': self.target
            })
            
    def test_sql_injection_parameter(self, url: str, parameter: str):
        """Test parameter for SQL injection"""
        sql_payloads = ["'", "''", "')"]
        for payload in sql_payloads:
            try:
                params = {parameter: payload}
                response = self.make_request(url, params=params)
                if response and self.detect_sql_error(response['text']):
                    self.log(f"Potential SQL injection found in '{parameter}' with payload: {payload}", "FINDING")
                    self.vulnerabilities.append({
                        'type': 'SQL Injection',
                        'parameter': parameter,
                        'payload': payload,
                        'url': url,
                        'severity': 'Critical',
                        'details': f"Vulnerable parameter: {parameter} on URL {url}"
                    })
                    return True
            except:
                pass
        return False
        
    def detect_sql_error(self, text: str) -> bool:
        sql_errors = ["SQL syntax", "mysql_fetch_array", "You have an error in your SQL syntax", "Unclosed quotation mark"]
        for error in sql_errors:
            if error.lower() in text.lower():
                return True
        return False
        
    def test_form_vulnerabilities(self, form):
        """Test form for XSS"""
        xss_payloads = ["<script>alert(1)</script>", "<img src=x onerror=alert(1)>"]
        for input_field in form['inputs']:
            input_name = input_field['name']
            if not input_name:
                continue
            for payload in xss_payloads:
                try:
                    test_data = {input_name: payload}
                    if form['method'] == 'POST':
                        response = self.make_request(form['action'], method="POST", data=test_data)
                    else:
                        response = self.make_request(form['action'], params=test_data)
                        
                    if response and payload in response['text']:
                        self.log(f"Potential XSS vulnerability in '{input_name}'", "FINDING")
                        self.vulnerabilities.append({
                            'type': 'XSS',
                            'parameter': input_name,
                            'payload': payload,
                            'url': form['action'],
                            'severity': 'High',
                            'details': f"Form input field '{input_name}' reflects payload directly."
                        })
                        break
                except:
                    pass
                    
    def test_command_injection(self):
        """Test command injection"""
        self.log("Testing command injection...", "INFO")
        command_payloads = ["; ls", "| ls"]
        for param in list(self.parameters)[:3]:
            for payload in command_payloads:
                try:
                    params = {param: payload}
                    response = self.make_request(self.target, params=params)
                    if response and ("bin/" in response['text'] or "root:" in response['text']):
                        self.log(f"Command injection detected in '{param}'", "FINDING")
                        self.vulnerabilities.append({
                            'type': 'Command Injection',
                            'parameter': param,
                            'payload': payload,
                            'url': self.target,
                            'severity': 'Critical',
                            'details': f"Executed commands via parameter '{param}'."
                        })
                        break
                except:
                    pass
                    
    def test_directory_traversal(self):
        """Test directory traversal"""
        self.log("Testing directory traversal...", "INFO")
        payloads = ["../../../../etc/passwd", "..\\..\\..\\win.ini"]
        for param in list(self.parameters)[:3]:
            for payload in payloads:
                try:
                    params = {param: payload}
                    response = self.make_request(self.target, params=params)
                    if response and ("root:x:" in response['text'] or "[extensions]" in response['text']):
                        self.log(f"Directory traversal detected in '{param}'", "FINDING")
                        self.vulnerabilities.append({
                            'type': 'Directory Traversal',
                            'parameter': param,
                            'payload': payload,
                            'url': self.target,
                            'severity': 'High',
                            'details': f"Accessed restricted file via traversal on '{param}'."
                        })
                        break
                except:
                    pass
                    
    def perform_port_scan(self):
        """Socket-based port scan"""
        self.log("Performing local port scan...", "INFO")
        common_ports = [80, 443, 3000, 3306, 5432, 8080]
        parsed = urllib.parse.urlparse(self.target)
        host = parsed.hostname or '127.0.0.1'
        for port in common_ports:
            try:
                sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                sock.settimeout(0.5)
                result = sock.connect_ex((host, port))
                if result == 0:
                    self.log(f"Port {port}/tcp: open", "SUCCESS")
                    self.scan_results['port_scan'].append({
                        'port': port,
                        'state': 'open',
                        'service': 'HTTP' if port in [80, 443, 3000, 8080] else 'Database'
                    })
                sock.close()
            except:
                pass
                
    def run_full_scan(self):
        """Run scan pipeline"""
        self.log("="*70, "INFO")
        self.log(f"Starting Security Scan against {self.target}", "SUCCESS")
        self.log("="*70, "INFO")
        
        self.analyze_landing_page()
        self.test_command_injection()
        self.test_directory_traversal()
        self.perform_port_scan()
        
        # AI analysis via Groq
        ai_analysis = None
        if self.groq_client.enabled:
            self.log("Performing AI Security Analysis using Groq...", "INFO")
            summary = {
                'target': self.target,
                'vulnerabilities_count': len(self.vulnerabilities),
                'vulnerabilities': self.vulnerabilities,
                'security_headers': self.scan_results['security_headers'],
                'open_ports': self.scan_results['port_scan']
            }
            prompt = f"Analyze these website security scan results and provide a comprehensive security report.\n\nSCAN RESULTS:\n{json.dumps(summary, indent=2)}\n\nPlease provide: Executive Summary, Vulnerability Analysis, Recommendations, and a Risk Assessment Score (1-10)."
            ai_analysis = self.groq_client.analyze(prompt)
            
        # Generate HTML report
        self.generate_report(ai_analysis)
        
        # Write clean JSON output for easy parsing
        report_json = {
            'target': self.target,
            'timestamp': datetime.now().isoformat(),
            'vulnerabilities_count': len(self.vulnerabilities),
            'vulnerabilities': self.vulnerabilities,
            'security_headers': self.scan_results['security_headers'],
            'open_ports': self.scan_results['port_scan'],
            'ai_analysis': ai_analysis
        }
        with open("security_report.json", "w", encoding="utf-8") as f:
            json.dump(report_json, f, indent=2)
            
        self.log("Security report saved to security_report.json", "SUCCESS")
        
    def generate_report(self, ai_analysis):
        """Generate HTML report file"""
        severity_counts = {'Critical': 0, 'High': 0, 'Medium': 0, 'Low': 0}
        for v in self.vulnerabilities:
            sev = v.get('severity', 'Low')
            if sev in severity_counts:
                severity_counts[sev] += 1
                
        html = f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Security Scan Report - {self.base_domain}</title>
    <style>
        body {{ font-family: sans-serif; background: #0f172a; color: #f1f5f9; padding: 20px; }}
        .card {{ background: #1e293b; padding: 25px; border-radius: 8px; margin-bottom: 20px; border: 1px solid #334155; }}
        .badge {{ padding: 3px 10px; border-radius: 4px; font-weight: bold; font-size: 12px; }}
        .badge-critical {{ background: #ef4444; color: white; }}
        .badge-high {{ background: #f97316; color: white; }}
        .badge-medium {{ background: #eab308; color: black; }}
        .badge-low {{ background: #22c55e; color: white; }}
        h1, h2, h3 {{ color: #38bdf8; }}
        table {{ width: 100%; border-collapse: collapse; margin-top: 15px; }}
        th, td {{ padding: 10px; text-align: left; border-bottom: 1px solid #334155; }}
        th {{ background: #0f172a; }}
        pre {{ background: #090d16; padding: 15px; border-radius: 6px; overflow-x: auto; color: #38bdf8; white-space: pre-wrap; }}
    </style>
</head>
<body>
    <div class="card">
        <h1>🔒 Security Scanner Pro Report</h1>
        <p><strong>Target:</strong> {self.target}</p>
        <p><strong>Scan Date:</strong> {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}</p>
    </div>
    
    <div class="card">
        <h2>📊 Summary Statistics</h2>
        <p>Total Vulnerabilities: <strong>{len(self.vulnerabilities)}</strong></p>
        <ul>
            <li>Critical: <span class="badge badge-critical">{severity_counts['Critical']}</span></li>
            <li>High: <span class="badge badge-high">{severity_counts['High']}</span></li>
            <li>Medium: <span class="badge badge-medium">{severity_counts['Medium']}</span></li>
            <li>Low: <span class="badge badge-low">{severity_counts['Low']}</span></li>
        </ul>
    </div>
    
    <div class="card">
        <h2>🔍 Vulnerability Findings</h2>
        """
        if not self.vulnerabilities:
            html += "<p style='color: #22c55e;'>✓ No immediate vulnerabilities detected!</p>"
        for v in self.vulnerabilities:
            sev_class = f"badge-{v.get('severity', 'Low').lower()}"
            html += f"""
            <div style="border-bottom: 1px solid #334155; padding: 10px 0;">
                <p><strong>{v.get('type')}</strong> <span class="badge {sev_class}">{v.get('severity')}</span></p>
                <p>Url: <code>{v.get('url')}</code></p>
                {f"<p>Parameter: <code>{v.get('parameter')}</code></p>" if v.get('parameter') else ''}
                {f"<p>Payload: <code>{v.get('payload')}</code></p>" if v.get('payload') else ''}
                <p>Details: {v.get('details', 'N/A')}</p>
            </div>
            """
        html += f"""
    </div>
    
    <div class="card">
        <h2>🛡️ Security Headers Audit</h2>
        <table>
            <tr><th>Header</th><th>Status</th></tr>
        """
        for h, val in self.scan_results['security_headers'].items():
            status = f"<span style='color: #22c55e;'>✓ {val}</span>" if val != 'MISSING' else "<span style='color: #ef4444;'>Missing</span>"
            html += f"<tr><td>{h}</td><td>{status}</td></tr>"
            
        html += f"""
        </table>
    </div>
    
    <div class="card">
        <h2>🌐 Open Ports Discovery</h2>
        <table>
            <tr><th>Port</th><th>State</th><th>Service</th></tr>
        """
        for p in self.scan_results['port_scan']:
            html += f"<tr><td>{p['port']}</td><td>{p['state']}</td><td>{p['service']}</td></tr>"
        if not self.scan_results['port_scan']:
            html += "<tr><td colspan='3'>No open ports detected.</td></tr>"
            
        html += f"""
        </table>
    </div>
    
    <div class="card">
        <h2>🧠 AI Deep Forensic Analysis</h2>
        <div>{f"<pre>{ai_analysis}</pre>" if ai_analysis else "<p>No AI analysis was executed.</p>"}</div>
    </div>
</body>
</html>
"""
        with open("security_report.html", "w", encoding="utf-8") as f:
            f.write(html)

if __name__ == "__main__":
    target = "http://localhost:3000"
    if len(sys.argv) > 1:
        target = sys.argv[1]
    tester = SecurityTester(target)
    tester.run_full_scan()
