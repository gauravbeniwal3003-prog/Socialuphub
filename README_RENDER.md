# 🚀 SocialUpHub Render Deployment Guide

This guide contains everything you need to deploy, configure, and synchronize your high-performance, real-time Python service backend on **Render**, keeping your client-side application 100% serverless, secure, and fast!

---

## 🛠️ Deployment Step-by-Step

### 1. Create a Render Account
1. Visit [Render.com](https://render.com) and sign up with GitHub/GitLab or Email.
2. Go to the **Dashboard** and click **New** ➡️ **Web Service**.

### 2. Connect Your Repository
* Connect the repository where your `render_backend.py` and `requirements.txt` are hosted, or upload the codebase.

### 3. Service Configuration & Architecture
Fill in the following details in the Render deployment wizard:

*   **Name**: `socialuphub-backend` (or any name you prefer)
*   **Language**: `Python`
*   **Branch**: `main` (or your active development branch)
*   **Build Command**: `pip install -r requirements.txt`
*   **Start Command**: `gunicorn render_backend:app` (Make sure `gunicorn` is listed in your `requirements.txt`)

---

## 🔑 Environment Variables Configuration

To keep your credentials completely hidden from the browser and securely cached, click on the **Environment** tab inside your Render Web Service dashboard and declare the following Key-Value pairs:

| Variable Name | Description | Example Value |
| :--- | :--- | :--- |
| `SUPABASE_URL` | Your Supabase Project Web URL | `https://igkrcgcrvnocauccebrf.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin (Service Role) API Key | *Get this from Supabase Dashboard -> API settings* |
| `SMM_API_KEY` | Your Secure SMM Provider API Key | *Your SMM platform API key* |
| `SMM_API_URL` | SMM Provider API Endpoint | `https://safesmmpanel.com/api/v2` |

---

## 📡 Linking Your Frontend to the Render Backend

Once your Render Web Service deploys successfully, Render will provide you with a live URL (e.g. `https://socialuphub-backend.onrender.com`).

**How to sync:**
1. Log in to your **Admin Panel** on the platform.
2. Select the **Settings** (System Configuration) tab.
3. Locate **Live Render Backend URL** under **System Controls**.
4. Paste your live Render URL (`https://socialuphub-backend.onrender.com`) and click **Save System Configuration**.

---

## ✨ Automated Features Managed by Python Background threads
Your `render_backend.py` hosts multi-threaded background loops that run forever, freeing up admin/user devices:
*   **Auto-Forwarding**: Checks for pending user orders and forwards them immediately to SMM APIs.
*   **Auto-Status Checker**: Constantly updates order streams (Pending ➡️ Completed/Canceled).
*   **Auto-Rates Synchronization**: Routinely pulls latest provider rates hourly.
*   **Daily Maintenance purges**: Safely cleanses systemic resources every 24 hours.
